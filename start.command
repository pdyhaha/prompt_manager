#!/bin/bash

# Prompt Manager 启动脚本
# 双击此文件即可启动应用

cd "$(dirname "$0")"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js"
    echo "下载地址: https://nodejs.org"
    read -p "按回车键退出..."
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
fi

# 检查端口是否被占用
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
    echo "✅ 服务已在运行中"
    open "http://localhost:3000"
    exit 0
fi

echo "🚀 正在启动 Prompt Manager..."
echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║                                                    ║"
echo "║   访问地址: http://localhost:3000                 ║"
echo "║                                                    ║"
echo "║   按 Ctrl+C 停止服务                               ║"
echo "║                                                    ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 打开浏览器
sleep 1
open "http://localhost:3000"

# 启动服务器（前台运行）
node server.js
