/**
 * Prompt 管理平台主应用逻辑
 */

class PromptManager {
    constructor() {
        this.prompts = [];
        this.currentPrompt = null;
        this.selectedVersion = null;
        this.activeTag = null;
        this.searchQuery = '';
        this.recycleBin = [];
        this.currentRecycleItem = null;
        this.API_BASE = '/api';
        this.batchMode = false;
        this.selectedPrompts = new Set();
        this.cursorPositions = new Map();  // 存储每个 prompt 的光标位置
        
        this.init();
    }
    
    /**
     * 初始化应用
     */
    async init() {
        await this.loadFromStorage();
        await this.loadRecycleBin();
        this.bindEvents();
        this.render();
    }
    
    /**
     * 从 API 加载数据
     */
    async loadFromStorage() {
        try {
            const response = await fetch(`${this.API_BASE}/prompts`);
            if (response.ok) {
                this.prompts = await response.json();
            } else {
                this.prompts = [];
            }
        } catch (e) {
            console.error('加载数据失败:', e);
            this.prompts = [];
            this.showToast('无法连接到服务器，请确保已启动 node server.js', 'error');
        }
    }
    
    /**
     * 保存单个 Prompt 到 API
     */
    async saveToStorage() {
        if (!this.currentPrompt) return;
        
        try {
            const response = await fetch(`${this.API_BASE}/prompts/${this.currentPrompt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.currentPrompt)
            });
            
            if (!response.ok) {
                throw new Error('保存失败');
            }
        } catch (e) {
            console.error('保存数据失败:', e);
            this.showToast('保存失败', 'error');
        }
    }
    
    /**
     * 加载回收站数据
     */
    async loadRecycleBin() {
        try {
            const response = await fetch(`${this.API_BASE}/recycle-bin`);
            if (response.ok) {
                this.recycleBin = await response.json();
            } else {
                this.recycleBin = [];
            }
        } catch (e) {
            console.error('加载回收站失败:', e);
            this.recycleBin = [];
        }
    }
    
    /**
     * 保存回收站数据 (已由服务端处理，此方法保留兼容)
     */
    async saveRecycleBin() {
        // 回收站操作现在由服务端 API 处理
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 新建 Prompt
        document.getElementById('newPromptBtn').addEventListener('click', () => this.createNewPrompt());
        
        // 保存
        document.getElementById('saveBtn').addEventListener('click', () => this.saveCurrentPrompt());
        
        // 删除
        document.getElementById('deleteBtn').addEventListener('click', (e) => this.showDeleteConfirm(e));
        
        // 复制
        document.getElementById('copyBtn').addEventListener('click', () => this.copyToClipboard());
        
        // 退出按钮
        const exitBtn = document.getElementById('exitBtn');
        if (exitBtn) {
            exitBtn.addEventListener('click', (e) => this.exitApp(e));
        }
        
        // 页面关闭时自动保存
        window.addEventListener('beforeunload', (e) => {
            this.autoSaveBeforeClose();
        });
        
        // 页面切换到后台时自动保存
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.currentPrompt) {
                this.autoSaveBeforeClose();
            }
        });
        
        // 搜索
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderPromptsList();
        });
        
        // 字符计数 + 撤销/重做时自动定位
        const promptContent = document.getElementById('promptContent');
        let lastContent = '';
        
        promptContent.addEventListener('focus', (e) => {
            lastContent = e.target.value;
        });
        
        promptContent.addEventListener('input', (e) => {
            document.getElementById('charCount').textContent = `${e.target.value.length} 字符`;
            
            // 检测是否是撤销或重做操作
            if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
                const textarea = e.target;
                const currentContent = textarea.value;
                
                // 找到第一个差异位置
                const diffPos = this.findFirstDiffPosition(lastContent, currentContent);
                
                // 滚动到差异位置
                this.scrollToPosition(textarea, diffPos);
            }
            
            lastContent = e.target.value;
        });
        
        // Tab 键插入两个空格
        promptContent.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const spaces = '  '; // 两个空格
                
                // 插入空格
                textarea.value = textarea.value.substring(0, start) + spaces + textarea.value.substring(end);
                
                // 移动光标到空格后面
                textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
                
                // 触发 input 事件以更新字符计数
                textarea.dispatchEvent(new Event('input'));
            }
        });

        
        // 导出
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        
        // 导入
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));
        
        // 关闭历史面板
        document.getElementById('closeHistoryBtn').addEventListener('click', () => {
            document.getElementById('historyPanel').style.display = 'none';
        });
        
        // 版本选择器事件 (版本 B 现在是固定的当前版本)
        document.getElementById('diffVersionA').addEventListener('change', () => this.updateDiffComparison());
        
        // 差异导航按钮
        document.getElementById('diffNavPrev').addEventListener('click', () => this.navigateDiff(-1));
        document.getElementById('diffNavNext').addEventListener('click', () => this.navigateDiff(1));
        
        // 删除历史版本按钮
        document.getElementById('deleteVersionABtn').addEventListener('click', (e) => this.deleteSelectedVersion('A', e));
        
        // 差异行点击和鼠标跟随事件
        this.bindDiffLineClicks();
        
        // 回收站按钮
        document.getElementById('recycleBinBtn').addEventListener('click', () => this.openRecycleBin());
        document.getElementById('closeRecycleBinBtn').addEventListener('click', () => this.closeRecycleBin());
        document.getElementById('emptyRecycleBinBtn').addEventListener('click', (e) => this.emptyRecycleBin(e));
        
        // 批量操作按钮
        document.getElementById('batchModeBtn').addEventListener('click', () => this.toggleBatchMode());
        document.getElementById('batchDeleteBtn').addEventListener('click', (e) => this.batchDelete(e));
        document.getElementById('cancelBatchBtn').addEventListener('click', () => this.cancelBatchMode());
        
        // 回收站对比模态框
        document.getElementById('closeRecycleDiffBtn').addEventListener('click', () => this.closeRecycleDiff());
        document.getElementById('recycleCompareVersion').addEventListener('change', () => this.updateRecycleDiff());
        document.getElementById('restoreFromRecycleBtn').addEventListener('click', () => this.restoreFromRecycleBin());
        
        // 确认对话框
        document.getElementById('confirmCancel').addEventListener('click', () => this.hideConfirmModal());
        document.getElementById('confirmOk').addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback();
            }
            this.hideConfirmModal();
        });
        
        // AI 优化功能
        document.getElementById('aiOptimizeBtn').addEventListener('click', () => this.showAIOptimizeModal());
        document.getElementById('closeAIOptimizeBtn').addEventListener('click', () => this.closeAIOptimizeModal());
        document.getElementById('cancelAIOptimizeBtn').addEventListener('click', () => this.closeAIOptimizeModal());
        document.getElementById('runOptimizeBtn').addEventListener('click', () => this.runAIOptimize());
        document.getElementById('replaceContentBtn').addEventListener('click', () => this.replaceWithOptimized());
        document.getElementById('saveOptimizedBtn').addEventListener('click', () => this.saveOptimizedAsVersion());
        
        // 差异显示切换
        document.getElementById('showDiffToggle').addEventListener('change', (e) => {
            this.updateOptimizedDisplay(e.target.checked);
        });
        
        // Temperature slider 实时更新显示值
        document.getElementById('aiTemperature').addEventListener('input', (e) => {
            document.getElementById('tempValue').textContent = e.target.value;
        });
        
        // 移动端菜单切换
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        
        if (mobileMenuBtn && sidebar && sidebarOverlay) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('show');
                sidebarOverlay.classList.toggle('show');
            });
            
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S 保存
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCurrentPrompt();
            }
            // Alt/Option + N 新建 (使用 code 避免 macOS 特殊字符问题)
            if (e.altKey && e.code === 'KeyN') {
                e.preventDefault();
                this.createNewPrompt();
            }
            // Alt/Option + Backspace 删除当前 Prompt
            if (e.altKey && e.code === 'Backspace') {
                e.preventDefault();
                this.showDeleteConfirm(e);
            }
        });
    }
    
    /**
     * 生成唯一 ID
     */
    generateId() {
        return 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * 格式化时间
     */
    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        
        // 1分钟内
        if (diff < 60000) {
            return '刚刚';
        }
        // 1小时内
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)} 分钟前`;
        }
        // 今天
        if (date.toDateString() === now.toDateString()) {
            return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        // 其他
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    
    /**
     * 格式化完整时间
     */
    formatFullTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    /**
     * 创建新 Prompt
     */
    async createNewPrompt() {
        try {
            const response = await fetch(`${this.API_BASE}/prompts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: '',
                    content: ''
                })
            });
            
            if (!response.ok) throw new Error('创建失败');
            
            const newPrompt = await response.json();
            this.prompts.unshift(newPrompt);
            this.selectPrompt(newPrompt.id);
            this.renderPromptsList();
            this.renderTags();
            
            document.getElementById('promptTitle').focus();
        } catch (e) {
            console.error('创建 Prompt 失败:', e);
            this.showToast('创建失败', 'error');
        }
    }
    
    /**
     * 选择 Prompt
     */
    selectPrompt(id) {
        // 切换前保存当前 prompt 的光标位置和内容
        if (this.currentPrompt) {
            const textarea = document.getElementById('promptContent');
            this.cursorPositions.set(this.currentPrompt.id, {
                selectionStart: textarea.selectionStart,
                selectionEnd: textarea.selectionEnd,
                scrollTop: textarea.scrollTop
            });
            
            // 自动保存当前 prompt
            this.autoSaveBeforeClose();
        }
        
        this.currentPrompt = this.prompts.find(p => p.id === id);
        this.selectedVersion = null;
        
        if (this.currentPrompt) {
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('editorPanel').style.display = 'flex';
            document.getElementById('historyPanel').style.display = 'flex';
            
            document.getElementById('promptTitle').value = this.currentPrompt.title;
            document.getElementById('promptContent').value = this.currentPrompt.content;
            document.getElementById('tagsInput').value = this.currentPrompt.tags.join(', ');
            document.getElementById('charCount').textContent = `${this.currentPrompt.content.length} 字符`;
            document.getElementById('lastSaved').textContent = `上次保存: ${this.formatTime(this.currentPrompt.updatedAt)}`;
            
            // 恢复光标位置
            const savedPosition = this.cursorPositions.get(id);
            if (savedPosition) {
                const textarea = document.getElementById('promptContent');
                setTimeout(() => {
                    textarea.focus();
                    textarea.selectionStart = savedPosition.selectionStart;
                    textarea.selectionEnd = savedPosition.selectionEnd;
                    textarea.scrollTop = savedPosition.scrollTop;
                }, 0);
            }
            
            this.renderVersionSelectors();
            this.updateDiffComparison();
        }
        
        this.renderPromptsList();
    }
    
    /**
     * 保存当前 Prompt
     */
    saveCurrentPrompt() {
        if (!this.currentPrompt) return;
        
        const title = document.getElementById('promptTitle').value.trim();
        const content = document.getElementById('promptContent').value;
        const tagsStr = document.getElementById('tagsInput').value;
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        if (!title) {
            this.showToast('请输入标题', 'error');
            document.getElementById('promptTitle').focus();
            return;
        }
        
        // 检查内容是否为空
        if (!content.trim()) {
            this.showToast('内容为空', 'error');
            document.getElementById('promptContent').focus();
            return;
        }
        
        const now = new Date().toISOString();
        const oldContent = this.currentPrompt.content;
        const oldTitle = this.currentPrompt.title;
        const oldTags = this.currentPrompt.tags.join(',');
        const newTags = tags.join(',');
        
        // 检查是否有任何修改
        if (content === oldContent && title === oldTitle && newTags === oldTags) {
            this.showToast('没有修改', 'error');
            return;
        }
        
        // 如果内容有变化，记录历史
        if (content !== oldContent) {
            const diffResult = DiffTool.diff(oldContent, content);
            const changesSummary = DiffTool.getSummary(diffResult);
            
            this.currentPrompt.history.push({
                version: this.currentPrompt.history.length,  // v0-based
                content: oldContent,
                timestamp: this.currentPrompt.updatedAt,
                changes: oldContent ? changesSummary : '初始创建'
            });
        }
        
        // 更新 prompt
        this.currentPrompt.title = title;
        this.currentPrompt.content = content;
        this.currentPrompt.tags = tags;
        this.currentPrompt.updatedAt = now;
        
        this.saveToStorage();
        this.renderPromptsList();
        this.renderTags();
        this.renderVersionSelectors();
        this.updateDiffComparison();
        
        document.getElementById('lastSaved').textContent = `上次保存: ${this.formatTime(now)}`;
        this.showToast('保存成功 ✓', 'success');
    }
    
    /**
     * 显示删除确认
     */
    showDeleteConfirm(event = null) {
        if (!this.currentPrompt) return;
        
        this.showConfirmModal(
            '确认删除',
            `确定要删除「${this.currentPrompt.title || '未命名'}」吗？此操作不可恢复。`,
            () => this.deleteCurrentPrompt(),
            event
        );
    }
    
    /**
     * 删除当前 Prompt (移到回收站)
     */
    async deleteCurrentPrompt() {
        if (!this.currentPrompt) return;
        
        try {
            const response = await fetch(`${this.API_BASE}/prompts/${this.currentPrompt.id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('删除失败');
            
            const index = this.prompts.findIndex(p => p.id === this.currentPrompt.id);
            if (index > -1) {
                this.prompts.splice(index, 1);
            }
            
            this.currentPrompt = null;
            document.getElementById('emptyState').style.display = 'flex';
            document.getElementById('editorPanel').style.display = 'none';
            document.getElementById('historyPanel').style.display = 'none';
            
            this.renderPromptsList();
            this.renderTags();
            await this.loadRecycleBin();
            this.renderRecycleBin(); // 刷新回收站 UI（如果已打开）
            this.showToast('已移到回收站', 'success');
        } catch (e) {
            console.error('删除失败:', e);
            this.showToast('删除失败', 'error');
        }
    }
    
    /**
     * 复制到剪贴板
     */
    async copyToClipboard() {
        const content = document.getElementById('promptContent').value;
        
        if (!content) {
            this.showToast('没有可复制的内容', 'error');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(content);
            this.showToast('已复制到剪贴板 📋', 'success');
        } catch (e) {
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('已复制到剪贴板 📋', 'success');
        }
    }
    
    /**
     * 导出数据
     */
    exportData() {
        this.showExportFormatModal();
    }
    
    /**
     * 显示导出格式选择对话框
     */
    showExportFormatModal() {
        // 创建格式选择模态框
        const existingModal = document.getElementById('exportFormatModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.id = 'exportFormatModal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>选择导出格式</h3>
                <div class="export-format-options" style="display: flex; gap: 12px; margin: 20px 0;">
                    <button id="exportJsonBtn" class="btn btn-primary" style="flex: 1; padding: 16px;">
                        <div style="font-size: 24px; margin-bottom: 8px;">📄</div>
                        <div>JSON 格式</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">包含完整数据结构</div>
                    </button>
                    <button id="exportPyBtn" class="btn btn-secondary" style="flex: 1; padding: 16px;">
                        <div style="font-size: 24px; margin-bottom: 8px;">🐍</div>
                        <div>Python 格式</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">导出为 .py 变量</div>
                    </button>
                </div>
                <div class="modal-actions">
                    <button id="cancelExportBtn" class="btn btn-secondary">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 绑定事件
        document.getElementById('exportJsonBtn').addEventListener('click', () => {
            this.doExportJson();
            modal.remove();
        });
        document.getElementById('exportPyBtn').addEventListener('click', () => {
            this.doExportPython();
            modal.remove();
        });
        document.getElementById('cancelExportBtn').addEventListener('click', () => {
            modal.remove();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
    
    /**
     * 导出为 JSON 格式
     */
    doExportJson() {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            prompts: this.prompts
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prompts_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('导出 JSON 成功 📤', 'success');
    }
    
    /**
     * 将标题转换为有效的 Python 变量名
     */
    titleToVarName(title) {
        if (!title) return 'untitled';
        
        // 替换中文和特殊字符为下划线
        let varName = title
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_]/g, '_')  // 非字母数字中文替换为下划线
            .replace(/_+/g, '_')  // 多个下划线合并
            .replace(/^_|_$/g, '');  // 去除首尾下划线
        
        // 如果以数字开头，添加前缀
        if (/^[0-9]/.test(varName)) {
            varName = 'prompt_' + varName;
        }
        
        // 如果为空，使用默认名
        if (!varName) {
            varName = 'untitled';
        }
        
        return varName;
    }
    
    /**
     * 导出为 Python 格式
     */
    doExportPython() {
        const lines = [];
        lines.push('# -*- coding: utf-8 -*-');
        lines.push('"""');
        lines.push('Prompts 导出文件');
        lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`);
        lines.push(`总数量: ${this.prompts.length} 个 Prompt`);
        lines.push('"""');
        lines.push('');
        
        // 用于跟踪变量名避免重复
        const usedNames = new Set();
        
        this.prompts.forEach((prompt, index) => {
            // 生成变量名
            let varName = this.titleToVarName(prompt.title);
            
            // 确保变量名唯一
            let finalVarName = varName;
            let counter = 1;
            while (usedNames.has(finalVarName)) {
                finalVarName = `${varName}_${counter}`;
                counter++;
            }
            usedNames.add(finalVarName);
            
            // 添加注释
            lines.push(`# ${index + 1}. ${prompt.title || '未命名'}`);
            if (prompt.tags && prompt.tags.length > 0) {
                lines.push(`# 标签: ${prompt.tags.join(', ')}`);
            }
            lines.push(`# 更新时间: ${new Date(prompt.updatedAt).toLocaleString('zh-CN')}`);
            
            // 使用三引号处理多行内容
            const content = prompt.content || '';
            // 转义三引号
            const escapedContent = content.replace(/"""/g, '\\"\\"\\"');
            
            lines.push(`${finalVarName} = """${escapedContent}"""`);
            lines.push('');
        });
        
        // 添加汇总字典
        lines.push('# 所有 Prompts 的字典汇总');
        lines.push('ALL_PROMPTS = {');
        
        const usedNamesArray = Array.from(usedNames);
        this.prompts.forEach((prompt, index) => {
            const varName = usedNamesArray[index];
            const title = (prompt.title || '未命名').replace(/'/g, "\\'");
            lines.push(`    '${title}': ${varName},`);
        });
        
        lines.push('}');
        lines.push('');
        
        const blob = new Blob([lines.join('\n')], { type: 'text/x-python' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prompts_${new Date().toISOString().split('T')[0]}.py`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('导出 Python 成功 📤', 'success');
    }
    
    /**
     * 导入数据
     */
    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileName = file.name.toLowerCase();
        const isPython = fileName.endsWith('.py');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (isPython) {
                    this.importPythonData(e.target.result);
                } else {
                    this.importJsonData(e.target.result);
                }
            } catch (err) {
                console.error('导入失败:', err);
                this.showToast('导入失败，请检查文件格式', 'error');
            }
        };
        reader.readAsText(file);
        
        // 重置 input
        event.target.value = '';
    }
    
    /**
     * 导入 JSON 数据
     */
    async importJsonData(content) {
        const data = JSON.parse(content);
        
        if (data.prompts && Array.isArray(data.prompts)) {
            // 合并导入的数据
            const existingIds = new Set(this.prompts.map(p => p.id));
            const newPrompts = data.prompts.filter(p => !existingIds.has(p.id));
            
            if (newPrompts.length > 0) {
                // 保存每个新 prompt 到后端
                await this.saveImportedPrompts(newPrompts);
                this.prompts = [...newPrompts, ...this.prompts];
                this.render();
                this.showToast(`成功导入 ${newPrompts.length} 个 Prompt 📥`, 'success');
            } else {
                this.showToast('没有新的 Prompt 可导入', 'error');
            }
        } else {
            throw new Error('无效的数据格式');
        }
    }
    
    /**
     * 导入 Python 数据
     */
    async importPythonData(content) {
        const prompts = this.parsePythonPrompts(content);
        
        if (prompts.length === 0) {
            this.showToast('未找到有效的 Prompt 变量', 'error');
            return;
        }
        
        // 检查重复（基于内容）
        const existingContents = new Set(this.prompts.map(p => p.content));
        const newPrompts = prompts.filter(p => !existingContents.has(p.content));
        
        if (newPrompts.length > 0) {
            // 保存每个新 prompt 到后端
            await this.saveImportedPrompts(newPrompts);
            this.prompts = [...newPrompts, ...this.prompts];
            this.render();
            this.showToast(`成功从 Python 导入 ${newPrompts.length} 个 Prompt 📥`, 'success');
        } else {
            this.showToast('没有新的 Prompt 可导入（内容已存在）', 'error');
        }
    }
    
    /**
     * 保存导入的 prompts 到后端
     */
    async saveImportedPrompts(prompts) {
        const promises = prompts.map(prompt => 
            fetch(`${this.API_BASE}/prompts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prompt)
            })
        );
        
        try {
            await Promise.all(promises);
        } catch (e) {
            console.error('保存导入数据失败:', e);
            throw e;
        }
    }
    
    /**
     * 解析 Python 文件中的 Prompt 变量
     */
    parsePythonPrompts(content) {
        const prompts = [];
        const lines = content.split('\n');
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            
            // 查找注释行作为标题
            let title = '';
            let tags = [];
            
            // 检查是否是注释行（可能包含标题信息）
            if (line.trim().startsWith('#')) {
                // 尝试提取标题（格式: # 1. 标题名）
                const titleMatch = line.match(/^#\s*\d+\.\s*(.+)$/);
                if (titleMatch) {
                    title = titleMatch[1].trim();
                }
                
                // 检查下一行是否有标签
                if (i + 1 < lines.length) {
                    const tagLine = lines[i + 1];
                    const tagMatch = tagLine.match(/^#\s*标签:\s*(.+)$/);
                    if (tagMatch) {
                        tags = tagMatch[1].split(',').map(t => t.trim()).filter(t => t);
                        i++;
                    }
                }
                
                // 跳过更新时间注释
                if (i + 1 < lines.length && lines[i + 1].trim().startsWith('# 更新时间:')) {
                    i++;
                }
            }
            
            // 查找变量定义（三引号字符串）
            // 格式: var_name = """content"""
            const varMatch = line.match(/^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*=\s*\"\"\"(.*)$/);
            
            if (varMatch) {
                const varName = varMatch[1];
                let contentStart = varMatch[2];
                
                // 跳过特殊变量
                if (varName === 'ALL_PROMPTS') {
                    i++;
                    continue;
                }
                
                // 检查是否是单行三引号字符串
                if (contentStart.endsWith('"""')) {
                    // 单行情况
                    const contentValue = contentStart.slice(0, -3).replace(/\\"/g, '"');
                    
                    prompts.push({
                        id: this.generateId(),
                        title: title || this.varNameToTitle(varName),
                        content: contentValue,
                        tags: tags,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        history: []
                    });
                } else {
                    // 多行情况
                    let contentParts = [contentStart];
                    i++;
                    
                    while (i < lines.length) {
                        const currentLine = lines[i];
                        
                        // 检查是否包含结束三引号
                        const endIndex = currentLine.indexOf('"""');
                        if (endIndex !== -1) {
                            contentParts.push(currentLine.substring(0, endIndex));
                            break;
                        } else {
                            contentParts.push(currentLine);
                        }
                        i++;
                    }
                    
                    const contentValue = contentParts.join('\n').replace(/\\"/g, '"');
                    
                    prompts.push({
                        id: this.generateId(),
                        title: title || this.varNameToTitle(varName),
                        content: contentValue,
                        tags: tags,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        history: []
                    });
                }
            }
            
            i++;
        }
        
        return prompts;
    }
    
    /**
     * 将变量名转换为可读标题
     */
    varNameToTitle(varName) {
        return varName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
    }
    
    /**
     * 渲染版本选择器
     */
    renderVersionSelectors() {
        if (!this.currentPrompt) return;
        
        const selectA = document.getElementById('diffVersionA');
        const currentVersionLabel = document.getElementById('currentVersionLabel');
        
        // 当前版本号 = 历史版本数量 (新建时为 v0，保存一次后为 v1，以此类推)
        const currentVersionNum = this.currentPrompt.history.length;
        currentVersionLabel.textContent = `v${currentVersionNum} - ${this.formatTime(this.currentPrompt.updatedAt)}`;
        
        // 版本 A 只显示历史版本供选择 (v0, v1, v2...)
        const historyVersions = [];
        for (let i = this.currentPrompt.history.length - 1; i >= 0; i--) {
            const h = this.currentPrompt.history[i];
            historyVersions.push({
                index: i,
                label: `v${i}`,  // 版本号从 v0 开始
                time: this.formatTime(h.timestamp)
            });
        }
        
        if (historyVersions.length === 0) {
            selectA.innerHTML = '<option value="-1">暂无历史版本</option>';
            selectA.disabled = true;
        } else {
            selectA.disabled = false;
            const currentA = selectA.value;
            selectA.innerHTML = historyVersions.map(v => 
                `<option value="${v.index}">${v.label} - ${v.time}</option>`
            ).join('');
            
            // 恢复选择或设置默认值（最新历史版本）
            if (currentA && selectA.querySelector(`option[value="${currentA}"]`)) {
                selectA.value = currentA;
            } else {
                selectA.value = historyVersions[0].index;
            }
        }
    }
    
    /**
     * 获取版本内容
     */
    getVersionContent(versionIndex) {
        if (!this.currentPrompt) return '';
        
        if (versionIndex === 'current') {
            return this.currentPrompt.content;
        }
        
        const idx = parseInt(versionIndex);
        if (idx >= 0 && idx < this.currentPrompt.history.length) {
            return this.currentPrompt.history[idx].content;
        }
        
        return '';
    }
    
    /**
     * 更新差异对比显示
     */
    updateDiffComparison() {
        if (!this.currentPrompt) return;
        
        const selectA = document.getElementById('diffVersionA');
        const contentA = document.getElementById('diffContentA');
        const contentB = document.getElementById('diffContentB');
        
        // 版本 A: 从下拉框选择的历史版本
        const textA = this.getVersionContent(selectA.value);
        // 版本 B: 固定为当前版本
        const textB = this.currentPrompt.content;
        
        // 计算差异
        const diffResult = DiffTool.diff(textA, textB);
        
        // 收集差异项
        this.diffItems = [];
        
        // 生成 HTML
        // A 版本：只标记删除 (removed)
        // B 版本：标记新增 (added) 和 删除 (removed - 但显示为 text, 只是占位? 不，B 显示实际内容)
        // 实际上：
        // A 显示: textA 的内容。如果某行被删，它在 A 里存在，在 B 里消失。
        // B 显示: textB 的内容。如果某行新增，它在 B 里存在，在 A 里没有。
        
        // 为了对齐，我们需要知道每一行对应另一版本的哪一行。
        // 使用 lcs 算法我们知道：
        // A[i] matches B[j] (unchanged)
        // A[i] is removed (no match in B)
        // B[j] is added (no match in A)
        
        // 我们重新遍历 diffResult 来构建带映射的 HTML
        
        let htmlA = '';
        let htmlB = '';
        
        let indexA = 0; // A 的物理行号
        let indexB = 0; // B 的物理行号
        
        let diffIndex = 0;
        
        // 预处理结果来生成 HTML

        
        diffResult.forEach((item, idx) => {
            const content = this.escapeHTML(item.content) || '&nbsp;';
            
            if (item.type === 'removed') {
                // 历史版本面板：显示修改位置（用红色背景标记）
                this.diffItems.push({
                    type: 'removed',
                    index: diffIndex++,
                    pane: 'A',
                    lineIndex: indexA
                });
                htmlA += `<div class="diff-line removed" data-line="${indexA}" data-diff-index="${diffIndex-1}">- ${content}</div>`;
                indexA++;
                
            } else if (item.type === 'added') {
                this.diffItems.push({
                    type: 'added',
                    index: diffIndex++,
                    pane: 'B',
                    lineIndex: indexB
                });
                
                // 当前版本面板：显示新增（绿色）
                htmlB += `<div class="diff-line added" data-line="${indexB}" data-diff-index="${diffIndex-1}">+ ${content}</div>`;
                indexB++;
                
            } else {
                // 未变化的行 - 检查是否有字符级别的差异
                htmlA += `<div class="diff-line unchanged" data-line="${indexA}">  ${content}</div>`;
                htmlB += `<div class="diff-line unchanged" data-line="${indexB}">  ${content}</div>`;
                
                indexA++;
                indexB++;
            }
        });
        
        if (!htmlA) htmlA = '<div class="diff-line unchanged">(空)</div>';
        if (!htmlB) htmlB = '<div class="diff-line unchanged">(空)</div>';
        
        contentA.innerHTML = htmlA;
        contentB.innerHTML = htmlB;
        
        // 渲染导航条
        this.renderDiffNavigation();
        
        // 重置同步状态
        this.bindScrollSync();
    }
    
    /**

     * 绑定滚动同步
     */
    bindScrollSync() {
        const contentA = document.getElementById('diffContentA');
        const contentB = document.getElementById('diffContentB');
        
        let isSyncing = false;
        
        const doSync = (source, target) => {
            if (isSyncing) return;
            isSyncing = true;
            
            // 简单按比例同步 (回滚到最基础的逻辑，因为复杂逻辑用户反馈失效)
            // 或者尝试简单的行对应
            // 这里为了稳健，使用行对应 (因为我们有 data-line-map)
            
            // 找到 Source 中心的元素
            // ...不，用户想要简单。
            // 使用比例同步作为保底
            const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
            target.scrollTop = percentage * (target.scrollHeight - target.clientHeight);
            
            setTimeout(() => { isSyncing = false; }, 50);
        };
        
        contentA.addEventListener('scroll', () => doSync(contentA, contentB));
        contentB.addEventListener('scroll', () => doSync(contentB, contentA));
    }
    
    /**
     * 绑定差异行点击事件
     */
    bindDiffLineClicks() {
        const contentA = document.getElementById('diffContentA');
        const contentB = document.getElementById('diffContentB');
        
        const handleClick = (e) => {
            const line = e.target.closest('.diff-line');
            if (!line) return;
            
            // 如果是差异行
            if (line.hasAttribute('data-diff-index')) {
                const diffIndex = parseInt(line.dataset.diffIndex);
                const itemIndex = this.diffItems.findIndex(i => i.index === diffIndex);
                if (itemIndex !== -1) {
                    this.navigateToDiff(itemIndex);
                }
            } else {
                // 普通行点击，也可以尝试跳转 Textarea
                // 只有 Current 版本且非 Removed 行才跳转
                const pane = e.currentTarget;
                const selectId = pane === contentA ? 'diffVersionA' : 'diffVersionB';
                const isCurrent = document.getElementById(selectId).value === 'current';
                
                if (isCurrent && !line.classList.contains('removed')) {
                    const lineIndex = parseInt(line.dataset.line);
                    this.syncMainEditorToLine(lineIndex);
                }
            }
        };
        
        // 鼠标移动时同步主编辑区（仅当前版本面板）
        let syncTimeout = null;
        const handleMouseMove = (e) => {
            const line = e.target.closest('.diff-line');
            if (!line || line.classList.contains('removed')) return;
            
            const lineIndex = parseInt(line.dataset.line);
            if (isNaN(lineIndex)) return;
            
            // 使用节流避免频繁同步
            if (syncTimeout) clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => {
                this.syncMainEditorToLine(lineIndex);
            }, 100);
        };
        
        contentA.addEventListener('click', handleClick);
        contentB.addEventListener('click', handleClick);
        
        // 当前版本面板 (B) 添加鼠标跟随
        contentB.addEventListener('mousemove', handleMouseMove);
    }
    
    /**
     * 导航到指定的差异
     */
    navigateToDiff(index) {
        if (!this.diffItems || this.diffItems.length === 0) return;
        
        // 循环导航
        if (index < 0) index = this.diffItems.length - 1;
        if (index >= this.diffItems.length) index = 0;
        
        this.currentDiffIndex = index;
        const item = this.diffItems[index];
        
        // 更新导航数字显示
        const currentLabel = document.getElementById('diffNavCurrent');
        if (currentLabel) {
            currentLabel.textContent = index + 1;
        }
        
        // 更新 marker 激活状态
        const markers = document.querySelectorAll('.diff-nav-marker');
        markers.forEach((marker, i) => {
            marker.classList.toggle('active', i === index);
        });
        
        // 高亮差异行
        const contentA = document.getElementById('diffContentA');
        const contentB = document.getElementById('diffContentB');
        
        contentA.querySelectorAll('.active-diff').forEach(el => el.classList.remove('active-diff'));
        contentB.querySelectorAll('.active-diff').forEach(el => el.classList.remove('active-diff'));
        
        const targetPane = item.pane === 'A' ? contentA : contentB;
        const allDiffLines = targetPane.querySelectorAll('.diff-line.added, .diff-line.removed');
        if (allDiffLines[index]) {
            allDiffLines[index].classList.add('active-diff');
            allDiffLines[index].scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
    
    /**
     * 同步主编辑区到指定行
     */
    syncMainEditorToLine(lineIndex) {
        const textarea = document.getElementById('promptContent');
        if (!textarea) return;
        
        const lines = textarea.value.split('\n');
        if (lineIndex >= lines.length) lineIndex = lines.length - 1;
        if (lineIndex < 0) lineIndex = 0;
        
        // 计算字符位置
        let charPos = 0;
        for (let i = 0; i < lineIndex && i < lines.length; i++) {
            charPos += lines[i].length + 1;  // +1 for newline
        }
        
        // 计算行高和滚动位置
        const style = getComputedStyle(textarea);
        const lineHeight = parseFloat(style.lineHeight) || 20;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        
        // 滚动到目标行在顶部显示
        textarea.scrollTop = lineIndex * lineHeight;
        
        // 设置光标位置
        textarea.setSelectionRange(charPos, charPos);
    }
    
    /**
     * 渲染差异导航条
     */
    renderDiffNavigation() {
        const track = document.getElementById('diffNavTrack');
        const totalLabel = document.getElementById('diffNavTotal');
        const currentLabel = document.getElementById('diffNavCurrent');
        
        totalLabel.textContent = this.diffItems.length;
        currentLabel.textContent = this.diffItems.length > 0 ? '1' : '0';
        this.currentDiffIndex = 0;  // 初始化当前索引
        
        if (this.diffItems.length === 0) {
            track.innerHTML = '<span style="color: var(--text-muted); font-size: 0.7rem; position: absolute; left: 50%; transform: translateX(-50%);">无差异</span>';
            return;
        }
        
        let markersHTML = '';
        this.diffItems.forEach((item, idx) => {
            const pos = (idx / this.diffItems.length) * 100;
            const type = item.type === 'added' ? 'added' : 'removed';
            const isFirst = idx === 0 ? 'active' : '';
            markersHTML += `<div class="diff-nav-marker ${type} ${isFirst}" data-nav-index="${idx}" style="left: ${pos}%" title="双击删除此差异点"></div>`;
        });
        
        track.innerHTML = markersHTML;
        
        // 点击跳转
        track.onclick = (e) => {
            if (e.target.classList.contains('diff-nav-marker')) {
                const idx = parseInt(e.target.dataset.navIndex);
                this.navigateToDiff(idx);
            } else {
                const rect = track.getBoundingClientRect();
                const p = (e.clientX - rect.left) / rect.width;
                const idx = Math.floor(p * this.diffItems.length);
                this.navigateToDiff(Math.min(idx, this.diffItems.length - 1));
            }
        };
        
        // 双击删除差异点
        track.ondblclick = (e) => {
            if (e.target.classList.contains('diff-nav-marker')) {
                e.stopPropagation();
                const idx = parseInt(e.target.dataset.navIndex);
                this.deleteDiffPoint(idx);
            }
        };
    }
    
    /**
     * 删除单个差异点
     */
    deleteDiffPoint(index) {
        if (!this.diffItems || index < 0 || index >= this.diffItems.length) return;
        
        // 从数组中移除
        this.diffItems.splice(index, 1);
        
        // 重新渲染导航条
        this.renderDiffNavigation();
        
        // 如果还有差异点，导航到当前位置或上一个
        if (this.diffItems.length > 0) {
            const newIndex = Math.min(index, this.diffItems.length - 1);
            this.navigateToDiff(newIndex);
        }
        
        this.showToast('已删除差异点', 'success');
    }
    
    /**
     * 这里的代码占位是为了确保替换范围正确，不要删除下面的 helper
     */
    

    
    /**
     * 导航到上一个/下一个差异
     */
    navigateDiff(direction) {
        if (this.diffItems.length === 0) return;
        
        let newIndex = (this.currentDiffIndex || 0) + direction;
        this.navigateToDiff(newIndex);
    }
    
    /**
     * HTML 转义
     */
    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 恢复选中的版本
     */
    restoreSelectedVersion(which) {
        if (!this.currentPrompt) return;
        
        const selectId = which === 'A' ? 'diffVersionA' : 'diffVersionB';
        const versionIndex = document.getElementById(selectId).value;
        
        if (versionIndex === 'current') {
            this.showToast('已经是当前版本', 'error');
            return;
        }
        
        const idx = parseInt(versionIndex);
        if (idx < 0 || idx >= this.currentPrompt.history.length) return;
        
        const historyItem = this.currentPrompt.history[idx];
        const currentContent = this.currentPrompt.content;
        const restoredContent = historyItem.content;
        
        // 先保存当前版本到历史
        const now = new Date().toISOString();
        
        this.currentPrompt.history.push({
            version: this.currentPrompt.history.length,  // v0-based
            content: currentContent,
            timestamp: now,
            changes: '版本恢复前的内容'
        });
        
        // 找到第一个差异的位置
        const firstDiffPosition = this.findFirstDiffPosition(currentContent, restoredContent);
        
        // 恢复内容
        this.currentPrompt.content = restoredContent;
        this.currentPrompt.updatedAt = now;
        
        this.saveToStorage();
        
        const textarea = document.getElementById('promptContent');
        textarea.value = restoredContent;
        document.getElementById('charCount').textContent = `${restoredContent.length} 字符`;
        
        // 定位到差异位置
        this.scrollToPosition(textarea, firstDiffPosition);
        
        // 刷新版本选择器和对比
        this.renderVersionSelectors();
        this.updateDiffComparison();
        this.renderPromptsList();
        
        this.showToast(`已恢复到版本 ${historyItem.version}`, 'success');
    }
    
    /**
     * 删除选中的版本
     */
    deleteSelectedVersion(which, event = null) {
        if (!this.currentPrompt) return;
        
        // 检查是否有历史版本可删除
        if (!this.currentPrompt.history || this.currentPrompt.history.length === 0) {
            this.showToast('没有历史版本可删除', 'error');
            return;
        }
        
        const selectId = which === 'A' ? 'diffVersionA' : 'diffVersionB';
        const versionIndex = document.getElementById(selectId).value;
        
        if (versionIndex === 'current') {
            this.showToast('无法删除当前版本，请使用删除 Prompt 功能', 'error');
            return;
        }
        
        const idx = parseInt(versionIndex);
        
        if (isNaN(idx) || idx < 0 || idx >= this.currentPrompt.history.length) {
            this.showToast('请先选择要删除的历史版本', 'error');
            return;
        }
        
        const historyItem = this.currentPrompt.history[idx];
        
        this.showConfirmModal(
            '确认删除版本',
            `确定要删除版本 v${historyItem.version} 吗？删除后可在回收站中恢复。`,
            async () => {
                try {
                    const response = await fetch(
                        `${this.API_BASE}/prompts/${this.currentPrompt.id}/history/${historyItem.version}`,
                        { method: 'DELETE' }
                    );
                    
                    if (!response.ok) throw new Error('删除失败');
                    
                    const updatedPrompt = await response.json();
                    this.currentPrompt.history = updatedPrompt.history;
                    
                    // 更新本地 prompts 数组
                    const promptIdx = this.prompts.findIndex(p => p.id === this.currentPrompt.id);
                    if (promptIdx > -1) {
                        this.prompts[promptIdx] = this.currentPrompt;
                    }
                    
                    await this.loadRecycleBin();
                    this.renderRecycleBin(); // 刷新回收站 UI
                    this.renderVersionSelectors();
                    this.updateDiffComparison();
                    
                    this.showToast('版本已移至回收站', 'success');
                } catch (e) {
                    console.error('删除版本失败:', e);
                    this.showToast('删除失败', 'error');
                }
            },
            event
        );
    }
    
    /**
     * 打开回收站
     */
    openRecycleBin() {
        this.renderRecycleBin();
        document.getElementById('recycleBinModal').classList.add('show');
    }
    
    /**
     * 关闭回收站
     */
    closeRecycleBin() {
        document.getElementById('recycleBinModal').classList.remove('show');
    }
    
    /**
     * 渲染回收站内容
     */
    renderRecycleBin() {
        const container = document.getElementById('recycleBinContent');
        
        if (this.recycleBin.length === 0) {
            container.innerHTML = `
                <div class="recycle-empty">
                    <div class="recycle-empty-icon">🗑️</div>
                    <p>回收站是空的</p>
                </div>
            `;
            return;
        }
        
        // 区分完整 Prompt 和版本片段
        const promptItems = this.recycleBin.filter(item => !item.type || item.type !== 'version');
        const versionItems = this.recycleBin.filter(item => item.type === 'version');
        
        let html = '';
        
        // 渲染完整 Prompt
        if (promptItems.length > 0) {
            html += `
                <div class="recycle-section">
                    <div class="recycle-section-title">📝 已删除的 Prompt (${promptItems.length})</div>
                    <div class="recycle-items">
                        ${promptItems.map(item => `
                            <div class="recycle-item recycle-prompt-item" data-id="${item.id}">
                                <div class="recycle-item-info">
                                    <div class="recycle-item-title">${item.title || '未命名'}</div>
                                    <div class="recycle-item-time">删除于 ${this.formatTime(item.deletedAt)}</div>
                                    <div class="recycle-item-preview">${(item.content || '').substring(0, 50)}${(item.content || '').length > 50 ? '...' : ''}</div>
                                </div>
                                <div class="recycle-item-actions">
                                    <button class="btn btn-primary btn-sm recycle-restore-prompt-btn" data-id="${item.id}">
                                        ↩️ 恢复
                                    </button>
                                    <button class="btn btn-danger btn-sm recycle-delete-prompt-btn" data-id="${item.id}">
                                        ✕ 永久删除
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // 渲染版本片段（按 promptTitle 分组）
        if (versionItems.length > 0) {
            const groups = {};
            versionItems.forEach(item => {
                const key = item.promptTitle || '未命名';
                if (!groups[key]) {
                    groups[key] = {
                        promptId: item.promptId,
                        title: key,
                        items: []
                    };
                }
                groups[key].items.push(item);
            });
            
            html += `
                <div class="recycle-section">
                    <div class="recycle-section-title">📜 已删除的版本 (${versionItems.length})</div>
                    ${Object.values(groups).map(group => `
                        <div class="recycle-group" data-prompt-id="${group.promptId}">
                            <div class="recycle-group-header">
                                <span class="recycle-group-title">📝 ${group.title}</span>
                                <span class="recycle-group-count">${group.items.length} 个版本</span>
                            </div>
                            <div class="recycle-items">
                                ${group.items.map(item => `
                                    <div class="recycle-item" data-id="${item.id}">
                                        <div class="recycle-item-info">
                                            <div class="recycle-item-version">版本 ${item.version}</div>
                                            <div class="recycle-item-time">删除于 ${this.formatTime(item.deletedAt)}</div>
                                        </div>
                                        <div class="recycle-item-actions">
                                            <button class="btn btn-secondary btn-sm recycle-view-btn" data-id="${item.id}">
                                                👁 对比
                                            </button>
                                            <button class="btn btn-primary btn-sm recycle-restore-btn" data-id="${item.id}">
                                                ↩️ 恢复
                                            </button>
                                            <button class="btn btn-danger btn-sm recycle-delete-btn" data-id="${item.id}">
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // 绑定 Prompt 恢复/删除事件
        container.querySelectorAll('.recycle-restore-prompt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.restorePromptFromRecycleBin(btn.dataset.id);
            });
        });
        
        container.querySelectorAll('.recycle-delete-prompt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.permanentlyDeletePromptFromRecycleBin(btn.dataset.id, e);
            });
        });
        
        // 绑定版本相关事件
        container.querySelectorAll('.recycle-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewRecycleItem(btn.dataset.id);
            });
        });
        
        container.querySelectorAll('.recycle-restore-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.restoreRecycleItem(btn.dataset.id);
            });
        });
        
        container.querySelectorAll('.recycle-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.permanentlyDeleteRecycleItem(btn.dataset.id, e);
            });
        });
    }
    
    /**
     * 从回收站恢复 Prompt
     */
    async restorePromptFromRecycleBin(id) {
        try {
            const response = await fetch(`${this.API_BASE}/recycle-bin/restore/${id}`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('恢复失败');
            
            const prompt = await response.json();
            this.prompts.unshift(prompt);
            
            await this.loadRecycleBin();
            this.renderRecycleBin();
            this.renderPromptsList();
            this.renderTags();
            
            this.showToast('Prompt 已恢复', 'success');
        } catch (e) {
            console.error('恢复失败:', e);
            this.showToast('恢复失败', 'error');
        }
    }
    
    /**
     * 永久删除回收站中的 Prompt
     */
    async permanentlyDeletePromptFromRecycleBin(id, event = null) {
        this.showConfirmModal(
            '永久删除',
            '确定要永久删除此 Prompt 吗？此操作不可恢复。',
            async () => {
                try {
                    const response = await fetch(`${this.API_BASE}/recycle-bin/${id}`, {
                        method: 'DELETE'
                    });
                    
                    if (!response.ok) throw new Error('删除失败');
                    
                    await this.loadRecycleBin();
                    this.renderRecycleBin();
                    
                    this.showToast('已永久删除', 'success');
                } catch (e) {
                    console.error('删除失败:', e);
                    this.showToast('删除失败', 'error');
                }
            },
            event
        );
    }
    
    /**
     * 查看回收站项目（与其他版本对比）
     */
    viewRecycleItem(itemId) {
        const item = this.recycleBin.find(r => r.id === itemId);
        if (!item) return;
        
        this.currentRecycleItem = item;
        
        // 查找对应的 prompt
        const prompt = this.prompts.find(p => p.id === item.promptId);
        
        // 构建对比版本选项
        const select = document.getElementById('recycleCompareVersion');
        const versions = [];
        
        if (prompt) {
            versions.push({
                index: 'current',
                label: `当前版本 (v${prompt.history.length})`,  // v0-based
                content: prompt.content
            });
            
            prompt.history.forEach((h, i) => {
                versions.push({
                    index: i,
                    label: `版本 ${h.version}`,
                    content: h.content
                });
            });
        }
        
        // 添加回收站中同 prompt 的其他版本
        this.recycleBin
            .filter(r => r.promptId === item.promptId && r.id !== itemId)
            .forEach(r => {
                versions.push({
                    index: `recycle_${r.id}`,
                    label: `[已删除] 版本 ${r.version}`,
                    content: r.content
                });
            });
        
        select.innerHTML = versions.map(v => 
            `<option value="${v.index}">${v.label}</option>`
        ).join('');
        
        // 显示已删除版本内容
        const deletedContent = document.getElementById('recycleDiffDeleted');
        deletedContent.innerHTML = item.content.split('\n').map(line => 
            `<span class="diff-line unchanged">  ${this.escapeHTML(line)}</span>`
        ).join('');
        
        // 更新对比
        this.updateRecycleDiff();
        
        // 显示模态框
        document.getElementById('recycleDiffModal').classList.add('show');
    }
    
    /**
     * 更新回收站差异对比
     */
    updateRecycleDiff() {
        if (!this.currentRecycleItem) return;
        
        const select = document.getElementById('recycleCompareVersion');
        const versionIndex = select.value;
        
        let compareContent = '';
        
        if (versionIndex.startsWith('recycle_')) {
            const recycleId = versionIndex.replace('recycle_', '');
            const recycleItem = this.recycleBin.find(r => r.id === recycleId);
            if (recycleItem) {
                compareContent = recycleItem.content;
            }
        } else if (versionIndex === 'current') {
            const prompt = this.prompts.find(p => p.id === this.currentRecycleItem.promptId);
            if (prompt) {
                compareContent = prompt.content;
            }
        } else {
            const idx = parseInt(versionIndex);
            const prompt = this.prompts.find(p => p.id === this.currentRecycleItem.promptId);
            if (prompt && idx >= 0 && idx < prompt.history.length) {
                compareContent = prompt.history[idx].content;
            }
        }
        
        // 计算差异
        const diffResult = DiffTool.diff(this.currentRecycleItem.content, compareContent);
        
        // 渲染删除版本（标记被删除的行）
        const deletedContainer = document.getElementById('recycleDiffDeleted');
        let htmlDeleted = '';
        
        diffResult.forEach(item => {
            if (item.type === 'removed') {
                htmlDeleted += `<span class="diff-line removed">- ${this.escapeHTML(item.content) || '(空行)'}</span>`;
            } else if (item.type === 'unchanged') {
                htmlDeleted += `<span class="diff-line unchanged">  ${this.escapeHTML(item.content)}</span>`;
            }
        });
        
        // 渲染对比版本（标记添加的行）
        const compareContainer = document.getElementById('recycleDiffCompare');
        let htmlCompare = '';
        
        diffResult.forEach(item => {
            if (item.type === 'added') {
                htmlCompare += `<span class="diff-line added">+ ${this.escapeHTML(item.content) || '(空行)'}</span>`;
            } else if (item.type === 'unchanged') {
                htmlCompare += `<span class="diff-line unchanged">  ${this.escapeHTML(item.content)}</span>`;
            }
        });
        
        deletedContainer.innerHTML = htmlDeleted || '<span class="diff-line unchanged">(空内容)</span>';
        compareContainer.innerHTML = htmlCompare || '<span class="diff-line unchanged">(空内容)</span>';
    }
    
    /**
     * 关闭回收站对比
     */
    closeRecycleDiff() {
        document.getElementById('recycleDiffModal').classList.remove('show');
        this.currentRecycleItem = null;
    }
    
    /**
     * 从回收站恢复版本到 prompt
     */
    restoreFromRecycleBin() {
        if (!this.currentRecycleItem) return;
        
        const item = this.currentRecycleItem;
        const prompt = this.prompts.find(p => p.id === item.promptId);
        
        if (!prompt) {
            this.showToast('原 Prompt 已被删除，无法恢复', 'error');
            return;
        }
        
        // 添加回历史
        prompt.history.push({
            version: prompt.history.length,  // v0-based
            content: item.content,
            timestamp: item.timestamp,
            changes: `从回收站恢复 (原版本 ${item.version})`
        });
        
        // 从回收站删除
        const idx = this.recycleBin.findIndex(r => r.id === item.id);
        if (idx > -1) {
            this.recycleBin.splice(idx, 1);
        }
        
        this.saveToStorage();
        
        this.closeRecycleDiff();
        this.renderRecycleBin();
        
        // 如果当前正在编辑这个 prompt，刷新版本选择器
        if (this.currentPrompt && this.currentPrompt.id === prompt.id) {
            this.renderVersionSelectors();
            this.updateDiffComparison();
        }
        
        this.showToast('版本已恢复', 'success');
    }
    
    /**
     * 恢复回收站项目（快捷按钮）
     */
    restoreRecycleItem(itemId) {
        const item = this.recycleBin.find(r => r.id === itemId);
        if (!item) return;
        
        const prompt = this.prompts.find(p => p.id === item.promptId);
        
        if (!prompt) {
            this.showToast('原 Prompt 已被删除，无法恢复', 'error');
            return;
        }
        
        // 添加回历史
        prompt.history.push({
            version: prompt.history.length,  // v0-based
            content: item.content,
            timestamp: item.timestamp,
            changes: `从回收站恢复 (原版本 ${item.version})`
        });
        
        // 从回收站删除
        const idx = this.recycleBin.findIndex(r => r.id === itemId);
        if (idx > -1) {
            this.recycleBin.splice(idx, 1);
        }
        
        this.saveToStorage();
        this.renderRecycleBin();
        
        // 如果当前正在编辑这个 prompt，刷新版本选择器
        if (this.currentPrompt && this.currentPrompt.id === prompt.id) {
            this.renderVersionSelectors();
            this.updateDiffComparison();
        }
        
        this.showToast('版本已恢复', 'success');
    }
    
    /**
     * 永久删除回收站项目
     */
    permanentlyDeleteRecycleItem(itemId, event = null) {
        this.showConfirmModal(
            '永久删除',
            '确定要永久删除此版本吗？此操作不可恢复。',
            () => {
                const idx = this.recycleBin.findIndex(r => r.id === itemId);
                if (idx > -1) {
                    this.recycleBin.splice(idx, 1);
                    this.renderRecycleBin();
                    this.showToast('已永久删除', 'success');
                }
            },
            event
        );
    }
    
    /**
     * 清空回收站
     */
    emptyRecycleBin(event = null) {
        if (this.recycleBin.length === 0) {
            this.showToast('回收站已为空', 'error');
            return;
        }
        
        this.showConfirmModal(
            '清空回收站',
            `确定要清空回收站吗？这将永久删除 ${this.recycleBin.length} 个项目，此操作不可恢复。`,
            async () => {
                try {
                    const response = await fetch(`${this.API_BASE}/recycle-bin`, {
                        method: 'DELETE'
                    });
                    
                    if (!response.ok) throw new Error('清空失败');
                    
                    this.recycleBin = [];
                    this.renderRecycleBin();
                    this.showToast('回收站已清空', 'success');
                } catch (e) {
                    console.error('清空回收站失败:', e);
                    this.showToast('清空失败', 'error');
                }
            },
            event
        );
    }
    
    /**
     * 找到两个文本第一个差异的字符位置
     */
    findFirstDiffPosition(oldText, newText) {
        const minLen = Math.min(oldText.length, newText.length);
        for (let i = 0; i < minLen; i++) {
            if (oldText[i] !== newText[i]) {
                return i;
            }
        }
        // 如果前面都相同，差异在末尾
        return minLen;
    }
    
    /**
     * 滚动 textarea 到指定位置并设置光标
     */
    scrollToPosition(textarea, position) {
        // 聚焦到 textarea
        textarea.focus();
        
        // 设置光标位置
        textarea.selectionStart = position;
        textarea.selectionEnd = position;
        
        // 计算需要滚动的位置
        // 创建一个临时的隐藏元素来测量位置
        const text = textarea.value.substring(0, position);
        const lines = text.split('\n');
        const lineNumber = lines.length;
        
        // 估算每行的高度（基于 line-height）
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computedStyle.lineHeight) || 28;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 20;
        
        // 计算滚动位置，让差异行显示在视口中间
        const scrollPosition = (lineNumber - 1) * lineHeight - textarea.clientHeight / 2 + paddingTop;
        
        // 平滑滚动到位置
        textarea.scrollTo({
            top: Math.max(0, scrollPosition),
            behavior: 'smooth'
        });
    }
    
    /**
     * 渲染所有内容
     */
    render() {
        this.renderTags();
        this.renderPromptsList();
    }
    
    /**
     * 渲染标签列表
     */
    renderTags() {
        const container = document.getElementById('tagsContainer');
        const allTags = new Set();
        
        this.prompts.forEach(p => {
            p.tags.forEach(t => allTags.add(t));
        });
        
        if (allTags.size === 0) {
            container.innerHTML = '<span class="text-muted" style="font-size: 0.8rem; color: var(--text-muted);">暂无标签</span>';
            return;
        }
        
        container.innerHTML = Array.from(allTags).map(tag => 
            `<span class="tag ${this.activeTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</span>`
        ).join('');
        
        // 绑定标签点击事件
        container.querySelectorAll('.tag').forEach(tagEl => {
            tagEl.addEventListener('click', () => {
                const tag = tagEl.dataset.tag;
                if (this.activeTag === tag) {
                    this.activeTag = null;
                } else {
                    this.activeTag = tag;
                }
                this.renderTags();
                this.renderPromptsList();
            });
        });
    }
    
    /**
     * 渲染 Prompt 列表
     */
    renderPromptsList() {
        const container = document.getElementById('promptsList');
        
        let filtered = this.prompts;
        
        // 按标签筛选
        if (this.activeTag) {
            filtered = filtered.filter(p => p.tags.includes(this.activeTag));
        }
        
        // 按搜索词筛选
        if (this.searchQuery) {
            filtered = filtered.filter(p => 
                p.title.toLowerCase().includes(this.searchQuery) ||
                p.content.toLowerCase().includes(this.searchQuery) ||
                p.tags.some(t => t.toLowerCase().includes(this.searchQuery))
            );
        }
        
        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 10px;">📭</div>
                    <p>${this.prompts.length === 0 ? '还没有 Prompt' : '没有匹配的结果'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = filtered.map(prompt => `
            <div class="prompt-item ${this.currentPrompt?.id === prompt.id ? 'active' : ''} ${this.batchMode ? 'batch-mode' : ''} ${this.selectedPrompts.has(prompt.id) ? 'selected' : ''}" data-id="${prompt.id}">
                ${this.batchMode ? `<input type="checkbox" class="prompt-item-checkbox" ${this.selectedPrompts.has(prompt.id) ? 'checked' : ''}>` : ''}
                <div class="prompt-item-content">
                    <div class="prompt-item-title">${prompt.title || '未命名'}</div>
                    <div class="prompt-item-meta">
                        <span>${this.formatTime(prompt.updatedAt)}</span>
                        <span>v${prompt.history.length}</span>
                    </div>
                    ${prompt.tags.length > 0 ? `
                        <div class="prompt-item-tags">
                            ${prompt.tags.slice(0, 3).map(t => `<span class="prompt-item-tag">${t}</span>`).join('')}
                            ${prompt.tags.length > 3 ? `<span class="prompt-item-tag">+${prompt.tags.length - 3}</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        // 绑定点击事件
        container.querySelectorAll('.prompt-item').forEach(item => {
            const checkbox = item.querySelector('.prompt-item-checkbox');
            
            if (this.batchMode && checkbox) {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    this.togglePromptSelection(item.dataset.id);
                });
                
                item.addEventListener('click', (e) => {
                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.togglePromptSelection(item.dataset.id);
                    }
                });
            } else {
                item.addEventListener('click', () => {
                    this.selectPrompt(item.dataset.id);
                });
            }
        });
    }
    
    /**
     * 切换批量选择模式
     */
    toggleBatchMode() {
        this.batchMode = !this.batchMode;
        this.selectedPrompts.clear();
        this.updateBatchUI();
        this.renderPromptsList();
    }
    
    /**
     * 取消批量选择模式
     */
    cancelBatchMode() {
        this.batchMode = false;
        this.selectedPrompts.clear();
        this.updateBatchUI();
        this.renderPromptsList();
    }
    
    /**
     * 切换单个 Prompt 的选择状态
     */
    togglePromptSelection(id) {
        if (this.selectedPrompts.has(id)) {
            this.selectedPrompts.delete(id);
        } else {
            this.selectedPrompts.add(id);
        }
        this.updateBatchUI();
        
        // 更新视觉状态
        const item = document.querySelector(`.prompt-item[data-id="${id}"]`);
        if (item) {
            item.classList.toggle('selected', this.selectedPrompts.has(id));
        }
    }
    
    /**
     * 更新批量操作 UI
     */
    updateBatchUI() {
        const batchActions = document.getElementById('batchActions');
        const batchModeBtn = document.getElementById('batchModeBtn');
        const selectedCount = document.getElementById('selectedCount');
        
        if (this.batchMode) {
            batchActions.style.display = 'flex';
            batchModeBtn.style.display = 'none';
            selectedCount.textContent = this.selectedPrompts.size;
        } else {
            batchActions.style.display = 'none';
            batchModeBtn.style.display = 'block';
        }
    }
    
    /**
     * 批量删除选中的 Prompts
     */
    batchDelete(event = null) {
        if (this.selectedPrompts.size === 0) {
            this.showToast('请先选择要删除的 Prompt', 'error');
            return;
        }
        
        this.showConfirmModal(
            '批量删除',
            `确定要删除选中的 ${this.selectedPrompts.size} 个 Prompt 吗？删除后可在回收站中恢复。`,
            async () => {
                try {
                    const deletePromises = Array.from(this.selectedPrompts).map(id =>
                        fetch(`${this.API_BASE}/prompts/${id}`, { method: 'DELETE' })
                    );
                    
                    await Promise.all(deletePromises);
                    
                    // 从本地列表中移除
                    const deletedCount = this.selectedPrompts.size;
                    this.prompts = this.prompts.filter(p => !this.selectedPrompts.has(p.id));
                    
                    // 如果当前选中的 prompt 被删除，清空编辑器
                    if (this.currentPrompt && this.selectedPrompts.has(this.currentPrompt.id)) {
                        this.currentPrompt = null;
                        document.getElementById('emptyState').style.display = 'flex';
                        document.getElementById('editorPanel').style.display = 'none';
                        document.getElementById('historyPanel').style.display = 'none';
                    }
                    
                    this.cancelBatchMode();
                    await this.loadRecycleBin();
                    this.renderTags();
                    this.showToast(`已删除 ${deletedCount} 个 Prompt`, 'success');
                } catch (e) {
                    console.error('批量删除失败:', e);
                    this.showToast('批量删除失败', 'error');
                }
            },
            event
        );
    }
    
    /**
     * 页面关闭前自动保存（静默保存，不显示提示）
     */
    autoSaveBeforeClose() {
        if (!this.currentPrompt) return;
        
        const title = document.getElementById('promptTitle').value.trim();
        const content = document.getElementById('promptContent').value;
        const tagsStr = document.getElementById('tagsInput').value;
        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        // 只有有内容变化时才保存
        if (!title || !content.trim()) return;
        if (content === this.currentPrompt.content && 
            title === this.currentPrompt.title && 
            tags.join(',') === this.currentPrompt.tags.join(',')) return;
        
        const now = new Date().toISOString();
        const oldContent = this.currentPrompt.content;
        
        // 如果内容有变化，记录历史
        if (content !== oldContent) {
            this.currentPrompt.history.push({
                version: this.currentPrompt.history.length,
                content: oldContent,
                timestamp: this.currentPrompt.updatedAt,
                changes: '自动保存'
            });
        }
        
        // 更新 prompt
        this.currentPrompt.title = title;
        this.currentPrompt.content = content;
        this.currentPrompt.tags = tags;
        this.currentPrompt.updatedAt = now;
        
        // 同步保存（使用 sendBeacon 确保页面关闭前发送）
        const data = JSON.stringify(this.currentPrompt);
        navigator.sendBeacon(`${this.API_BASE}/prompts/${this.currentPrompt.id}`, 
            new Blob([data], { type: 'application/json' }));
    }
    
    /**
     * 退出应用（保存并关闭服务）
     */
    async exitApp(event = null) {
        this.showConfirmModal(
            '退出应用',
            '确定要退出吗？将自动保存当前修改并关闭服务。',
            async () => {
                // 先保存
                if (this.currentPrompt) {
                    this.autoSaveBeforeClose();
                }
                
                try {
                    // 关闭服务
                    await fetch(`${this.API_BASE}/shutdown`, { method: 'POST' });
                    this.showToast('服务已关闭', 'success');
                    
                    // 关闭页面
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                } catch (e) {
                    console.error('关闭服务失败:', e);
                }
            },
            event
        );
    }
    
    /**
     * 显示 Toast 通知
     */
    showToast(message, type = '') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }
    
    /**
     * 显示确认对话框（可选位置参数）
     */
    showConfirmModal(title, message, callback, event = null) {
        const modal = document.getElementById('confirmModal');
        const content = modal.querySelector('.modal-content');
        
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        
        // 如果有事件，定位到按钮附近
        if (event && event.target) {
            const rect = event.target.getBoundingClientRect();
            content.style.position = 'fixed';
            content.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
            content.style.top = `${Math.max(rect.top - 150, 20)}px`;
            content.style.right = 'auto';
            content.style.bottom = 'auto';
        } else {
            // 默认位置：清除固定定位
            content.style.position = '';
            content.style.left = '';
            content.style.top = '';
            content.style.right = '';
            content.style.bottom = '';
        }
        
        modal.classList.add('show');
        this.confirmCallback = callback;
        
        // 添加键盘事件监听
        this.modalKeyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.confirmCallback) {
                    this.confirmCallback();
                }
                this.hideConfirmModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hideConfirmModal();
            }
        };
        document.addEventListener('keydown', this.modalKeyHandler);
    }
    
    /**
     * 隐藏确认对话框
     */
    hideConfirmModal() {
        document.getElementById('confirmModal').classList.remove('show');
        this.confirmCallback = null;
        
        // 移除键盘事件监听
        if (this.modalKeyHandler) {
            document.removeEventListener('keydown', this.modalKeyHandler);
            this.modalKeyHandler = null;
        }
    }
    
    // ========== AI 优化功能 ==========
    
    /**
     * 显示 AI 优化对话框
     */
    showAIOptimizeModal() {
        const content = document.getElementById('promptContent').value;
        
        if (!content.trim()) {
            this.showToast('请先输入 Prompt 内容', 'error');
            return;
        }
        
        // 显示原始内容
        document.getElementById('aiOriginalContent').textContent = content;
        
        // 重置优化结果区域
        document.getElementById('aiOptimizedContent').innerHTML = '<div class="ai-placeholder">点击「开始优化」查看结果</div>';
        document.getElementById('aiOptimizedContent').classList.remove('has-content');
        
        // 隐藏加载和错误状态
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        document.getElementById('aiErrorMessage').style.display = 'none';
        
        // 禁用替换和保存按钮
        document.getElementById('replaceContentBtn').disabled = true;
        document.getElementById('saveOptimizedBtn').disabled = true;
        
        // 清除存储的优化结果和用户指令
        this.optimizedContent = null;
        this.originalContentForDiff = null;
        document.getElementById('aiUserPrompt').value = '';
        
        // 显示模态框
        document.getElementById('aiOptimizeModal').classList.add('show');
    }
    
    /**
     * 关闭 AI 优化对话框
     */
    closeAIOptimizeModal() {
        document.getElementById('aiOptimizeModal').classList.remove('show');
        this.optimizedContent = null;
    }
    
    /**
     * 运行 AI 优化
     */
    async runAIOptimize() {
        const content = document.getElementById('promptContent').value;
        const model = document.getElementById('aiModelSelect').value;
        const userPrompt = document.getElementById('aiUserPrompt').value.trim();
        
        // 收集模型参数
        const temperature = parseFloat(document.getElementById('aiTemperature').value);
        const topP = parseFloat(document.getElementById('aiTopP').value);
        const maxTokens = parseInt(document.getElementById('aiMaxTokens').value);
        const deepThinking = document.getElementById('aiDeepThinking').checked;
        
        // 显示加载状态
        document.getElementById('aiLoadingIndicator').style.display = 'flex';
        document.getElementById('aiErrorMessage').style.display = 'none';
        document.getElementById('aiOptimizedContent').innerHTML = '<div class="ai-placeholder">AI 正在分析优化中...</div>';
        document.getElementById('replaceContentBtn').disabled = true;
        document.getElementById('runOptimizeBtn').disabled = true;
        
        try {
            const response = await fetch(`${this.API_BASE}/ai/optimize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    content, 
                    model, 
                    userPrompt,
                    temperature,
                    topP,
                    maxTokens,
                    deepThinking
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '优化失败');
            }
            
            // 保存优化结果和原始内容
            this.optimizedContent = data.optimized;
            this.originalContentForDiff = content;
            
            // 显示优化结果（带差异高亮）
            this.updateOptimizedDisplay(document.getElementById('showDiffToggle').checked);
            document.getElementById('aiOptimizedContent').classList.add('has-content');
            
            // 启用替换和保存按钮
            document.getElementById('replaceContentBtn').disabled = false;
            document.getElementById('saveOptimizedBtn').disabled = false;
            
            this.showToast('优化完成 ✨', 'success');
        } catch (err) {
            console.error('AI 优化失败:', err);
            document.getElementById('aiErrorMessage').textContent = err.message;
            document.getElementById('aiErrorMessage').style.display = 'flex';
            document.getElementById('aiOptimizedContent').innerHTML = '<div class="ai-placeholder">优化失败，请重试</div>';
        } finally {
            document.getElementById('aiLoadingIndicator').style.display = 'none';
            document.getElementById('runOptimizeBtn').disabled = false;
        }
    }
    
    /**
     * 更新优化结果显示（切换差异/纯文本）
     */
    updateOptimizedDisplay(showDiff) {
        if (!this.optimizedContent) return;
        
        const container = document.getElementById('aiOptimizedContent');
        
        if (showDiff && window.DiffTool && this.originalContentForDiff) {
            // 使用 DiffTool 生成差异 HTML
            const diffResult = window.DiffTool.diff(this.originalContentForDiff, this.optimizedContent);
            container.innerHTML = window.DiffTool.toHTML(diffResult);
        } else {
            // 显示纯文本
            container.textContent = this.optimizedContent;
        }
    }
    
    /**
     * 保存优化结果为新版本
     */
    async saveOptimizedAsVersion() {
        if (!this.optimizedContent || !this.currentPrompt) {
            this.showToast('没有可保存的内容', 'error');
            return;
        }
        
        try {
            const prompt = this.currentPrompt;
            if (!prompt) {
                throw new Error('未找到当前 Prompt');
            }
            
            const oldContent = prompt.content;
            
            // 计算差异
            const diffResult = DiffTool.diff(oldContent, this.optimizedContent);
            const changesSummary = DiffTool.getSummary(diffResult);
            
            // 将当前内容保存到历史记录
            prompt.history = prompt.history || [];
            prompt.history.push({
                version: prompt.history.length,
                content: oldContent,
                timestamp: prompt.updatedAt || new Date().toISOString(),
                changes: 'AI 优化前的版本'
            });
            
            // 更新 prompt 内容
            prompt.content = this.optimizedContent;
            prompt.updatedAt = new Date().toISOString();
            
            // 保存到服务器
            const response = await fetch(`${this.API_BASE}/prompts/${prompt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prompt)
            });
            
            if (!response.ok) {
                throw new Error('保存失败');
            }
            
            // 同步更新编辑器内容
            document.getElementById('promptContent').value = this.optimizedContent;
            document.getElementById('charCount').textContent = `${this.optimizedContent.length} 字符`;
            
            // 刷新版本选择器
            this.renderVersionSelectors();
            
            // 更新差异对比
            this.updateDiffComparison();
            
            // 关闭模态框
            this.closeAIOptimizeModal();
            
            this.showToast(`已保存 (${changesSummary}) 💾`, 'success');
        } catch (err) {
            console.error('保存优化版本失败:', err);
            this.showToast('保存失败: ' + err.message, 'error');
        }
    }
    
    /**
     * 替换内容为优化结果
     */
    replaceWithOptimized() {
        if (!this.optimizedContent) {
            this.showToast('没有可替换的内容', 'error');
            return;
        }
        
        // 替换编辑器内容
        document.getElementById('promptContent').value = this.optimizedContent;
        document.getElementById('charCount').textContent = `${this.optimizedContent.length} 字符`;
        
        // 关闭模态框
        this.closeAIOptimizeModal();
        
        this.showToast('已替换为优化后的内容 ✓', 'success');
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.promptManager = new PromptManager();
});
