# Prompt 管理平台

一个本地化的 Prompt 管理工具，支持版本历史跟踪、差异对比、批量操作和回收站功能。

![Prompt Manager](favicon.svg)

## 功能特性

### 📝 Prompt 管理
- **创建/编辑/删除** Prompt
- **标题和标签** 支持，方便分类管理
- **搜索和筛选** 功能，快速定位 Prompt
- **批量删除** 支持，一次性删除多个 Prompt

### 📜 版本历史
- **版本从 v0 开始**：新建 Prompt 为 v0，每次保存内容变更后版本号递增
- **完整历史记录**：保存每个版本的内容和修改时间
- **差异对比**：可视化对比当前版本与历史版本的差异
- **快速导航**：差异进度条支持快速跳转到修改位置

### 🗑️ 回收站
- **软删除**：删除的 Prompt 进入回收站
- **恢复功能**：支持从回收站恢复完整 Prompt
- **永久删除**：可以永久删除回收站中的项目
- **清空回收站**：一键清空所有回收站内容

### 💾 本地文件存储
- 数据存储在本地文件系统，方便备份和管理
- `prompts/` 文件夹存放 Prompt 数据
- `recycle_bin/` 文件夹存放回收站数据

## 快速开始

### 环境要求
- Node.js 14+
- npm 6+

### 安装

```bash
# 克隆项目
cd prompt_manager

# 安装依赖
npm install

# 启动服务
npm start
```

### 访问

启动后访问：http://localhost:3000

## 项目结构

```
prompt_manager/
├── index.html          # 前端页面
├── styles.css          # 样式文件
├── app.js              # 前端应用逻辑
├── diff.js             # 差异对比算法
├── server.js           # Express.js 后端服务
├── package.json        # Node.js 配置
├── favicon.svg         # 网站图标
├── prompts/            # Prompt 数据存储
└── recycle_bin/        # 回收站数据存储
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/prompts | 获取所有 Prompt |
| GET | /api/prompts/:id | 获取单个 Prompt |
| POST | /api/prompts | 创建新 Prompt |
| PUT | /api/prompts/:id | 更新 Prompt |
| DELETE | /api/prompts/:id | 删除 Prompt（移至回收站） |
| GET | /api/recycle-bin | 获取回收站内容 |
| POST | /api/recycle-bin/restore/:id | 从回收站恢复 |
| DELETE | /api/recycle-bin/:id | 永久删除 |
| DELETE | /api/recycle-bin | 清空回收站 |

## 使用指南

### 创建新 Prompt
1. 点击左侧边栏的 **"+ 新建 Prompt"** 按钮
2. 输入标题和内容
3. 可选添加标签（逗号分隔）
4. 点击 **"保存"** 按钮

### 版本对比
1. 选择一个已有历史版本的 Prompt
2. 在差异对比区域，选择要对比的历史版本
3. 绿色高亮表示新增内容，红色高亮表示删除内容
4. 使用进度条或导航按钮快速跳转到修改位置

### 批量删除
1. 点击 **"☑️ 批量选择"** 进入批量模式
2. 点击 Prompt 项目进行选择/取消选择
3. 点击 **"🗑️ 批量删除"** 删除选中项目
4. 确认后，所有选中项移至回收站

### 回收站操作
1. 点击 **"🗑️ 回收站"** 打开回收站
2. 可以恢复或永久删除单个项目
3. 点击 **"清空回收站"** 删除所有项目

## 技术栈

- **前端**：原生 HTML/CSS/JavaScript
- **后端**：Node.js + Express.js
- **数据存储**：本地 JSON 文件
- **差异算法**：Myers 差异算法

## 许可证

MIT License
