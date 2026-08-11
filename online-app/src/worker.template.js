const DEFAULT_CONFIG = __DEFAULT_CONFIG__;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_PROVIDER_JSON_BYTES = 1024 * 1024;
const VISITOR_COOKIE = 'qiju_visitor';
const INVITE_COOKIE = 'qiju_invite';
const ROOM_AREA_PROMPT_KEYS = {
  under_10: 'small',
  '10_20': 'medium_small',
  '20_30': 'medium',
  over_30: 'large',
  unknown: 'auto',
};
const BUDGET_PROMPT_KEYS = {
  zero: '0',
  under_500: 'low',
  '500_2000': 'mid',
  over_2000: 'high',
};
const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ROOM_ANALYSIS_PROMPT = `请识别并分析这张居住空间照片。只返回一个合法 JSON 对象，不要使用 Markdown。
必须包含：
- is_room：布尔值，照片是否清楚呈现真实室内房间
- confidence：0 到 1 的数字
- reason：识别理由，简短中文
- room_state：rough、finished 或 unknown；毛坯/未完工为 rough
- has_bed：布尔值，房间内是否有床
- cleanliness：整洁度评价
- furniture：家具布局评价
- lighting：光线通风评价
- color：色彩搭配评价
- score：1 到 10 的数字
- advice：3 到 5 条具体改进建议组成的数组
如果不是房间，仍返回前五个识别字段，其余分析字段可为空。`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
  });
}

function apiError(message, status = 400, extra = {}) {
  return json({error: message, ...extra}, status);
}

function parseCookies(request) {
  const result = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function requestContext(request, url) {
  const cookies = parseCookies(request);
  let visitor = cookies[VISITOR_COOKIE];
  const setCookies = [];
  if (!/^[a-f0-9-]{36}$/.test(visitor || '')) {
    visitor = crypto.randomUUID();
    setCookies.push(`${VISITOR_COOKIE}=${encodeURIComponent(visitor)}; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax`);
  }
  let invite = url.searchParams.get('invite') || cookies[INVITE_COOKIE] || '';
  if (!/^[a-f0-9]{24}$/.test(invite)) invite = '';
  if (url.searchParams.has('invite') && invite) {
    setCookies.push(`${INVITE_COOKIE}=${invite}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`);
  }
  return {visitorId: `visitor:${visitor}`, inviteCode: invite, setCookies};
}

function addCommonHeaders(response, setCookies = []) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-frame-options', 'DENY');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

async function safeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let mismatch = 0;
  for (let index = 0; index < aa.length; index += 1) mismatch |= aa[index] ^ bb[index];
  return mismatch === 0;
}

async function syncAuthorized(request, env) {
  const expected = env.SYNC_TOKEN || '';
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(expected && supplied) && await safeEqual(supplied, expected);
}

async function readTextBounded(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new RangeError('请求体超过大小限制');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError('请求体超过大小限制');
  return text;
}

async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  const text = await readTextBounded(request, maxBytes);
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new TypeError('请求格式无效');
  }
}

function detectImage(bytes, claimedType = '') {
  let mimeType = '';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mimeType = 'image/jpeg';
  else if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mimeType = 'image/png';
  else if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') mimeType = 'image/webp';
  if (!mimeType) throw new TypeError('仅支持 JPEG、PNG 或 WebP 图片');
  if (claimedType && claimedType.toLowerCase() !== mimeType) throw new TypeError('图片类型与内容不一致');
  return mimeType;
}

function decodeImagePayload(payload) {
  if (!payload || typeof payload.image !== 'string' || !payload.image) throw new TypeError('缺少图片');
  if (payload.image.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16) throw new RangeError('图片过大');
  let binary;
  try {
    binary = atob(payload.image);
  } catch {
    throw new TypeError('图片编码无效');
  }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new RangeError('图片为空或超过大小限制');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const mimeType = detectImage(bytes, String(payload.mime_type || ''));
  return {bytes, mimeType};
}

function parseJsonObject(content) {
  if (typeof content !== 'string') throw new Error('图片识别服务返回格式异常');
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('图片识别服务返回格式异常');
  const parsed = JSON.parse(content.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('图片识别服务返回格式异常');
  return parsed;
}

async function providerJson(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_PROVIDER_JSON_BYTES) throw new Error('上游服务返回数据过大');
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_JSON_BYTES) throw new Error('上游服务返回数据过大');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error('上游服务返回格式异常');
  }
}

async function getSiteConfig(env) {
  const saved = await env.CONTENT.get('site/config.json', 'json');
  if (!saved || typeof saved !== 'object') return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    analysis: saved.analysis || DEFAULT_CONFIG.analysis,
    optimization: saved.optimization || DEFAULT_CONFIG.optimization,
    prompt_prefixes: saved.prompt_prefixes || DEFAULT_CONFIG.prompt_prefixes,
    styles: Array.isArray(saved.styles) ? saved.styles : DEFAULT_CONFIG.styles,
  };
}

async function getExperienceAccess(env, context) {
  if (!context.inviteCode) {
    return {required: true, allowed: false, remaining: 0, quota_total: 0, status: 'missing'};
  }
  const row = await env.DB.prepare(
    'SELECT quota_total, quota_used, enabled FROM experience_invites WHERE code = ?'
  ).bind(context.inviteCode).first();
  if (!row) return {required: true, allowed: false, remaining: 0, quota_total: 0, status: 'invalid'};
  const remaining = Math.max(0, Number(row.quota_total) - Number(row.quota_used));
  const allowed = Boolean(row.enabled) && remaining > 0;
  return {
    required: true,
    allowed,
    remaining,
    quota_total: Number(row.quota_total),
    status: allowed ? 'active' : (row.enabled ? 'exhausted' : 'disabled'),
  };
}

async function consumeCredit(env, context) {
  if (!context.inviteCode) return {ok: false, access: await getExperienceAccess(env, context)};
  const result = await env.DB.prepare(`
    UPDATE experience_invites SET quota_used = quota_used + 1
    WHERE code = ? AND enabled = 1 AND quota_used < quota_total
  `).bind(context.inviteCode).run();
  return {ok: Number(result.meta?.changes || 0) === 1, access: await getExperienceAccess(env, context)};
}

async function refundCredit(env, code) {
  if (!/^[a-f0-9]{24}$/.test(code || '')) return false;
  const result = await env.DB.prepare(
    'UPDATE experience_invites SET quota_used = quota_used - 1 WHERE code = ? AND quota_used > 0'
  ).bind(code).run();
  return Number(result.meta?.changes || 0) === 1;
}

function quotaResponse(access) {
  const messages = {
    missing: '请使用管理员发送的专属体验链接',
    invalid: '请使用管理员发送的专属体验链接',
    disabled: '该体验链接已被停用',
    exhausted: '该体验链接的 AI 体验额度已用完',
  };
  return apiError(messages[access.status] || '体验权限不可用', 403, {experience_access: access});
}

async function recordUsage(env, visitorId, eventType, details = null) {
  await env.DB.prepare(
    'INSERT INTO usage_events (id, visitor_id, event_type, created_at, details) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID().replaceAll('-', ''), visitorId, eventType, Date.now(), details ? JSON.stringify(details) : null).run();
}

async function callVision(env, bytes, mimeType) {
  if (!env.ALIYUN_API_KEY) throw new Error('服务器尚未配置图片分析服务');
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {authorization: `Bearer ${env.ALIYUN_API_KEY}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      model: env.ALIYUN_MODEL || 'qwen-vl-plus',
      messages: [{role: 'user', content: [
        {type: 'text', text: ROOM_ANALYSIS_PROMPT},
        {type: 'image_url', image_url: {url: `data:${mimeType};base64,${btoa(binary)}`}},
      ]}],
      max_tokens: 1200,
    }),
  });
  const data = await providerJson(response);
  if (!response.ok) {
    console.error(JSON.stringify({event: 'vision_error', status: response.status, message: data?.error?.message || data?.message || ''}));
    throw new Error('图片识别服务暂时不可用');
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('图片识别服务返回格式异常');
  return parseJsonObject(content);
}

function normalizeRoomAnalysis(result, config) {
  const confidence = Number(result.confidence || 0);
  const accepted = result.is_room === true && confidence >= 0.72;
  let roomState = String(result.room_state || 'unknown').toLowerCase();
  if (!['rough', 'finished', 'unknown'].includes(roomState)) roomState = 'unknown';
  const hasBed = typeof result.has_bed === 'boolean' ? result.has_bed : true;
  const budgetEnabled = roomState !== 'rough' && hasBed;
  const restrictionReason = roomState === 'rough'
    ? '检测到房间为毛坯或未完工状态，无需选择预算'
    : (!hasBed ? '检测到房间内没有床，无需选择预算' : '');
  const analysis = {};
  for (const dimension of config.analysis?.dimensions || []) {
    analysis[dimension.key] = String(result[dimension.key] || '暂无评价').slice(0, 500);
  }
  const score = Math.min(10, Math.max(1, Number(result.score || 5)));
  analysis.score = Number.isFinite(score) ? score : 5;
  analysis.advice = Array.isArray(result.advice)
    ? result.advice.slice(0, 5).map(item => String(item).slice(0, 300))
    : [String(result.advice || '保持空间整洁，并逐步改善照明与收纳。').slice(0, 300)];
  return {
    accepted,
    confidence,
    reason: String(result.reason || '').slice(0, 200),
    profile: {room_state: roomState, has_bed: hasBed, budget_enabled: budgetEnabled, restriction_reason: restrictionReason},
    analysis,
  };
}

async function handlePublicConfig(env, context) {
  const config = await getSiteConfig(env);
  return json({
    analysis: config.analysis || {},
    styles: config.styles || [],
    features: {item_analysis: false},
    experience_access: await getExperienceAccess(env, context),
  });
}

async function handleAnalyze(request, env, context) {
  const currentAccess = await getExperienceAccess(env, context);
  if (!currentAccess.allowed) return quotaResponse(currentAccess);
  const payload = await readJson(request);
  const {bytes, mimeType} = decodeImagePayload(payload);
  const config = await getSiteConfig(env);
  const providerResult = await callVision(env, bytes, mimeType);
  const normalized = normalizeRoomAnalysis(providerResult, config);
  if (!normalized.accepted) {
    console.log(JSON.stringify({event: 'room_rejected', confidence: normalized.confidence, reason: normalized.reason}));
    return apiError('照片不符合要求，请重新上传一张能清楚看到室内空间的房间照片', 422, {code: 'invalid_room_photo'});
  }
  const consumed = await consumeCredit(env, context);
  if (!consumed.ok) return quotaResponse(consumed.access);
  const id = crypto.randomUUID().replaceAll('-', '');
  const imageKey = `history/${context.visitorId}/${id}`;
  await env.CONTENT.put(imageKey, bytes, {metadata: {contentType: mimeType}});
  const content = JSON.stringify(normalized.analysis);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO analyses
        (id, visitor_id, created_at, content, score, mime_type, image_key, room_state, has_bed, budget_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, context.visitorId, Date.now(), content, normalized.analysis.score, mimeType, imageKey,
          normalized.profile.room_state, normalized.profile.has_bed ? 1 : 0, normalized.profile.budget_enabled ? 1 : 0),
      env.DB.prepare('INSERT INTO usage_events (id, visitor_id, event_type, created_at, details) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID().replaceAll('-', ''), context.visitorId, 'analysis', Date.now(), JSON.stringify({score: normalized.analysis.score, analysis_id: id})),
    ]);
  } catch (error) {
    await refundCredit(env, context.inviteCode);
    await env.CONTENT.delete(imageKey);
    throw error;
  }
  return json({content, history_id: id, room_profile: normalized.profile, experience_access: consumed.access});
}

function buildPrompt(config, styleId, roomArea, budget, budgetEnabled) {
  const prefixes = config.prompt_prefixes || {};
  const parts = [];
  const areaPromptKey = ROOM_AREA_PROMPT_KEYS[roomArea];
  const budgetPromptKey = BUDGET_PROMPT_KEYS[budget];
  if (areaPromptKey && prefixes.area?.[areaPromptKey]) parts.push(prefixes.area[areaPromptKey]);
  if (budgetEnabled && budgetPromptKey && prefixes.budget?.[budgetPromptKey]) parts.push(prefixes.budget[budgetPromptKey]);
  if (styleId === 'smart') {
    parts.push(config.optimization?.smart_prompt || '保持原有房间结构与视角，优化布局、采光、收纳和软装。');
    return {prompt: parts.join('\n\n'), styleName: '智能优化'};
  }
  const style = (config.styles || []).find(item => item.id === styleId);
  if (!style) throw new TypeError('装修风格无效');
  parts.push(style.prompt || style.description || style.name);
  return {prompt: parts.join('\n\n'), styleName: style.name};
}

async function signProviderPath(env, taskId) {
  if (!env.UPLOAD_SIGNING_SECRET) throw new Error('服务器尚未配置上传签名');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.UPLOAD_SIGNING_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(taskId));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function handleGenerate(request, env, context, url) {
  const currentAccess = await getExperienceAccess(env, context);
  if (!currentAccess.allowed) return quotaResponse(currentAccess);
  if (!env.GRSAI_API_KEY) return apiError('服务器尚未配置效果图生成服务', 503);
  const payload = await readJson(request);
  const {bytes, mimeType} = decodeImagePayload(payload);
  const styleId = String(payload.style_id || '');
  const historyId = /^[a-f0-9]{32}$/.test(String(payload.history_id || '')) ? String(payload.history_id) : '';
  let roomArea = String(payload.room_area || '');
  let budget = String(payload.budget || '');
  let analysis = null;
  if (historyId) {
    analysis = await env.DB.prepare(
      'SELECT score, budget_enabled, image_key FROM analyses WHERE id = ? AND visitor_id = ?'
    ).bind(historyId, context.visitorId).first();
  }
  const budgetEnabled = analysis ? Boolean(analysis.budget_enabled) : true;
  if (!budgetEnabled) budget = '';
  const hasContext = Boolean(ROOM_AREA_PROMPT_KEYS[roomArea]) && (!budgetEnabled || Boolean(BUDGET_PROMPT_KEYS[budget]));
  if (styleId !== 'smart' && !hasContext) {
    return apiError(budgetEnabled ? '请输入面积与预算' : '请选择面积');
  }
  const config = await getSiteConfig(env);
  if (styleId === 'smart' && budgetEnabled && analysis && Number(analysis.score) >= Number(config.analysis?.high_score_threshold || 8)) {
    return apiError('当前空间评分较高，无需智能优化，可尝试选择一种风格');
  }
  const {prompt, styleName} = buildPrompt(config, styleId, roomArea, budget, budgetEnabled);
  const localTaskId = crypto.randomUUID().replaceAll('-', '');
  const sourceKey = analysis?.image_key || `source/${context.visitorId}/${localTaskId}`;
  if (!analysis?.image_key) await env.CONTENT.put(sourceKey, bytes, {expirationTtl: 3600, metadata: {contentType: mimeType}});
  const consumed = await consumeCredit(env, context);
  if (!consumed.ok) {
    if (!analysis?.image_key) await env.CONTENT.delete(sourceKey);
    return quotaResponse(consumed.access);
  }
  await env.DB.prepare(`INSERT INTO generation_tasks
    (id, visitor_id, analysis_id, style_id, style_name, source_key, source_mime_type, room_area, budget, invite_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(localTaskId, context.visitorId, historyId || null, styleId, styleName, sourceKey, mimeType,
      hasContext ? roomArea : 'unknown', hasContext && budgetEnabled ? budget : 'unspecified', context.inviteCode || null, Date.now()).run();
  const signature = await signProviderPath(env, localTaskId);
  const sourceUrl = `${url.origin}/media/provider/${localTaskId}?sig=${signature}`;
  const response = await fetch(env.GENERATION_API_URL || 'https://grsai.dakka.com.cn/v1/draw/nano-banana', {
    method: 'POST',
    headers: {authorization: `Bearer ${env.GRSAI_API_KEY}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      prompt,
      urls: [sourceUrl],
      aspectRatio: 'auto',
      imageSize: '1K',
      webHook: '-1',
      shutProgress: false,
    }),
  });
  const result = await providerJson(response);
  if (!response.ok) {
    await refundCredit(env, context.inviteCode);
    await env.DB.prepare('UPDATE generation_tasks SET status = ?, error_message = ? WHERE id = ?')
      .bind('failed', providerError(result, '效果图生成服务暂时不可用'), localTaskId).run();
    return apiError(providerError(result, '效果图生成服务暂时不可用'), 502);
  }
  const resultData = result?.data && typeof result.data === 'object' ? result.data : {};
  const providerTaskId = result.id || result.task_id || resultData.id || resultData.task_id || '';
  const immediateImageUrl = extractImageUrl(result);
  if (!providerTaskId && !immediateImageUrl) {
    await refundCredit(env, context.inviteCode);
    const message = providerError(result, '生成服务未返回任务编号');
    await env.DB.prepare('UPDATE generation_tasks SET status = ?, error_message = ? WHERE id = ?').bind('failed', message, localTaskId).run();
    return apiError(message, 502);
  }
  await env.DB.prepare('UPDATE generation_tasks SET provider_task_id = ?, immediate_image_url = ? WHERE id = ?')
    .bind(String(providerTaskId || ''), immediateImageUrl || null, localTaskId).run();
  return json({success: true, task_id: localTaskId, experience_access: consumed.access});
}

function extractImageUrl(result) {
  const data = result?.data;
  if (data && typeof data === 'object' && Array.isArray(data.results) && data.results.length) {
    return typeof data.results[0] === 'string' ? data.results[0] : data.results[0]?.url;
  }
  if (result?.result && typeof result.result === 'object') {
    return result.result.url || result.result.image_url || result.result.imageUrl || result.result.images?.[0];
  }
  if (Array.isArray(data) && data[0]) return data[0].url;
  return data?.url || result?.url || '';
}

function providerError(result, fallback) {
  const error = result?.error;
  const value = (typeof error === 'object' ? (error.message || error.detail || error.error) : error)
    || result?.data?.error?.message || result?.data?.error || result?.data?.message || result?.message || result?.msg || fallback;
  return String(value || fallback).slice(0, 300);
}

async function fetchGeneratedImage(imageUrl) {
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== 'https:') throw new Error('生成图片地址无效');
  const response = await fetch(parsed.toString(), {redirect: 'follow'});
  if (!response.ok) throw new Error('生成图片下载失败');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error('生成图片超过大小限制');
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('生成图片大小无效');
  const bytes = new Uint8Array(buffer);
  const mimeType = detectImage(bytes, '');
  return {bytes, mimeType};
}

async function completeTask(env, task, imageUrl) {
  let imageKey = null;
  let mimeType = null;
  let storedUrl = imageUrl;
  try {
    const image = await fetchGeneratedImage(imageUrl);
    imageKey = `generated/${task.visitor_id}/${task.id}`;
    mimeType = image.mimeType;
    await env.CONTENT.put(imageKey, image.bytes, {metadata: {contentType: mimeType}});
    storedUrl = `/generated/${task.id}/image`;
  } catch (error) {
    console.error(JSON.stringify({event: 'generated_image_store_failed', task_id: task.id, message: String(error.message || error)}));
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT OR REPLACE INTO optimizations
      (id, analysis_id, visitor_id, created_at, style_id, style_name, mime_type, image_key, image_url, room_area, budget)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(task.id, task.analysis_id, task.visitor_id, Date.now(), task.style_id, task.style_name,
        mimeType, imageKey, imageKey ? null : imageUrl, task.room_area, task.budget),
    env.DB.prepare('UPDATE generation_tasks SET status = ? WHERE id = ?').bind('completed', task.id),
    env.DB.prepare('INSERT INTO usage_events (id, visitor_id, event_type, created_at, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID().replaceAll('-', ''), task.visitor_id, 'optimization', Date.now(), JSON.stringify({task_id: task.id, style_id: task.style_id})),
  ]);
  if (task.source_key?.startsWith('source/')) await env.CONTENT.delete(task.source_key);
  return {
    id: task.id,
    analysis_id: task.analysis_id,
    style_id: task.style_id,
    style_name: task.style_name,
    room_area: task.room_area,
    budget: task.budget,
    budget_label: task.budget,
    image_url: storedUrl,
  };
}

async function handleStatus(env, context, url) {
  const taskId = String(url.searchParams.get('task_id') || '');
  if (!/^[a-f0-9]{32}$/.test(taskId)) return apiError('缺少任务编号');
  const task = await env.DB.prepare('SELECT * FROM generation_tasks WHERE id = ? AND visitor_id = ?')
    .bind(taskId, context.visitorId).first();
  if (!task) return apiError('任务不存在或已经过期', 404);
  if (task.status === 'completed') {
    const optimization = await env.DB.prepare('SELECT * FROM optimizations WHERE id = ?').bind(task.id).first();
    return json({status: 'completed', progress: 100, image_url: optimization?.image_key ? `/generated/${task.id}/image` : optimization?.image_url, optimization});
  }
  if (task.status === 'failed') return json({status: 'failed', progress: 0, error: task.error_message || '效果图生成失败'});
  let result;
  if (task.immediate_image_url) {
    result = {status: 'completed', progress: 100, url: task.immediate_image_url};
  } else {
    const response = await fetch(env.GENERATION_STATUS_URL || 'https://grsai.dakka.com.cn/v1/draw/result', {
      method: 'POST',
      headers: {authorization: `Bearer ${env.GRSAI_API_KEY}`, 'content-type': 'application/json'},
      body: JSON.stringify({id: task.provider_task_id}),
    });
    result = await providerJson(response);
    if (!response.ok) return apiError('暂时无法查询生成状态', 502);
  }
  const data = result?.data && typeof result.data === 'object' ? result.data : {};
  const status = result.status || data.status || 'unknown';
  const progress = Number(result.progress ?? data.progress ?? 0);
  if (['completed', 'SUCCESS', 'succeeded'].includes(status)) {
    const imageUrl = extractImageUrl(result);
    if (!imageUrl) {
      await env.DB.prepare('UPDATE generation_tasks SET status = ?, error_message = ? WHERE id = ?')
        .bind('failed', '任务完成但未返回图片', task.id).run();
      return json({status: 'failed', progress, error: '任务完成但未返回图片'});
    }
    const optimization = await completeTask(env, task, imageUrl);
    return json({status: 'completed', progress: 100, image_url: optimization.image_url, optimization});
  }
  if (['failed', 'FAILED'].includes(status)) {
    const message = providerError(result, '效果图生成失败');
    await env.DB.prepare('UPDATE generation_tasks SET status = ?, error_message = ? WHERE id = ?')
      .bind('failed', message, task.id).run();
    await refundCredit(env, task.invite_code);
    if (task.source_key?.startsWith('source/')) await env.CONTENT.delete(task.source_key);
    return json({status: 'failed', progress, error: message, credit_refunded: true});
  }
  return json({status, progress});
}

async function handleHistory(env, context) {
  const analyses = (await env.DB.prepare(`SELECT id, created_at, content, score, room_area, budget, room_state, has_bed, budget_enabled
    FROM analyses WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 30`).bind(context.visitorId).all()).results || [];
  const optimizations = (await env.DB.prepare(`SELECT id, analysis_id, created_at, style_id, style_name, room_area, budget, image_key, image_url
    FROM optimizations WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 100`).bind(context.visitorId).all()).results || [];
  const byAnalysis = new Map();
  for (const item of optimizations) {
    if (!byAnalysis.has(item.analysis_id)) byAnalysis.set(item.analysis_id, []);
    byAnalysis.get(item.analysis_id).push({
      ...item,
      image_url: item.image_key ? `/generated/${item.id}/image` : item.image_url,
      budget_label: item.budget,
    });
  }
  return json({items: analyses.map(item => ({
    ...item,
    content: item.content,
    image_url: `/history/${item.id}/image`,
    optimizations: byAnalysis.get(item.id) || [],
  }))});
}

async function handleOwnedMedia(env, context, kind, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response('Not found', {status: 404});
  const table = kind === 'analysis' ? 'analyses' : 'optimizations';
  const row = await env.DB.prepare(`SELECT image_key, mime_type FROM ${table} WHERE id = ? AND visitor_id = ?`)
    .bind(id, context.visitorId).first();
  if (!row?.image_key) return new Response('Not found', {status: 404});
  const value = await env.CONTENT.getWithMetadata(row.image_key, 'arrayBuffer');
  if (!value.value) return new Response('Not found', {status: 404});
  return new Response(value.value, {headers: {'content-type': value.metadata?.contentType || row.mime_type || 'application/octet-stream', 'cache-control': 'private, no-store'}});
}

async function handleProviderMedia(request, env, taskId, url) {
  if (!/^[a-f0-9]{32}$/.test(taskId)) return new Response('Not found', {status: 404});
  const expected = await signProviderPath(env, taskId);
  if (!await safeEqual(String(url.searchParams.get('sig') || ''), expected)) return new Response('Forbidden', {status: 403});
  const task = await env.DB.prepare('SELECT source_key, source_mime_type, created_at FROM generation_tasks WHERE id = ?').bind(taskId).first();
  if (!task || Number(task.created_at) < Date.now() - 3600000) return new Response('Not found', {status: 404});
  const value = await env.CONTENT.get(task.source_key, 'arrayBuffer');
  if (!value) return new Response('Not found', {status: 404});
  return new Response(request.method === 'HEAD' ? null : value, {headers: {'content-type': task.source_mime_type, 'cache-control': 'private, no-store'}});
}

async function handleDemoContent(env, request, pathname) {
  let key = '';
  if (pathname === '/demo/cases.json') key = 'demo/cases.json';
  else if (pathname === '/demo/flow.json') key = 'demo/flow.json';
  else if (/^\/demo\/assets\/[a-zA-Z0-9._-]+$/.test(pathname)) key = pathname.slice(1);
  if (!key) return null;
  const value = await env.CONTENT.getWithMetadata(key, 'arrayBuffer');
  if (!value.value) return null;
  const fallbackType = key.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream';
  return new Response(request.method === 'HEAD' ? null : value.value, {
    headers: {'content-type': value.metadata?.contentType || fallbackType, 'cache-control': key.endsWith('.json') ? 'no-store' : 'public, max-age=3600'},
  });
}

function cleanSyncedConfig(config) {
  if (!config || typeof config !== 'object') throw new TypeError('网站配置无效');
  return {
    analysis: config.analysis || DEFAULT_CONFIG.analysis,
    optimization: config.optimization || DEFAULT_CONFIG.optimization,
    prompt_prefixes: config.prompt_prefixes || DEFAULT_CONFIG.prompt_prefixes,
    styles: Array.isArray(config.styles) ? config.styles.slice(0, 20) : DEFAULT_CONFIG.styles,
  };
}

async function handleSync(request, env, pathname) {
  if (!await syncAuthorized(request, env)) return apiError('未授权', 401);
  if (request.method !== 'PUT') return apiError('不支持的操作', 405);
  if (pathname === '/api/sync/cases' || pathname === '/api/sync/flow') {
    const text = await readTextBounded(request, 1024 * 1024);
    const parsed = JSON.parse(text || '{}');
    if (pathname.endsWith('/cases') && !Array.isArray(parsed.items)) throw new TypeError('案例配置无效');
    await env.CONTENT.put(pathname.endsWith('/cases') ? 'demo/cases.json' : 'demo/flow.json', JSON.stringify(parsed), {metadata: {contentType: 'application/json; charset=utf-8'}});
    return json({ok: true});
  }
  if (pathname === '/api/sync/site') {
    const payload = await readJson(request, 2 * 1024 * 1024);
    const config = cleanSyncedConfig(payload.config);
    const invites = Array.isArray(payload.invites) ? payload.invites.slice(0, 500) : [];
    await env.CONTENT.put('site/config.json', JSON.stringify(config), {metadata: {contentType: 'application/json; charset=utf-8'}});
    const statements = [env.DB.prepare('UPDATE experience_invites SET enabled = 0')];
    for (const invite of invites) {
      const code = String(invite.code || '');
      if (!/^[a-f0-9]{24}$/.test(code)) continue;
      const total = Math.max(0, Math.min(100, Number(invite.quota_total) || 0));
      const remaining = Math.max(0, Math.min(total, Number(invite.remaining) || 0));
      const used = total - remaining;
      statements.push(env.DB.prepare(`INSERT INTO experience_invites
        (code, label, quota_total, quota_used, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET label = excluded.label, quota_total = excluded.quota_total,
        quota_used = excluded.quota_used, enabled = excluded.enabled`)
        .bind(code, String(invite.label || '体验者').slice(0, 50), total, used, invite.enabled ? 1 : 0, Number(invite.created_at) || Date.now()));
    }
    await env.DB.batch(statements);
    return json({ok: true, invites: invites.length, public_url: new URL(request.url).origin});
  }
  const assetMatch = pathname.match(/^\/api\/sync\/(assets\/(?:case-[1-3]-(?:original|smart|style-[a-z0-9-]+)|flow-(?:original|result))\.(?:jpg|png|webp))$/);
  if (!assetMatch) return apiError('同步路径无效', 404);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_IMAGE_BYTES) throw new RangeError('图片大小无效');
  const buffer = await request.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) throw new RangeError('图片大小无效');
  const bytes = new Uint8Array(buffer);
  const mimeType = detectImage(bytes, request.headers.get('content-type') || '');
  await env.CONTENT.put(`demo/${assetMatch[1]}`, bytes, {metadata: {contentType: mimeType}});
  return json({ok: true, path: assetMatch[1]});
}

async function routeRequest(request, env, context, url) {
  const pathname = decodeURIComponent(url.pathname);
  if (request.method === 'OPTIONS') return new Response(null, {status: 204});
  if (pathname === '/api/public-config' && request.method === 'GET') return handlePublicConfig(env, context);
  if (pathname === '/api/analyze' && request.method === 'POST') return handleAnalyze(request, env, context);
  if (pathname === '/api/generate' && request.method === 'POST') return handleGenerate(request, env, context, url);
  if (pathname === '/api/status' && request.method === 'GET') return handleStatus(env, context, url);
  if (pathname === '/api/history' && request.method === 'GET') return handleHistory(env, context);
  if (pathname === '/api/items') return new Response('Not found', {status: 404});
  if (pathname.startsWith('/api/sync/')) return handleSync(request, env, pathname);
  const analysisMatch = pathname.match(/^\/history\/([a-f0-9]{32})\/image$/);
  if (analysisMatch) return handleOwnedMedia(env, context, 'analysis', analysisMatch[1]);
  const generatedMatch = pathname.match(/^\/generated\/([a-f0-9]{32})\/image$/);
  if (generatedMatch) return handleOwnedMedia(env, context, 'optimization', generatedMatch[1]);
  const providerMatch = pathname.match(/^\/media\/provider\/([a-f0-9]{32})$/);
  if (providerMatch && ['GET', 'HEAD'].includes(request.method)) return handleProviderMedia(request, env, providerMatch[1], url);
  const demo = await handleDemoContent(env, request, pathname);
  if (demo) return demo;
  if (pathname === '/demo') return Response.redirect(`${url.origin}/demo/`, 308);
  if (!['GET', 'HEAD'].includes(request.method)) return apiError('不支持的操作', 405);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = requestContext(request, url);
    try {
      const response = await routeRequest(request, env, context, url);
      return addCommonHeaders(response, context.setCookies);
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error(JSON.stringify({event: 'request_failed', request_id: requestId, path: url.pathname, message: String(error?.message || error)}));
      const status = error instanceof RangeError ? 413 : (error instanceof TypeError || error instanceof SyntaxError ? 400 : 500);
      return addCommonHeaders(apiError(status === 500 ? `服务暂时不可用（${requestId}）` : error.message, status), context.setCookies);
    }
  },
};
