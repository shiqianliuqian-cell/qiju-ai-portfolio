# 栖居 AI · 在线空间改造应用

这是栖居 AI 的公开网站源码。首页提供房间识别、空间分析、面积与预算判断、智能改造和风格改造；`/demo/` 保留为作品案例页。

## 项目结构

- `index.html`、`style.css`、`script-proxy.js`：主网站
- `static-demo/`：作品案例页
- `online-app/`：Cloudflare Pages Functions、D1/KV 配置及构建脚本

## 构建与部署

```bash
cd online-app
npm install
npm run check
npm run deploy
```

API 密钥、同步令牌和上传签名仅保存在 Cloudflare 加密变量中，不进入仓库。
