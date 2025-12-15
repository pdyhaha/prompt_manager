/**
 * 简单的文本差异对比算法
 * 基于最长公共子序列 (LCS) 实现
 * 只对比文字部分（中英文和数字），忽略标点符号
 */

class DiffTool {
    /**
     * 提取文本中的文字部分（中英文和数字）用于比较
     * @param {string} text - 原始文本
     * @returns {string} 只包含文字的文本
     */
    static extractText(text) {
        if (!text) return '';
        // 只保留中文、英文字母和数字
        return text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    }
    
    /**
     * 比较两行是否相同（只比较文字部分）
     * @param {string} line1 - 第一行
     * @param {string} line2 - 第二行
     * @returns {boolean} 文字部分是否相同
     */
    static textEqual(line1, line2) {
        return this.extractText(line1) === this.extractText(line2);
    }
    
    /**
     * 计算两个文本之间的差异
     * @param {string} oldText - 旧文本
     * @param {string} newText - 新文本
     * @returns {Array} 差异结果数组
     */
    static diff(oldText, newText) {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        
        const result = [];
        
        // 使用简化的 LCS 算法
        const lcs = this.getLCSWithTextCompare(oldLines, newLines);
        
        let oldIndex = 0;
        let newIndex = 0;
        let lcsIndex = 0;
        
        while (oldIndex < oldLines.length || newIndex < newLines.length) {
            if (lcsIndex < lcs.length) {
                // 处理删除的行（在旧版本中但不在 LCS 中）
                while (oldIndex < oldLines.length && !this.textEqual(oldLines[oldIndex], lcs[lcsIndex].content)) {
                    result.push({
                        type: 'removed',
                        content: oldLines[oldIndex],
                        lineNumber: oldIndex + 1
                    });
                    oldIndex++;
                }
                
                // 处理添加的行（在新版本中但不在 LCS 中）
                while (newIndex < newLines.length && !this.textEqual(newLines[newIndex], lcs[lcsIndex].content)) {
                    result.push({
                        type: 'added',
                        content: newLines[newIndex],
                        lineNumber: newIndex + 1
                    });
                    newIndex++;
                }
                
                // 处理未变化的行
                if (oldIndex < oldLines.length && newIndex < newLines.length) {
                    result.push({
                        type: 'unchanged',
                        content: newLines[newIndex], // 使用新版本内容
                        lineNumber: newIndex + 1
                    });
                    oldIndex++;
                    newIndex++;
                    lcsIndex++;
                }
            } else {
                // 处理剩余的行
                while (oldIndex < oldLines.length) {
                    result.push({
                        type: 'removed',
                        content: oldLines[oldIndex],
                        lineNumber: oldIndex + 1
                    });
                    oldIndex++;
                }
                
                while (newIndex < newLines.length) {
                    result.push({
                        type: 'added',
                        content: newLines[newIndex],
                        lineNumber: newIndex + 1
                    });
                    newIndex++;
                }
            }
        }
        
        return result;
    }
    
    /**
     * 使用文字比较的 LCS 算法
     */
    static getLCSWithTextCompare(arr1, arr2) {
        const m = arr1.length;
        const n = arr2.length;
        
        // 创建 DP 表
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        // 填充 DP 表（使用 textEqual 比较）
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (this.textEqual(arr1[i - 1], arr2[j - 1])) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        // 回溯找出 LCS
        const lcs = [];
        let i = m, j = n;
        
        while (i > 0 && j > 0) {
            if (this.textEqual(arr1[i - 1], arr2[j - 1])) {
                lcs.unshift({
                    content: arr2[j - 1],
                    oldIndex: i - 1,
                    newIndex: j - 1
                });
                i--;
                j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        
        return lcs;
    }
    
    /**
     * 生成差异的 HTML 展示
     * @param {Array} diffResult - diff 方法返回的差异结果
     * @returns {string} HTML 字符串
     */
    static toHTML(diffResult) {
        return diffResult.map(item => {
            const escapedContent = this.escapeHTML(item.content);
            return `<div class="diff-line ${item.type}">${escapedContent || '(空行)'}</div>`;
        }).join('');
    }
    
    /**
     * 转义 HTML 特殊字符
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    static escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 生成变更摘要
     * @param {Array} diffResult - diff 方法返回的差异结果
     * @returns {string} 变更摘要
     */
    static getSummary(diffResult) {
        const added = diffResult.filter(item => item.type === 'added').length;
        const removed = diffResult.filter(item => item.type === 'removed').length;
        
        if (added === 0 && removed === 0) {
            return '无变化';
        }
        
        const parts = [];
        if (added > 0) parts.push(`+${added} 行`);
        if (removed > 0) parts.push(`-${removed} 行`);
        
        return parts.join(', ');
    }
    
    /**
     * 计算相似度百分比
     * @param {string} oldText - 旧文本
     * @param {string} newText - 新文本
     * @returns {number} 相似度 0-100
     */
    static getSimilarity(oldText, newText) {
        if (oldText === newText) return 100;
        if (!oldText || !newText) return 0;
        
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const lcs = this.getLCS(oldLines, newLines);
        
        const maxLength = Math.max(oldLines.length, newLines.length);
        return Math.round((lcs.length / maxLength) * 100);
    }
    
    /**
     * 字符级别差异对比
     * @param {string} oldStr - 旧字符串
     * @param {string} newStr - 新字符串
     * @returns {Array} 差异结果
     */
    static diffChars(oldStr, newStr) {
        if (oldStr === newStr) return [{ type: 'unchanged', text: newStr }];
        if (!oldStr) return [{ type: 'added', text: newStr }];
        if (!newStr) return [{ type: 'removed', text: oldStr }];
        
        // 简单的字符级 LCS
        const m = oldStr.length;
        const n = newStr.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldStr[i - 1] === newStr[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        // 回溯找出差异
        const result = [];
        let i = m, j = n;
        
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
                result.unshift({ type: 'unchanged', text: oldStr[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.unshift({ type: 'added', text: newStr[j - 1] });
                j--;
            } else {
                result.unshift({ type: 'removed', text: oldStr[i - 1] });
                i--;
            }
        }
        
        // 合并相邻相同类型
        const merged = [];
        for (const item of result) {
            if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
                merged[merged.length - 1].text += item.text;
            } else {
                merged.push({ ...item });
            }
        }
        
        return merged;
    }
    
    /**
     * 生成行内差异 HTML
     * @param {string} oldLine - 旧行
     * @param {string} newLine - 新行
     * @param {Function} escapeHTML - HTML 转义函数
     * @returns {Object} { oldHTML, newHTML }
     */
    static getInlineHTML(oldLine, newLine, escapeHTML) {
        const diffs = this.diffChars(oldLine, newLine);
        
        let oldHTML = '';
        let newHTML = '';
        
        for (const diff of diffs) {
            const text = escapeHTML(diff.text);
            if (diff.type === 'unchanged') {
                oldHTML += text;
                newHTML += text;
            } else if (diff.type === 'removed') {
                oldHTML += `<span class="diff-char-removed">${text}</span>`;
            } else if (diff.type === 'added') {
                newHTML += `<span class="diff-char-added">${text}</span>`;
            }
        }
        
        return { oldHTML, newHTML };
    }
}

// 导出供其他模块使用
window.DiffTool = DiffTool;
