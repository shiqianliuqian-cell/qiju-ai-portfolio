const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const previewImage = document.getElementById('previewImage');
const analyzeBtn = document.getElementById('analyzeBtn');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const result = document.getElementById('result');
const resultContent = document.getElementById('resultContent');
const errorSection = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const styleSection = document.getElementById('style-section');
const styleList = document.getElementById('styleList');
const resultStyleList = document.getElementById('resultStyleList');
const generateBtn = document.getElementById('generateBtn');
const resultGenerateBtn = document.getElementById('resultGenerateBtn');
const analyzedOriginalImage = document.getElementById('analyzedOriginalImage');
const historyList = document.getElementById('historyList');
const roomAreaSelect = document.getElementById('roomArea');
const optimizationBudgetSelect = document.getElementById('optimizationBudget');
const optimizationRequirement = document.getElementById('optimizationRequirement');
const savedOptimizations = document.getElementById('savedOptimizations');
const savedOptimizationList = document.getElementById('savedOptimizationList');
const generatedImage = document.getElementById('generatedImage');
const resultImage = document.getElementById('resultImage');
const downloadBtn = document.getElementById('downloadBtn');
const itemAnalysisAction = document.getElementById('itemAnalysisAction');
const itemAnalysisBtn = document.getElementById('itemAnalysisBtn');
const itemAnalysisResult = document.getElementById('itemAnalysisResult');
const itemAnalysisImage = document.getElementById('itemAnalysisImage');
const downloadItemAnalysisBtn = document.getElementById('downloadItemAnalysisBtn');
const generatedKicker = document.getElementById('generatedKicker');
const generatedTitle = document.getElementById('generatedTitle');
const generatedDescription = document.getElementById('generatedDescription');
const generatedMeta = document.getElementById('generatedMeta');
const outputDialog = document.getElementById('outputDialog');
const closeOutput = document.getElementById('closeOutput');
const experienceAccessPanel = document.getElementById('experienceAccess');
const experienceAccessTitle = document.getElementById('experienceAccessTitle');
const experienceAccessMessage = document.getElementById('experienceAccessMessage');

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let uploadedImageDataUrl = null;
let selectedStyle = null;
let styles = [];
let config = null;
let currentHistoryId = null;
let currentOptimizationId = null;
let currentGeneratedKind = null;
let currentGeneratedMeta = null;
let currentAnalysisScore = null;
let currentBudgetEnabled = true;
let currentRoomRestrictionReason = '';
let itemAnalysisEnabled = false;
let experienceAccess = {required: true, allowed: false, remaining: 0, status: 'loading'};

document.addEventListener('DOMContentLoaded', initializeApp);
fileInput.addEventListener('change', event => processFile(event.target.files[0]));
roomAreaSelect.addEventListener('change', updateOptimizationAvailability);
optimizationBudgetSelect.addEventListener('change', updateOptimizationAvailability);
analyzeBtn.addEventListener('click', analyzeImage);
generateBtn.addEventListener('click', () => generateImage(selectedStyle?.id || 'smart'));
resultGenerateBtn.addEventListener('click', () => generateImage('smart'));
downloadBtn.addEventListener('click', downloadImage);
itemAnalysisBtn.addEventListener('click', generateItemAnalysis);
downloadItemAnalysisBtn.addEventListener('click', downloadItemAnalysis);
closeOutput.addEventListener('click', closeOutputDialog);
outputDialog.addEventListener('click', event => {
    if (event.target === outputDialog) closeOutputDialog();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && outputDialog.classList.contains('open')) closeOutputDialog();
});

uploadArea.addEventListener('dragover', event => {
    event.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

uploadArea.addEventListener('drop', event => {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    processFile(event.dataTransfer.files[0]);
});

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    let data = {};
    try {
        data = await response.json();
    } catch (_error) {
        data = {};
    }
    if (!response.ok) {
        throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    }
    return data;
}

async function loadConfig() {
    try {
        config = await fetchJson('/api/public-config');
        applyBranding(config.branding);
        itemAnalysisEnabled = config.features?.item_analysis !== false;
        updateItemAnalysisVisibility();
        setExperienceAccess(config.experience_access);
        styles = Array.isArray(config.styles) ? config.styles : [];
        renderStyleList();
    } catch (error) {
        showError(`加载配置失败：${error.message}`);
    }
}

function applyBranding(branding = {}) {
    const siteName = branding.site_name || '空间智改';
    const headerName = branding.header_name || siteName;
    const logoUrl = branding.logo_url || '';
    document.title = `${siteName} · 居住空间分析`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = `${siteName}，用一张照片获得专业的居住空间分析与优化建议。`;
    const brand = document.getElementById('experienceBrand');
    const brandName = document.getElementById('experienceBrandName');
    const mark = document.getElementById('experienceBrandMark');
    const logo = document.getElementById('experienceBrandLogo');
    if (brand) {
        brand.setAttribute('aria-label', `${headerName}首页`);
        brand.classList.toggle('logo-right', branding.logo_position === 'right');
    }
    if (brandName) brandName.textContent = headerName;
    if (mark && logo) {
        mark.classList.toggle('has-image', Boolean(logoUrl));
        logo.hidden = !logoUrl;
        if (logoUrl) logo.src = logoUrl;
        else logo.removeAttribute('src');
    }
}

async function initializeApp() {
    await Promise.all([loadConfig(), loadHistory()]);
}

function canUseExperienceAI() {
    return !experienceAccess.required || experienceAccess.allowed;
}

function setExperienceAccess(access) {
    if (!access) return;
    experienceAccess = access;
    experienceAccessPanel.hidden = !access.required;
    if (access.required) {
        const active = Boolean(access.allowed);
        experienceAccessPanel.classList.toggle('is-locked', !active);
        experienceAccessTitle.textContent = active ? '专属体验额度' : '体验权限不可用';
        if (active) {
            experienceAccessMessage.textContent = `还可进行 ${access.remaining} 次 AI 操作 · 分析与生成各计 1 次`;
        } else if (access.status === 'exhausted') {
            experienceAccessMessage.textContent = '本链接的体验次数已用完，请联系邀请人';
        } else if (access.status === 'disabled') {
            experienceAccessMessage.textContent = '本链接已被邀请人停用';
        } else {
            experienceAccessMessage.textContent = '请使用邀请人发送的专属体验链接';
        }
    }
    updateAnalyzeAvailability();
    updateOptimizationAvailability();
    updateSmartOptimizationAvailability();
}

async function refreshExperienceAccess() {
    try {
        const latest = await fetchJson('/api/public-config');
        setExperienceAccess(latest.experience_access);
    } catch (_error) {
        // Keep the current access state when a transient refresh fails.
    }
}

function renderStyleList() {
    [styleList, resultStyleList].forEach(container => {
        container.replaceChildren();
        styles.forEach(style => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'style-item';
        item.dataset.styleId = style.id;

        const icon = document.createElement('div');
        icon.className = 'style-icon';
        icon.textContent = style.icon || '';

        const info = document.createElement('div');
        info.className = 'style-info';
        const name = document.createElement('div');
        name.className = 'style-name';
        name.textContent = style.name;
        const description = document.createElement('div');
        description.className = 'style-desc';
        description.textContent = style.description || '';
        info.append(name, description);

        const check = document.createElement('div');
        check.className = 'style-check';
        item.append(icon, info, check);
        item.addEventListener('click', () => optimizeWithStyle(style.id));
            container.appendChild(item);
        });
    });
    updateOptimizationAvailability();
}

function selectStyle(styleId) {
    selectedStyle = styles.find(style => style.id === styleId) || null;
    document.querySelectorAll('.style-item').forEach(item => {
        const selected = item.dataset.styleId === styleId;
        item.classList.toggle('selected', selected);
        const check = item.querySelector('.style-check');
        if (check) check.textContent = selected ? '✓' : '';
    });
    generateBtn.disabled = !canUseExperienceAI() || !selectedStyle || !uploadedImageDataUrl;
}

function optimizeWithStyle(styleId) {
    if (!canUseExperienceAI()) {
        showError('当前体验链接没有可用的 AI 次数');
        return;
    }
    if (!hasOptimizationContext()) {
        showError(currentBudgetEnabled ? '请输入面积与预算' : '请选择面积');
        optimizationRequirement.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        return;
    }
    selectStyle(styleId);
    generateImage(styleId);
}

function processFile(file) {
    hideError();
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        showError('仅支持 JPEG、PNG 或 WebP 图片。');
        resetUpload();
        return;
    }
    if (file.size > MAX_FILE_BYTES) {
        showError('图片不能超过 8 MB。');
        resetUpload();
        return;
    }

    const reader = new FileReader();
    reader.onload = event => {
        uploadedImageDataUrl = event.target.result;
        previewImage.src = uploadedImageDataUrl;
        previewImage.style.display = 'block';
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        updateAnalyzeAvailability();
        styleSection.style.display = 'block';
        selectedStyle = null;
        currentHistoryId = null;
        currentAnalysisScore = null;
        applyRoomProfile(null);
        roomAreaSelect.value = '';
        updateOptimizationAvailability();
        generateBtn.disabled = true;
        updateSmartOptimizationAvailability();
        document.querySelectorAll('.style-item').forEach(item => item.classList.remove('selected'));
        hideResult();
        hideGeneratedImage();
    };
    reader.onerror = () => showError('无法读取所选图片。');
    reader.readAsDataURL(file);
}

function resetUpload() {
    uploadedImageDataUrl = null;
    fileInput.value = '';
    analyzeBtn.disabled = true;
    generateBtn.disabled = true;
    resultGenerateBtn.disabled = true;
    analyzedOriginalImage.removeAttribute('src');
    currentHistoryId = null;
    currentAnalysisScore = null;
    applyRoomProfile(null);
    renderSavedOptimizations([]);
}

function updateAnalyzeAvailability() {
    analyzeBtn.disabled = !canUseExperienceAI() || !uploadedImageDataUrl;
}

function hasOptimizationContext() {
    return Boolean(roomAreaSelect.value && (!currentBudgetEnabled || optimizationBudgetSelect.value));
}

function applyRoomProfile(profile) {
    currentBudgetEnabled = profile?.budget_enabled !== false;
    currentRoomRestrictionReason = currentBudgetEnabled ? '' : (
        profile?.restriction_reason || '当前房间无需选择预算'
    );
    optimizationBudgetSelect.disabled = !currentBudgetEnabled;
    optimizationBudgetSelect.closest('.option-field')?.classList.toggle('option-disabled', !currentBudgetEnabled);
    const placeholder = optimizationBudgetSelect.options[0];
    if (placeholder) {
        placeholder.textContent = currentBudgetEnabled ? '请选择预算' : '已根据房间状态停用';
    }
    if (!currentBudgetEnabled) optimizationBudgetSelect.value = '';
}

function updateOptimizationAvailability() {
    const accessReady = canUseExperienceAI();
    const ready = hasOptimizationContext() && accessReady;
    const highScore = currentBudgetEnabled && isHighScoreSpace();
    resultStyleList.querySelectorAll('.style-item').forEach(item => {
        item.disabled = !ready;
        item.classList.toggle('option-locked', !ready);
        item.setAttribute('aria-disabled', String(!ready));
    });
    optimizationRequirement.classList.toggle('ready', ready);
    optimizationRequirement.textContent = !currentBudgetEnabled
        ? (ready
            ? `${currentRoomRestrictionReason}；已选面积，可使用智能改造或任一风格改造。`
            : `${currentRoomRestrictionReason}；请选择面积后使用风格改造，智能改造可直接使用。`)
        : highScore
        ? (ready
            ? '当前空间评分较高，智能优化已关闭；可以选择任一指定风格。'
            : '当前空间已较为宜居；填写面积与预算后，可尝试指定风格。')
        : (ready
            ? '已应用面积与预算条件，可以选择任一指定风格。'
            : '请输入面积与预算后选择指定风格；智能优化可直接使用。');
    updateSmartOptimizationAvailability();
}

function analysisScoreNumber(value) {
    const score = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(score) ? score : null;
}

function isHighScoreSpace() {
    const threshold = Number(config?.analysis?.high_score_threshold ?? 8);
    return currentAnalysisScore !== null && currentAnalysisScore >= threshold;
}

function updateSmartOptimizationAvailability() {
    const highScore = currentBudgetEnabled && isHighScoreSpace();
    resultGenerateBtn.disabled = !canUseExperienceAI() || !uploadedImageDataUrl || highScore;
    resultGenerateBtn.classList.toggle('high-score-locked', highScore);
    const description = resultGenerateBtn.querySelector('small');
    if (description) {
        description.textContent = highScore
            ? '当前空间无需智能优化，可尝试指定风格'
            : 'AI 自主判断，不设定预制风格';
    }
    resultGenerateBtn.setAttribute('aria-disabled', String(resultGenerateBtn.disabled));
}

function imagePayload() {
    if (!uploadedImageDataUrl || !uploadedImageDataUrl.includes(',')) {
        throw new Error('请先上传有效图片');
    }
    const [header, image] = uploadedImageDataUrl.split(',', 2);
    const match = header.match(/^data:(image\/(?:jpeg|png|webp));base64$/i);
    if (!match) throw new Error('图片格式无效');
    return {image, mime_type: match[1].toLowerCase()};
}

async function analyzeImage() {
    try {
        if (!canUseExperienceAI()) throw new Error('当前体验链接没有可用的 AI 次数');
        const payload = imagePayload();
        showLoading('AI 正在确认照片是否为房间...');
        hideResult();
        hideGeneratedImage();
        hideError();
        const data = await fetchJson('/api/analyze', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
        });
        currentHistoryId = data.history_id || null;
        applyRoomProfile(data.room_profile || null);
        setExperienceAccess(data.experience_access);
        showResult(data.content);
        updateOptimizationAvailability();
        loadHistory();
    } catch (error) {
        showError(`分析失败：${error.message}`);
    } finally {
        await refreshExperienceAccess();
        hideLoading();
    }
}

async function generateImage(styleId = 'smart') {
    try {
        if (!canUseExperienceAI()) throw new Error('当前体验链接没有可用的 AI 次数');
        if (styleId === 'smart' && currentBudgetEnabled && isHighScoreSpace()) {
            throw new Error('当前空间评分较高，无需智能优化，可尝试选择一种风格');
        }
        if (styleId !== 'smart' && !hasOptimizationContext()) {
            throw new Error(currentBudgetEnabled ? '请输入面积与预算' : '请选择面积');
        }
        if (styleId === 'smart') {
            selectedStyle = {id: 'smart', name: '智能优化'};
        } else {
            selectedStyle = styles.find(style => style.id === styleId) || null;
            if (!selectedStyle) throw new Error('优化风格无效');
        }
        const includeContext = hasOptimizationContext();
        const payload = {
            ...imagePayload(),
            style_id: styleId,
            history_id: currentHistoryId,
            room_area: includeContext ? roomAreaSelect.value : '',
            budget: includeContext && currentBudgetEnabled ? optimizationBudgetSelect.value : '',
        };
        showLoading(styleId === 'smart' ? 'AI 正在智能优化空间...' : `AI 正在生成${selectedStyle.name}效果...`);
        hideGeneratedImage();
        hideError();
        const data = await fetchJson('/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
        });
        setExperienceAccess(data.experience_access);
        await pollStatus(data.task_id, 'optimization');
    } catch (error) {
        hideLoading();
        showError(`生成失败：${error.message}`);
    } finally {
        await refreshExperienceAccess();
    }
}

async function generateItemAnalysis() {
    try {
        if (!itemAnalysisEnabled) return;
        if (!currentOptimizationId || currentGeneratedKind === 'item_analysis') {
            throw new Error('请先生成或选择一张空间效果图');
        }
        showLoading('AI 正在提取家具与软装单品...');
        hideError();
        itemAnalysisResult.hidden = true;
        itemAnalysisImage.removeAttribute('src');
        const data = await fetchJson('/api/items', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({optimization_id: currentOptimizationId}),
        });
        await pollStatus(data.task_id, 'item_analysis');
    } catch (error) {
        hideLoading();
        showError(`单品分析失败：${error.message}`);
    }
}

async function loadHistory() {
    try {
        const data = await fetchJson('/api/history');
        const items = Array.isArray(data.items) ? data.items : [];
        renderHistory(items);
        const current = items.find(item => item.id === currentHistoryId);
        if (current) renderSavedOptimizations(current.optimizations || []);
        return items;
    } catch (_error) {
        renderHistory([]);
    }
}

function renderHistory(items) {
    historyList.replaceChildren();
    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = '完成首次分析后，可从这里直接继续优化。';
        historyList.appendChild(empty);
        return;
    }
    items.slice(0, 3).forEach(record => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'history-item';
        const image = document.createElement('img');
        image.src = record.image_url;
        image.alt = '';
        const copy = document.createElement('span');
        copy.className = 'history-item-copy';
        const title = document.createElement('strong');
        const optimizationCount = Array.isArray(record.optimizations) ? record.optimizations.length : 0;
        title.textContent = `评分 ${record.score ?? '-'} · ${optimizationCount} 个方案`;
        const time = document.createElement('span');
        time.textContent = new Date(record.created_at).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
        copy.append(title, time);
        button.append(image, copy);
        button.addEventListener('click', () => openHistoryRecord(record));
        historyList.appendChild(button);
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('无法读取历史图片'));
        reader.readAsDataURL(blob);
    });
}

async function openHistoryRecord(record) {
    try {
        showLoading('正在载入历史分析...');
        const response = await fetch(record.image_url);
        if (!response.ok) throw new Error('历史图片不存在');
        uploadedImageDataUrl = await blobToDataUrl(await response.blob());
        currentHistoryId = record.id;
        applyRoomProfile(record.room_profile || null);
        roomAreaSelect.value = record.room_area || '';
        optimizationBudgetSelect.value = currentBudgetEnabled && record.budget !== 'unspecified'
            ? (record.budget || '')
            : '';
        previewImage.src = uploadedImageDataUrl;
        previewImage.style.display = 'block';
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        updateAnalyzeAvailability();
        updateOptimizationAvailability();
        selectedStyle = null;
        updateSmartOptimizationAvailability();
        document.querySelectorAll('.style-item').forEach(item => item.classList.remove('selected'));
        hideGeneratedImage();
        renderSavedOptimizations(record.optimizations || []);
        showResult(record.content);
    } catch (error) {
        showError(`历史记录加载失败：${error.message}`);
    } finally {
        hideLoading();
    }
}

function renderSavedOptimizations(items) {
    const visibleItems = itemAnalysisEnabled
        ? items
        : items.filter(item => item.style_id !== 'item_analysis');
    savedOptimizationList.replaceChildren();
    savedOptimizations.hidden = !visibleItems.length;
    visibleItems.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'saved-optimization-item';
        const image = document.createElement('img');
        image.src = item.image_url;
        image.alt = `${item.style_name || '优化'}方案`;
        const label = document.createElement('span');
        label.className = 'saved-optimization-copy';
        const name = document.createElement('strong');
        name.textContent = item.style_name || '优化方案';
        const budget = document.createElement('small');
        budget.textContent = item.budget_label || '预算未记录';
        label.append(name, budget);
        button.append(image, label);
        button.addEventListener('click', () => showSavedOptimization(item));
        savedOptimizationList.appendChild(button);
    });
}

function showSavedOptimization(item) {
    if (!itemAnalysisEnabled && item.style_id === 'item_analysis') return;
    selectedStyle = {id: item.style_id, name: item.style_name || '优化方案'};
    currentOptimizationId = item.id || null;
    currentGeneratedKind = item.style_id || 'optimization';
    currentGeneratedMeta = item;
    setGeneratedView(currentGeneratedKind, item);
    resultImage.src = item.image_url;
    itemAnalysisResult.hidden = true;
    itemAnalysisImage.removeAttribute('src');
    generatedImage.style.display = 'block';
    window.requestAnimationFrame(() => {
        generatedImage.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
}

function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function pollStatus(taskId, mode = 'optimization') {
    const maxAttempts = 60;
    let maxProgress = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await delay(attempt === 1 ? 2000 : 3000);
        const data = await fetchJson(`/api/status?task_id=${encodeURIComponent(taskId)}`);
        if (Number.isFinite(data.progress) && data.progress > maxProgress) {
            maxProgress = data.progress;
            loadingText.textContent = mode === 'item_analysis'
                ? `AI 正在生成单品分析图... ${maxProgress}%`
                : `AI 正在生成效果图... ${maxProgress}%`;
        }
        if (data.status === 'completed') {
            if (!data.image_url) throw new Error('任务完成但未返回图片');
            if (mode === 'item_analysis') {
                itemAnalysisImage.src = data.image_url;
                itemAnalysisResult.hidden = false;
            } else {
                currentOptimizationId = data.optimization?.id || null;
                currentGeneratedKind = data.optimization?.style_id || 'optimization';
                currentGeneratedMeta = data.optimization || {
                    style_name: selectedStyle?.name || '优化方案',
                    room_area: roomAreaSelect.value || 'unknown',
                    budget: optimizationBudgetSelect.value || 'unspecified',
                };
                setGeneratedView(currentGeneratedKind, currentGeneratedMeta);
                resultImage.src = data.image_url;
                generatedImage.style.display = 'block';
            }
            await loadHistory();
            hideLoading();
            openOutputDialog();
            window.requestAnimationFrame(() => {
                (mode === 'item_analysis' ? itemAnalysisResult : generatedImage)
                    .scrollIntoView({behavior: 'smooth', block: 'start'});
            });
            return;
        }
        if (data.status === 'failed') {
            throw new Error(data.error || '效果图生成失败');
        }
    }
    throw new Error('生成任务超时，请重试');
}

function createResultCard(titleText, contentText, className = 'result-card') {
    const card = document.createElement('div');
    card.className = className;
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = titleText;
    const content = document.createElement('div');
    content.className = className === 'score-card' ? 'score-value' : 'card-content';
    content.textContent = String(contentText ?? '');
    card.append(title, content);
    if (className === 'score-card') {
        const suffix = document.createElement('div');
        suffix.className = 'score-label';
        suffix.textContent = '/ 10 分';
        card.appendChild(suffix);
    }
    return card;
}

function advicePoints(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean);
    }
    const text = String(value || '').trim();
    if (!text) return ['暂无建议'];
    let points = text.split(/[\n；;]+/).map(item => item.trim()).filter(Boolean);
    if (points.length === 1) {
        points = text.split(/[。！？!?]+/).map(item => item.trim()).filter(Boolean);
    }
    return points.length ? points : [text];
}

function createAdviceCard(titleText, advice) {
    const card = document.createElement('section');
    card.className = 'advice-card';
    const heading = document.createElement('div');
    heading.className = 'advice-heading';
    const kicker = document.createElement('span');
    kicker.textContent = 'ACTION PLAN';
    const title = document.createElement('h3');
    title.textContent = titleText;
    heading.append(kicker, title);

    const list = document.createElement('ol');
    list.className = 'advice-list';
    advicePoints(advice).forEach((point, index) => {
        const item = document.createElement('li');
        const number = document.createElement('span');
        number.textContent = String(index + 1).padStart(2, '0');
        const copy = document.createElement('p');
        copy.textContent = point;
        item.append(number, copy);
        list.appendChild(item);
    });
    card.append(heading, list);
    return card;
}

function showResult(content) {
    resultContent.replaceChildren();
    analyzedOriginalImage.src = uploadedImageDataUrl || '';
    try {
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}') + 1;
        if (start < 0 || end <= start) throw new Error('未找到 JSON');
        const resultData = JSON.parse(content.slice(start, end));
        const analysis = config?.analysis || {};
        currentAnalysisScore = analysisScoreNumber(resultData.score);

        const scoreCard = createResultCard(
            analysis.score_label || '舒适度评分', resultData.score ?? '-', 'score-card'
        );
        resultContent.appendChild(scoreCard);
        if (isHighScoreSpace()) {
            const highScoreNotice = document.createElement('p');
            highScoreNotice.className = 'high-score-notice';
            highScoreNotice.textContent = analysis.high_score_message
                || '您的房间已具备良好的整洁度与宜居性，暂时无需智能优化；如果想体验不同的空间氛围，可以尝试选择一种风格进行焕新。';
            resultContent.appendChild(highScoreNotice);
        }

        const issues = document.createElement('section');
        issues.className = 'issues-section';
        const issuesHeading = document.createElement('div');
        issuesHeading.className = 'issues-heading';
        const issuesKicker = document.createElement('span');
        issuesKicker.textContent = 'SPACE DIAGNOSIS';
        const issuesTitle = document.createElement('h3');
        issuesTitle.textContent = '空间问题';
        issuesHeading.append(issuesKicker, issuesTitle);
        const issuesGrid = document.createElement('div');
        issuesGrid.className = 'issues-grid';
        (analysis.dimensions || []).forEach(dimension => {
            issuesGrid.appendChild(
                createResultCard(dimension.name, resultData[dimension.key] || '未评价')
            );
        });
        issues.append(issuesHeading, issuesGrid);
        resultContent.appendChild(issues);
        resultContent.appendChild(
            createAdviceCard(analysis.advice_label || '优化建议', resultData.advice)
        );
    } catch (_error) {
        currentAnalysisScore = null;
        resultContent.appendChild(createResultCard('分析结果', content || '未获得分析结果'));
    }
    updateOptimizationAvailability();
    result.style.display = 'block';
    openOutputDialog();
}

function openOutputDialog() {
    outputDialog.classList.add('open');
    outputDialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dialog-open');
    closeOutput.focus({preventScroll: true});
}

function closeOutputDialog() {
    outputDialog.classList.remove('open');
    outputDialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dialog-open');
}

function downloadImage() {
    if (!resultImage.src) return;
    const link = document.createElement('a');
    link.href = resultImage.src;
    link.download = `效果图_${selectedStyle?.name || '改造'}_${Date.now()}.png`;
    link.rel = 'noopener';
    link.click();
}

function downloadItemAnalysis() {
    if (!itemAnalysisImage.src) return;
    const link = document.createElement('a');
    link.href = itemAnalysisImage.src;
    link.download = `单品分析图_${Date.now()}.png`;
    link.rel = 'noopener';
    link.click();
}

function displayOptionLabel(select, value, fallback) {
    if (!value) return fallback;
    const option = Array.from(select.options).find(item => item.value === value);
    return option?.textContent?.trim() || fallback;
}

function setGeneratedView(kind, metadata = currentGeneratedMeta) {
    const isItemAnalysis = kind === 'item_analysis';
    generatedKicker.textContent = isItemAnalysis ? 'ITEM ANALYSIS' : 'YOUR NEW SPACE';
    generatedTitle.textContent = isItemAnalysis ? '单品分析图' : '你的焕新空间';
    generatedDescription.textContent = isItemAnalysis
        ? '家具与软装单品、用途说明、示意价格及总价清单。'
        : '保留原有结构，重新组织材质、光线与氛围。';
    generatedMeta.replaceChildren();
    if (metadata) {
        const style = document.createElement('span');
        style.textContent = `方案 · ${metadata.style_name || selectedStyle?.name || '智能优化'}`;
        const budget = document.createElement('strong');
        budget.textContent = `预算 · ${metadata.budget_label || displayOptionLabel(optimizationBudgetSelect, metadata.budget, '未设定预算')}`;
        generatedMeta.append(style, budget);
    }
    generatedMeta.hidden = !metadata;
    itemAnalysisAction.hidden = !itemAnalysisEnabled || isItemAnalysis;
    itemAnalysisBtn.disabled = !itemAnalysisEnabled || isItemAnalysis || !currentOptimizationId;
}

function updateItemAnalysisVisibility() {
    itemAnalysisAction.hidden = !itemAnalysisEnabled || currentGeneratedKind === 'item_analysis';
    if (!itemAnalysisEnabled) {
        itemAnalysisResult.hidden = true;
        itemAnalysisImage.removeAttribute('src');
    }
}

function showLoading(text) {
    closeOutputDialog();
    loadingText.textContent = text;
    loading.style.display = 'flex';
    analyzeBtn.disabled = true;
    generateBtn.disabled = true;
    resultGenerateBtn.disabled = true;
    itemAnalysisBtn.disabled = true;
    document.querySelectorAll('.style-item').forEach(item => { item.disabled = true; });
}

function hideLoading() {
    loading.style.display = 'none';
    updateAnalyzeAvailability();
    generateBtn.disabled = !canUseExperienceAI() || !uploadedImageDataUrl || !selectedStyle;
    updateSmartOptimizationAvailability();
    itemAnalysisBtn.disabled = !itemAnalysisEnabled || !currentOptimizationId || currentGeneratedKind === 'item_analysis';
    document.querySelectorAll('.style-item').forEach(item => { item.disabled = false; });
    updateOptimizationAvailability();
}

function hideResult() {
    result.style.display = 'none';
}

function hideGeneratedImage() {
    generatedImage.style.display = 'none';
    resultImage.removeAttribute('src');
    itemAnalysisResult.hidden = true;
    itemAnalysisImage.removeAttribute('src');
    currentOptimizationId = null;
    currentGeneratedKind = null;
    currentGeneratedMeta = null;
    setGeneratedView(null);
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
}

function hideError() {
    errorSection.style.display = 'none';
    errorMessage.textContent = '';
}
