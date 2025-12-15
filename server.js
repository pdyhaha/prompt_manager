require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// AI API Keys
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

// 默认系统提示词 - Prompt 优化专用
const OPTIMIZATION_SYSTEM_PROMPT = `你是一个专业的 Prompt 工程师。请根据用户的优化要求修改 Prompt。

基本原则：
1. 严格按照用户的优化要求进行修改
2. 保持原 Prompt 的核心意图不变
3. 只修改需要优化的部分，其他内容保持原样
4. 优化时注意结构清晰、表达具体`;

const app = express();
const PORT = process.env.PORT || 3000;

// 安全：ID 清理函数，防止路径遍历攻击
function sanitizeId(id) {
    if (!id || typeof id !== 'string') return '';
    return id.replace(/[^a-zA-Z0-9-_]/g, '');
}

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
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        // 并行读取所有文件
        const contents = await Promise.all(
            jsonFiles.map(f => fs.readFile(path.join(PROMPTS_DIR, f), 'utf-8'))
        );
        
        const prompts = contents.map(c => JSON.parse(c));
        
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
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const filePath = path.join(PROMPTS_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(404).json({ error: 'Prompt 不存在' });
    }
});

// 创建 Prompt (也支持导入)
app.post('/api/prompts', async (req, res) => {
    try {
        // 检查是否是导入操作（带有完整的 prompt 对象）
        if (req.body.id && req.body.createdAt) {
            // 导入模式：使用提供的完整数据
            const importedPrompt = {
                id: req.body.id,
                title: req.body.title || '未命名 Prompt',
                content: req.body.content || '',
                tags: req.body.tags || [],
                createdAt: req.body.createdAt,
                updatedAt: req.body.updatedAt || new Date().toISOString(),
                history: req.body.history || []
            };
            
            const filePath = path.join(PROMPTS_DIR, `${sanitizeId(importedPrompt.id)}.json`);
            await fs.writeFile(filePath, JSON.stringify(importedPrompt, null, 2));
            console.log(`[导入] ${importedPrompt.title}`);
            return res.status(201).json(importedPrompt);
        }
        
        // 常规创建模式
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
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const filePath = path.join(PROMPTS_DIR, `${id}.json`);
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
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const filePath = path.join(PROMPTS_DIR, `${id}.json`);
        
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
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const srcPath = path.join(PROMPTS_DIR, `${id}.json`);
        const destPath = path.join(RECYCLE_DIR, `${id}.json`);
        
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
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        // 并行读取所有文件
        const contents = await Promise.all(
            jsonFiles.map(f => fs.readFile(path.join(RECYCLE_DIR, f), 'utf-8'))
        );
        
        const items = contents.map(c => JSON.parse(c));
        items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: '获取回收站失败' });
    }
});

// 从回收站恢复
app.post('/api/recycle-bin/restore/:id', async (req, res) => {
    try {
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const srcPath = path.join(RECYCLE_DIR, `${id}.json`);
        const destPath = path.join(PROMPTS_DIR, `${id}.json`);
        
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
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const filePath = path.join(RECYCLE_DIR, `${id}.json`);
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
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        // 并行删除所有文件
        await Promise.all(
            jsonFiles.map(f => fs.unlink(path.join(RECYCLE_DIR, f)))
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '清空失败' });
    }
});

// ========== 版本历史 API ==========

// 删除某个版本 (v0-based)
app.delete('/api/prompts/:id/history/:version', async (req, res) => {
    try {
        const id = sanitizeId(req.params.id);
        if (!id) return res.status(400).json({ error: '无效的 ID' });
        
        const filePath = path.join(PROMPTS_DIR, `${id}.json`);
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

// ========== AI Optimization API ==========

// 调用 Claude API
async function callClaudeAPI(content, systemPrompt, params = {}) {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('未配置 ANTHROPIC_API_KEY');
    }
    
    const { temperature = 0.7, maxTokens = 4096 } = params;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: maxTokens,
            temperature: temperature,
            system: systemPrompt,
            messages: [
                { role: 'user', content: content }
            ]
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API 错误: ${error}`);
    }
    
    const data = await response.json();
    return data.content[0].text;
}

// 调用 Gemini API
async function callGeminiAPI(content, systemPrompt, params = {}) {
    if (!GOOGLE_API_KEY) {
        throw new Error('未配置 GOOGLE_API_KEY');
    }
    
    const { temperature = 0.7, topP = 0.9, maxTokens = 4096 } = params;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                {
                    parts: [{ text: content }]
                }
            ],
            generationConfig: {
                temperature: temperature,
                topP: topP,
                maxOutputTokens: maxTokens
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API 错误: ${error}`);
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// 调用 OpenAI 兼容 API (支持通义千问/OpenAI)
async function callOpenAICompatibleAPI(content, modelName, systemPrompt, params = {}) {
    if (!OPENAI_API_KEY) {
        throw new Error('未配置 OPENAI_API_KEY');
    }
    
    const { temperature = 0.7, topP = 0.9, maxTokens = 4096 } = params;
    
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: content }
            ],
            temperature: temperature,
            top_p: topP,
            max_tokens: maxTokens
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API 错误: ${error}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// 调用智谱 AI API (GLM 模型)
async function callZhipuAPI(content, modelName, systemPrompt, params = {}) {
    if (!ZHIPU_API_KEY) {
        throw new Error('未配置 ZHIPU_API_KEY');
    }
    
    const { temperature = 0.7, topP = 0.9, maxTokens = 4096 } = params;
    
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ZHIPU_API_KEY}`
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: content }
            ],
            temperature: temperature,
            top_p: topP,
            max_tokens: maxTokens
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`智谱 API 错误: ${error}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// AI 优化 Prompt 接口
app.post('/api/ai/optimize', async (req, res) => {
    try {
        const { content, model, userPrompt = '', temperature = 0.7, topP = 0.9, maxTokens = 4096, deepThinking = false } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: '请提供要优化的 Prompt 内容' });
        }
        
        if (!model || !['qwen-plus', 'qwen3-max', 'glm-4.5', 'glm-4.6', 'gemini-3-pro', 'claude-4.5-sonnet', 'gpt-5.1', 'gpt-5.2'].includes(model)) {
            return res.status(400).json({ error: '请选择有效的模型' });
        }
        
        // 构建最终系统提示词：默认 + 用户优化要求
        let finalSystemPrompt = OPTIMIZATION_SYSTEM_PROMPT;
        if (userPrompt && userPrompt.trim()) {
            // 用户输入的优化要求
            finalSystemPrompt += `\n\n用户的优化要求：${userPrompt.trim()}`;
        }
        // 添加输出指令
        finalSystemPrompt += `\n\n请直接输出修改后的 Prompt，不要包含任何解释说明。`;
        
        // 模型参数对象
        const params = { temperature, topP, maxTokens, deepThinking };
        
        console.log(`[AI 优化] 使用 ${model} 模型优化 Prompt...`);
        if (userPrompt) {
            console.log(`[AI 优化] 用户额外指令: ${userPrompt.substring(0, 50)}...`);
        }
        
        let optimized;
        if (model.startsWith('claude')) {
            optimized = await callClaudeAPI(content, finalSystemPrompt, params);
        } else if (model.startsWith('gemini')) {
            optimized = await callGeminiAPI(content, finalSystemPrompt, params);
        } else if (model.startsWith('glm-')) {
            // GLM 模型使用智谱 API
            optimized = await callZhipuAPI(content, model, finalSystemPrompt, params);
        } else {
            // qwen-* 或 gpt-* 模型使用 OpenAI 兼容 API
            optimized = await callOpenAICompatibleAPI(content, model, finalSystemPrompt, params);
        }
        
        console.log(`[AI 优化] ${model} 优化完成`);
        res.json({ optimized });
    } catch (err) {
        console.error('[AI 优化] 失败:', err.message);
        res.status(500).json({ error: err.message || '优化失败' });
    }
});

// 检查 API 配置状态
app.get('/api/ai/status', (req, res) => {
    res.json({
        claude: !!ANTHROPIC_API_KEY,
        gemini: !!GOOGLE_API_KEY,
        qwen: !!OPENAI_API_KEY,
        openai: !!OPENAI_API_KEY
    });
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
