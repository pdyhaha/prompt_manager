#!/bin/bash

# Prompt Manager 停止脚本

echo "🛑 正在停止 Prompt Manager..."

# 查找并终止服务器进程
if [ -f /tmp/prompt_manager.pid ]; then
    PID=$(cat /tmp/prompt_manager.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID
        rm /tmp/prompt_manager.pid
        echo "✅ 服务已停止"
    else
        echo "⚠️ 服务未在运行"
    fi
else
    # 尝试通过端口查找进程
    PID=$(lsof -t -i:3000)
    if [ -n "$PID" ]; then
        kill $PID
        echo "✅ 服务已停止"
    else
        echo "⚠️ 服务未在运行"
    fi
fi
