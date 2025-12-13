# 📝 Prompt Manager

一个**本地化**的 Prompt 管理工具，支持版本历史追踪、差异对比、批量操作和回收站功能。

![Prompt Manager](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 📋 **Prompt 管理** | 创建、编辑、删除、标签分类、搜索筛选、批量删除 |
| 📜 **版本历史** | 自动版本控制（v0 起始）、完整历史记录、差异可视化对比 |
| 🗑️ **回收站** | 软删除、恢复、永久删除、一键清空 |
| 💾 **本地存储** | JSON 文件存储，方便备份和迁移 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0

> 检查版本：`node -v` 和 `npm -v`

### 安装步骤

```bash
# 1. 克隆或下载项目
git clone https://github.com/your-repo/prompt_manager.git
cd prompt_manager

# 2. 安装依赖
npm install

# 3. 启动服务
npm start

# 或使用开发模式（支持热重载）
npm run dev
```

### 访问应用

启动成功后，浏览器访问：**http://localhost:3000**

> 💡 可通过环境变量 `PORT` 自定义端口：`PORT=8080 npm start`

---

## 🖥️ macOS 快捷启动

双击 `start.command` 文件即可一键启动（首次需要授权）：

```bash
chmod +x start.command  # 首次使用需授权
```

---

## 📁 项目结构

```
prompt_manager/
├── index.html          # 前端页面
├── styles.css          # 样式文件
├── app.js              # 前端应用逻辑
├── diff.js             # 差异对比算法 (LCS)
├── server.js           # Express.js 后端服务
├── package.json        # Node.js 配置
├── start.command       # macOS 一键启动脚本
├── stop.command        # macOS 停止脚本
├── prompts/            # Prompt 数据存储 (JSON)
└── recycle_bin/        # 回收站数据存储
```

---

## 📖 使用指南

### 创建 Prompt

1. 点击左侧 **「+ 新建 Prompt」**
2. 输入标题和内容
3. 添加标签（逗号分隔，可选）
4. 点击 **「💾 保存」** 或按 `Ctrl/Cmd + S`

### 版本对比

1. 选择一个有历史版本的 Prompt
2. 右侧面板自动显示差异对比
3. 🟢 绿色 = 新增内容，🔴 红色 = 删除内容
4. 使用进度条或 ◀ ▶ 按钮快速跳转

### 批量操作

1. 点击 **「☑️ 批量选择」** 进入批量模式
2. 点击列表项选择/取消
3. 点击 **「🗑️ 批量删除」** 移至回收站

### 导入/导出

- **导出**：点击 **「📤 导出」** 下载 JSON 备份文件
- **导入**：点击 **「📥 导入」** 选择备份文件恢复

---

## 🔌 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/prompts` | 获取所有 Prompt |
| `GET` | `/api/prompts/:id` | 获取单个 Prompt |
| `POST` | `/api/prompts` | 创建新 Prompt |
| `PUT` | `/api/prompts/:id` | 更新 Prompt |
| `DELETE` | `/api/prompts/:id` | 删除 Prompt（移至回收站） |
| `GET` | `/api/recycle-bin` | 获取回收站内容 |
| `POST` | `/api/recycle-bin/restore/:id` | 从回收站恢复 |
| `DELETE` | `/api/recycle-bin/:id` | 永久删除 |
| `DELETE` | `/api/recycle-bin` | 清空回收站 |
| `DELETE` | `/api/prompts/:id/history/:v` | 删除历史版本 |
| `POST` | `/api/shutdown` | 关闭服务 |

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + S` | 保存当前 Prompt |
| `Ctrl/Cmd + N` | 新建 Prompt |
| `Tab` | 插入两个空格 |

---

## 🛠️ 技术栈

- **前端**：原生 HTML/CSS/JavaScript（无框架依赖）
- **后端**：Node.js + Express.js
- **数据存储**：本地 JSON 文件
- **差异算法**：基于 LCS（最长公共子序列）

---

## 📄 许可证

[MIT License](LICENSE)
