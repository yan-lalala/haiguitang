# 《欧利蒂丝庄园：海龟汤探案》 (Eurydice Manor)

> 19世纪维多利亚哥特暗黑推理解谜游戏（海龟汤） · 支持 8 大经典案卷、AI DM 智能裁决、双人实时 WebSocket 联机。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yan-lalala/haiguitang)

---

## 🚀 免费公网一键部署指南

### 方式一：使用 Render 免费一键托管（自带 WebSocket 联机）
1. 点击上方的 **[Deploy to Render]** 按钮，或直接打开 [Render Blueprint 部署链接](https://render.com/deploy?repo=https://github.com/yan-lalala/haiguitang)；
2. 使用 GitHub 账号登录；
3. 点击 **Apply** 即可自动开始编译部署；
4. 部署完成后，Render 会自动分配一个免费的全球公网 HTTPS 域名（例如 `https://eurydice-manor.onrender.com`），微信点开即玩！

### 方式二：使用 Zeabur 部署（亚太低延迟推荐）
1. 打开 [https://zeabur.com](https://zeabur.com) 并用 GitHub 登录；
2. 点击 **Create Project** -> **Deploy New Service** -> 选择 **Git**；
3. 选择 `yan-lalala/haiguitang` 仓库；
4. Zeabur 会自动识别 Node.js / Dockerfile 进行自动构建与部署；
5. 在 Networking 标签页中点击 **Generate Domain** 绑定免费域名（例如 `https://haiguitang.zeabur.app`）。

---

## 🛠️ 本地运行

```bash
# 安装依赖
npm install

# 本地热重载开发
npm run dev:h5

# 启动包含 WebSocket 联机服务的生产服务（端口 3000）
npm start
```
