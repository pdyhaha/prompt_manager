const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 请求日志中间件
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const timestamp = new Date().toLocaleString('zh-CN');
        console.log(`[${timestamp}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

app.use(express.static('.'));

// 数据目录
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const RECYCLE_DIR = path.join(__dirname, 'recycle_bin');

// 确保目录存在
async function ensureDirs() {
    try {
        await fs.mkdir(PROMPTS_DIR, { recursive: true });
        await fs.mkdir(RECYCLE_DIR, { recursive: true });
    } catch (err) {
        console.error('创建目录失败:', err);
    }
}

// ========== Prompt API ==========

// 获取所有 Prompts
app.get('/api/prompts', async (req, res) => {
    try {
        const files = await fs.readdir(PROMPTS_DIR);
        const prompts = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(PROMPTS_DIR, file), 'utf-8');
                prompts.push(JSON.parse(content));
            }
        }
        
        // 按更新时间排序
        prompts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        res.json(prompts);
    } catch (err) {
        console.error('获取 prompts 失败:', err);
        res.status(500).json({ error: '获取数据失败' });
    }
});

// 获取单个 Prompt
app.get('/api/prompts/:id', async (req, res) => {
    try {
        const filePath = path.join(PROMPTS_DIR, `${req.params.id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(404).json({ error: 'Prompt 不存在' });
    }
});

// 创建 Prompt
app.post('/api/prompts', async (req, res) => {
    try {
        // 生成唯一标题
        let baseTitle = req.body.title || '未命名 Prompt';
        let title = baseTitle;
        
        // 读取现有 prompts 检查标题重复
        const files = await fs.readdir(PROMPTS_DIR);
        const existingTitles = new Set();
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(PROMPTS_DIR, file), 'utf-8');
                const prompt = JSON.parse(content);
                existingTitles.add(prompt.title);
            }
        }
        
        // 如果标题已存在，添加数字后缀
        if (existingTitles.has(title)) {
            let counter = 2;
            while (existingTitles.has(`${baseTitle} ${counter}`)) {
                counter++;
            }
            title = `${baseTitle} ${counter}`;
        }
        
        const prompt = {
            id: uuidv4(),
            title: title,
            content: req.body.content || '',
            tags: req.body.tags || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: []  // 新建时历史为空，当前版本为 v0
        };
        
        const filePath = path.join(PROMPTS_DIR, `${prompt.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(prompt, null, 2));
        res.status(201).json(prompt);
    } catch (err) {
        console.error('创建 prompt 失败:', err);
        res.status(500).json({ error: '创建失败' });
    }
});

// 更新 Prompt
app.put('/api/prompts/:id', async (req, res) => {
    try {
        const filePath = path.join(PROMPTS_DIR, `${req.params.id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const prompt = JSON.parse(content);
        
        // 如果内容有变化，添加到历史
        if (req.body.content !== undefined && req.body.content !== prompt.content) {
            prompt.history.push({
                version: prompt.history.length + 1,
                content: prompt.content,
                timestamp: new Date().toISOString(),
                changes: req.body.changes || '内容更新'
            });
        }
        
        // 更新字段
        if (req.body.title !== undefined) prompt.title = req.body.title;
        if (req.body.content !== undefined) prompt.content = req.body.content;
        if (req.body.tags !== undefined) prompt.tags = req.body.tags;
        if (req.body.history !== undefined) prompt.history = req.body.history;
        prompt.updatedAt = new Date().toISOString();
        
        await fs.writeFile(filePath, JSON.stringify(prompt, null, 2));
        res.json(prompt);
    } catch (err) {
        console.error('更新 prompt 失败:', err);
        res.status(500).json({ error: '更新失败' });
    }
});

// 自动保存 API (用于 sendBeacon，只能发送 POST)
app.post('/api/prompts/:id', async (req, res) => {
    try {
        const filePath = path.join(PROMPTS_DIR, `${req.params.id}.json`);
        
        // 直接保存完整的 prompt 数据
        const prompt = req.body;
        prompt.updatedAt = new Date().toISOString();
        
        await fs.writeFile(filePath, JSON.stringify(prompt, null, 2));
        console.log(`[自动保存] ${prompt.title || '未命名'}`);
        res.json({ success: true });
    } catch (err) {
        console.error('自动保存失败:', err);
        res.status(500).json({ error: '保存失败' });
    }
});

// 删除 Prompt (移到回收站)
app.delete('/api/prompts/:id', async (req, res) => {
    try {
        const srcPath = path.join(PROMPTS_DIR, `${req.params.id}.json`);
        const destPath = path.join(RECYCLE_DIR, `${req.params.id}.json`);
        
        // 读取并添加删除时间
        const content = await fs.readFile(srcPath, 'utf-8');
        const prompt = JSON.parse(content);
        prompt.deletedAt = new Date().toISOString();
        
        // 移动到回收站
        await fs.writeFile(destPath, JSON.stringify(prompt, null, 2));
        await fs.unlink(srcPath);
        
        res.json({ success: true });
    } catch (err) {
        console.error('删除 prompt 失败:', err);
        res.status(500).json({ error: '删除失败' });
    }
});

// ========== 回收站 API ==========

// 获取回收站列表
app.get('/api/recycle-bin', async (req, res) => {
    try {
        const files = await fs.readdir(RECYCLE_DIR);
        const items = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(RECYCLE_DIR, file), 'utf-8');
                items.push(JSON.parse(content));
            }
        }
        
        items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: '获取回收站失败' });
    }
});

// 从回收站恢复
app.post('/api/recycle-bin/restore/:id', async (req, res) => {
    try {
        const srcPath = path.join(RECYCLE_DIR, `${req.params.id}.json`);
        const destPath = path.join(PROMPTS_DIR, `${req.params.id}.json`);
        
        const content = await fs.readFile(srcPath, 'utf-8');
        const prompt = JSON.parse(content);
        delete prompt.deletedAt;
        prompt.updatedAt = new Date().toISOString();
        
        await fs.writeFile(destPath, JSON.stringify(prompt, null, 2));
        await fs.unlink(srcPath);
        
        res.json(prompt);
    } catch (err) {
        res.status(500).json({ error: '恢复失败' });
    }
});

// 永久删除
app.delete('/api/recycle-bin/:id', async (req, res) => {
    try {
        const filePath = path.join(RECYCLE_DIR, `${req.params.id}.json`);
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '删除失败' });
    }
});

// 清空回收站
app.delete('/api/recycle-bin', async (req, res) => {
    try {
        const files = await fs.readdir(RECYCLE_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                await fs.unlink(path.join(RECYCLE_DIR, file));
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '清空失败' });
    }
});

// ========== 版本历史 API ==========

// 删除某个版本 (v0-based)
app.delete('/api/prompts/:id/history/:version', async (req, res) => {
    try {
        const filePath = path.join(PROMPTS_DIR, `${req.params.id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const prompt = JSON.parse(content);
        
        // v0-based: version 参数直接是数组索引
        const versionIndex = parseInt(req.params.version);
        console.log(`[删除版本] promptId: ${req.params.id}, versionIndex: ${versionIndex}, historyLength: ${prompt.history.length}`);
        
        if (versionIndex >= 0 && versionIndex < prompt.history.length) {
            // 保存被删除的版本到回收站（作为版本记录）
            const deletedVersion = prompt.history[versionIndex];
            const recycleItem = {
                id: uuidv4(),
                type: 'version',
                promptId: prompt.id,
                promptTitle: prompt.title,
                version: deletedVersion.version,
                content: deletedVersion.content,
                timestamp: deletedVersion.timestamp,
                deletedAt: new Date().toISOString()
            };
            
            await fs.writeFile(
                path.join(RECYCLE_DIR, `version_${recycleItem.id}.json`),
                JSON.stringify(recycleItem, null, 2)
            );
            
            // 从历史中删除并重新编号 (v0-based)
            prompt.history.splice(versionIndex, 1);
            prompt.history.forEach((h, i) => h.version = i);  // v0-based renumbering
            
            await fs.writeFile(filePath, JSON.stringify(prompt, null, 2));
            res.json(prompt);
        } else {
            res.status(404).json({ error: '版本不存在' });
        }
    } catch (err) {
        res.status(500).json({ error: '删除版本失败' });
    }
});

// 关闭服务器 API
app.post('/api/shutdown', (req, res) => {
    console.log('[系统] 收到关闭请求，服务即将停止...');
    res.json({ success: true, message: '服务即将关闭' });
    
    // 延迟关闭，确保响应发送完成
    setTimeout(() => {
        console.log('[系统] 服务已停止');
        process.exit(0);
    }, 500);
});

// 启动服务器
ensureDirs().then(() => {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🚀 Prompt 管理平台已启动                         ║
║                                                    ║
║   访问地址: http://localhost:${PORT}                 ║
║                                                    ║
║   数据存储:                                        ║
║   - prompts/      存放 Prompt 文件                 ║
║   - recycle_bin/  回收站                           ║
║                                                    ║
╚════════════════════════════════════════════════════╝
        `);
    });
});
