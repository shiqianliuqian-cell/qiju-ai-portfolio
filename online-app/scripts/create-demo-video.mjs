import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const root = path.resolve(import.meta.dirname, '..', '..');
const assetDir = path.join(root, 'static-demo', 'assets');
const outputDir = path.join(root, 'static-demo', 'media');
const frameDir = path.join(outputDir, '.frames');
fs.mkdirSync(frameDir, {recursive: true});

const original = fs.readFileSync(path.join(assetDir, 'flow-original.jpg')).toString('base64');
const result = fs.readFileSync(path.join(assetDir, 'flow-result.png')).toString('base64');
const font = `'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif`;

function shell(content, extra = '') {
  return `<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f6f1"/><stop offset="1" stop-color="#e7e8df"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1f261f" stop-opacity=".08"/><stop offset="1" stop-color="#1f261f" stop-opacity=".78"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#273228" flood-opacity=".14"/></filter>
    <clipPath id="photo"><rect x="54" y="114" width="560" height="536" rx="22"/></clipPath>
    <clipPath id="leftPhoto"><rect x="52" y="138" width="566" height="494" rx="18"/></clipPath>
    <clipPath id="rightPhoto"><rect x="662" y="138" width="566" height="494" rx="18"/></clipPath>
    ${extra}
  </defs>
  <rect width="1280" height="720" fill="url(#paper)"/>
  <circle cx="1130" cy="40" r="260" fill="#a8b49f" opacity=".17"/>
  <g font-family="${font}"><text x="54" y="62" fill="#20251f" font-size="22" font-weight="700" letter-spacing="3">栖居 AI</text><text x="1160" y="61" text-anchor="end" fill="#7b8179" font-size="12" letter-spacing="2">SPACE INTELLIGENCE</text>${content}</g>
  </svg>`;
}

const originalImage = `<image href="data:image/jpeg;base64,${original}" x="54" y="114" width="560" height="536" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>`;
const resultImage = `<image href="data:image/png;base64,${result}" x="662" y="138" width="566" height="494" preserveAspectRatio="xMidYMid slice" clip-path="url(#rightPhoto)"/>`;

const scenes = [
  shell(`<text x="54" y="262" fill="#a35d43" font-size="14" font-weight="700" letter-spacing="4">FROM ONE PHOTO</text>
    <text x="54" y="338" fill="#20251f" font-family="Georgia,${font}" font-size="66">一张照片，</text><text x="54" y="418" fill="#667b69" font-family="Georgia,${font}" font-size="66">看见空间的可能。</text>
    <text x="58" y="476" fill="#666d65" font-size="20">房间识别 · 空间分析 · AI 智能改造</text>
    <rect x="54" y="532" width="322" height="54" rx="5" fill="#435648"/><text x="82" y="566" fill="#fff" font-size="16" font-weight="700">15 秒看懂栖居 AI</text><text x="346" y="567" fill="#fff" font-size="24">→</text>`),
  shell(`${originalImage}<text x="670" y="164" fill="#a35d43" font-size="15" font-weight="700" letter-spacing="3">01 · UPLOAD</text>
    <text x="670" y="229" fill="#20251f" font-family="Georgia,${font}" font-size="48">上传一张房间照片</text>
    <text x="670" y="277" fill="#6c726b" font-size="18">系统首先确认照片是否符合分析要求</text>
    <rect x="670" y="327" width="162" height="44" rx="22" fill="#e1e5dd"/><circle cx="696" cy="349" r="6" fill="#6e9773"/><text x="714" y="356" fill="#4f5c51" font-size="16">识别为卧室</text>
    <rect x="846" y="327" width="120" height="44" rx="22" fill="#e1e5dd"/><text x="906" y="356" text-anchor="middle" fill="#4f5c51" font-size="16">已有床</text>
    <rect x="670" y="441" width="350" height="58" rx="6" fill="#435648" filter="url(#shadow)"/><text x="845" y="478" text-anchor="middle" fill="#fff" font-size="17" font-weight="700">开始空间分析</text>
    <path d="M1000 515c45 10 78 32 98 66" fill="none" stroke="#a35d43" stroke-width="3" stroke-linecap="round"/><circle cx="1099" cy="584" r="18" fill="#a35d43" opacity=".18"/><circle cx="1099" cy="584" r="7" fill="#a35d43"/>`),
  shell(`<text x="54" y="150" fill="#a35d43" font-size="15" font-weight="700" letter-spacing="3">02 · ANALYZE</text>
    <text x="54" y="212" fill="#20251f" font-family="Georgia,${font}" font-size="48">AI 给出空间诊断</text>
    <rect x="54" y="258" width="310" height="344" rx="8" fill="#435648" filter="url(#shadow)"/><text x="86" y="310" fill="#d4ddd4" font-size="14">空间评分</text><text x="84" y="436" fill="#fff" font-family="Georgia" font-size="126">6</text><text x="203" y="435" fill="#cbd3cb" font-size="20">/ 10</text><text x="86" y="508" fill="#edf1ed" font-size="18">具备基本居住条件</text><text x="86" y="543" fill="#cbd3cb" font-size="15">仍有明确提升空间</text>
    <g transform="translate(404 258)"><rect width="374" height="158" rx="8" fill="#fff" opacity=".72"/><text x="28" y="45" fill="#a35d43" font-size="16" font-weight="700">整洁度</text><text x="28" y="82" fill="#4f564f" font-size="18">整体干净，角落有少量杂物</text><rect x="28" y="112" width="264" height="7" rx="4" fill="#e0e2dc"/><rect x="28" y="112" width="198" height="7" rx="4" fill="#667b69"/></g>
    <g transform="translate(804 258)"><rect width="374" height="158" rx="8" fill="#fff" opacity=".72"/><text x="28" y="45" fill="#a35d43" font-size="16" font-weight="700">家具布局</text><text x="28" y="82" fill="#4f564f" font-size="18">布局合理，收纳利用不足</text><rect x="28" y="112" width="264" height="7" rx="4" fill="#e0e2dc"/><rect x="28" y="112" width="176" height="7" rx="4" fill="#667b69"/></g>
    <g transform="translate(404 444)"><rect width="374" height="158" rx="8" fill="#fff" opacity=".72"/><text x="28" y="45" fill="#a35d43" font-size="16" font-weight="700">光线通风</text><text x="28" y="82" fill="#4f564f" font-size="18">自然采光良好，局部照明偏弱</text><rect x="28" y="112" width="264" height="7" rx="4" fill="#e0e2dc"/><rect x="28" y="112" width="211" height="7" rx="4" fill="#667b69"/></g>
    <g transform="translate(804 444)"><rect width="374" height="158" rx="8" fill="#fff" opacity=".72"/><text x="28" y="45" fill="#a35d43" font-size="16" font-weight="700">色彩搭配</text><text x="28" y="82" fill="#4f564f" font-size="18">整体舒适，视觉层次较少</text><rect x="28" y="112" width="264" height="7" rx="4" fill="#e0e2dc"/><rect x="28" y="112" width="168" height="7" rx="4" fill="#667b69"/></g>`),
  shell(`<text x="54" y="170" fill="#a35d43" font-size="15" font-weight="700" letter-spacing="3">03 · SET PREFERENCES</text><text x="54" y="236" fill="#20251f" font-family="Georgia,${font}" font-size="52">只选择两个必要参数</text><text x="54" y="279" fill="#6b716a" font-size="18">面积与预算，让方案更贴近真实需求</text>
    <g transform="translate(54 338)"><rect width="520" height="116" rx="10" fill="#fff" opacity=".78" filter="url(#shadow)"/><text x="28" y="38" fill="#7b817a" font-size="13">房间面积</text><text x="28" y="82" fill="#20251f" font-size="25" font-weight="700">10㎡以下</text><circle cx="474" cy="58" r="20" fill="#e8ebe4"/><path d="m465 55 9 9 12-14" fill="none" stroke="#435648" stroke-width="3"/></g>
    <g transform="translate(606 338)"><rect width="520" height="116" rx="10" fill="#fff" opacity=".78" filter="url(#shadow)"/><text x="28" y="38" fill="#7b817a" font-size="13">改造预算</text><text x="28" y="82" fill="#20251f" font-size="25" font-weight="700">500 元以内</text><circle cx="474" cy="58" r="20" fill="#e8ebe4"/><path d="m465 55 9 9 12-14" fill="none" stroke="#435648" stroke-width="3"/></g>
    <rect x="54" y="500" width="1072" height="64" rx="7" fill="#435648"/><text x="590" y="541" text-anchor="middle" fill="#fff" font-size="18" font-weight="700">智能改造</text><text x="1090" y="542" fill="#fff" font-size="26">→</text>`),
  shell(`<image href="data:image/jpeg;base64,${original}" x="52" y="138" width="566" height="494" preserveAspectRatio="xMidYMid slice" clip-path="url(#leftPhoto)"/>${resultImage}
    <rect x="72" y="158" width="88" height="34" rx="17" fill="#20251f" opacity=".78"/><text x="116" y="181" text-anchor="middle" fill="#fff" font-size="13">改造前</text>
    <rect x="682" y="158" width="88" height="34" rx="17" fill="#435648"/><text x="726" y="181" text-anchor="middle" fill="#fff" font-size="13">改造后</text>
    <rect x="450" y="572" width="380" height="78" rx="8" fill="#f7f6f1" filter="url(#shadow)"/><text x="640" y="605" text-anchor="middle" fill="#a35d43" font-size="13" font-weight="700" letter-spacing="2">AI RENOVATION</text><text x="640" y="635" text-anchor="middle" fill="#20251f" font-size="22" font-weight="700">保留结构，优化收纳、照明与软装</text>`),
  shell(`<image href="data:image/png;base64,${result}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice" opacity=".32"/><rect width="1280" height="720" fill="#263229" opacity=".74"/>
    <text x="640" y="265" text-anchor="middle" fill="#d3ddd3" font-size="14" font-weight="700" letter-spacing="4">案例只是开始</text><text x="640" y="355" text-anchor="middle" fill="#fff" font-family="Georgia,${font}" font-size="64">上传你的房间，亲自体验。</text>
    <rect x="480" y="414" width="320" height="62" rx="7" fill="#f4f2e9"/><text x="620" y="453" text-anchor="middle" fill="#20251f" font-size="18" font-weight="700">进入栖居 AI</text><text x="758" y="455" fill="#20251f" font-size="25">→</text>`),
];

for (let index = 0; index < scenes.length; index += 1) {
  await sharp(Buffer.from(scenes[index])).png().toFile(path.join(frameDir, `scene-${index + 1}.png`));
}

await sharp(path.join(frameDir, 'scene-5.png')).jpeg({quality: 86}).toFile(path.join(outputDir, 'demo-poster.jpg'));

const durations = [1.6, 2.4, 3, 2.2, 3.8, 2];
const inputs = durations.flatMap((duration, index) => ['-loop', '1', '-t', String(duration), '-i', path.join(frameDir, `scene-${index + 1}.png`)]);
const fadeDuration = 0.12;
let filter = durations.map((duration, index) => `[${index}:v]scale=1280:720,setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${(duration - fadeDuration).toFixed(2)}:d=${fadeDuration},setpts=PTS-STARTPTS[v${index}]`).join(';');
filter += `;${durations.map((_, index) => `[v${index}]`).join('')}concat=n=${durations.length}:v=1:a=0[video]`;
const elapsed = durations.reduce((sum, duration) => sum + duration, 0);

function encode(args) {
  const run = spawnSync(ffmpegInstaller.path, args, {stdio: 'inherit'});
  if (run.status !== 0) throw new Error(`ffmpeg exited with ${run.status}`);
}

encode([...inputs, '-filter_complex', filter, '-map', '[video]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-y', path.join(outputDir, 'demo-short.mp4')]);
encode([...inputs, '-filter_complex', filter, '-map', '[video]', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-y', path.join(outputDir, 'demo-short.webm')]);

fs.rmSync(frameDir, {recursive: true, force: true});
console.log(`Created ${elapsed.toFixed(2)} second demo video.`);
