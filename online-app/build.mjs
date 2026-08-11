import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(import.meta.dirname, '..');
const onlineDir = path.resolve(import.meta.dirname);
const outputDir = path.join(onlineDir, 'dist');

fs.rmSync(outputDir, {recursive: true, force: true});
fs.mkdirSync(path.join(outputDir, 'demo'), {recursive: true});
fs.mkdirSync(path.join(outputDir, 'experience'), {recursive: true});

for (const name of ['index.html', 'style.css', 'script-proxy.js']) {
  fs.copyFileSync(path.join(projectDir, name), path.join(outputDir, 'experience', name));
}
for (const name of ['index.html', 'demo.css', 'demo.js', 'cases.json', 'flow.json']) {
  fs.copyFileSync(path.join(projectDir, 'static-demo', name), path.join(outputDir, 'demo', name));
}
fs.copyFileSync(path.join(projectDir, 'static-demo', 'index.html'), path.join(outputDir, 'index.html'));
fs.cpSync(path.join(projectDir, 'static-demo', 'assets'), path.join(outputDir, 'demo', 'assets'), {recursive: true});
fs.cpSync(path.join(projectDir, 'static-demo', 'media'), path.join(outputDir, 'demo', 'media'), {recursive: true});

const config = JSON.parse(fs.readFileSync(path.join(projectDir, 'config.json'), 'utf8'));
const workerTemplate = fs.readFileSync(path.join(onlineDir, 'src', 'worker.template.js'), 'utf8');
const worker = workerTemplate.replace('__DEFAULT_CONFIG__', JSON.stringify(config));
fs.writeFileSync(path.join(outputDir, '_worker.js'), worker, 'utf8');

fs.writeFileSync(path.join(outputDir, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/demo/cases.json\n  Cache-Control: no-store\n\n/demo/flow.json\n  Cache-Control: no-store\n`, 'utf8');
fs.writeFileSync(path.join(outputDir, '_routes.json'), JSON.stringify({
  version: 1,
  include: ['/*'],
  exclude: ['/demo/demo.css', '/demo/demo.js', '/demo/media/*', '/experience/style.css', '/experience/script-proxy.js']
}, null, 2), 'utf8');

console.log('Built combined portfolio landing and online AI experience.');
