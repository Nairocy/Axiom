# Axiom

> 剪贴板管理器 — Tauri 2 · Rust · React · SQLite

Axiom 是一个常驻系统托盘的桌面剪贴板管理工具：持续采集剪贴板内容、分类归档、随时召回，
并内置主题系统，让同一个应用在不同视觉语言下都能自洽。

## 功能

- **剪贴板历史**：监听剪贴板变化并持久化（SQLite），支持粘贴队列
- **多类型内容**：文本与图片（PNG / JPEG / BMP / GIF / WebP），按内容类型分流处理
- **标签分类**：为条目打标签并筛选
- **Emoji 面板**：常用表情快速插入
- **文件传输**：内置基于 `axum` 的 HTTP 服务（含多部分上传），配合本机局域网地址使用
- **云同步**：可选的同步服务模块
- **敏感内容处理**：敏感内容对齐与加密队列，避免明文落库
- **桌面集成**：全局快捷键、系统托盘、单实例、窗口状态记忆、通知
- **主题系统**：共享 CSS 只管结构与中性默认值，每个主题文件拥有自己的视觉语言
  （设计说明见 [`docs/THEME-SYSTEM.md`](docs/THEME-SYSTEM.md)）

## 技术栈

| 层 | 选型 |
|---|---|
| 壳 | Tauri 2.10（`tray-icon` · `macos-private-api` · `protocol-asset`） |
| 前端 | React + TypeScript + Vite、framer-motion、prismjs、react-window |
| 后端 | Rust、rusqlite（bundled SQLite）、arboard / clipboard-rs、image |
| 服务 | axum（multipart + ws）、local-ip-address |
| 系统 | global-shortcut、single-instance、window-state、window-vibrancy、notification |

## 目录结构

```
src/                     React 前端
├── features/            app / clipboard / emoji / file-transfer / settings / tag
├── shared/              components / config / hooks / lib / types
└── styles/
src-tauri/src/           Rust 后端
├── app/                 应用装配
├── domain/              领域模型
├── infrastructure/      基础设施
├── services/            clipboard · clipboard_listener · clipboard_ops · content_handler
│                        cloud_sync · file_transfer · paste_queue · encryption_queue · sensitive_align
├── app_state.rs         全局状态
├── database.rs          SQLite
└── migration.rs         数据迁移
docs/THEME-SYSTEM.md     主题系统设计说明
```

## 快速开始

前置：Node.js 18+、Rust stable 工具链、以及 [Tauri 2 的系统依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install

npm run tauri:dev      # 开发（带 devtools）
npm run tauri:build    # 构建安装包
```

`package.json` 里另含 macOS arm64 / x64 的交叉打包脚本（需要对应 target 工具链）。

## 关于本仓库

- 应用标识：`com.axiom`，当前版本 `0.3.4`
- 仓库中**不包含**：`node_modules`、构建产物、签名密钥、`.env`、以及 `docs/images/` 下的个人收款码图片
- 界面素材（`logo.png`、`saucer.png`、`docs/images/*.png`）随仓库提供

## 许可证

[GPL-3.0](LICENSE) © 2026 Nairocy
