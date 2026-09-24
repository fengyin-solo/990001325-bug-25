/**
 * 社区便民留言板 - 前端脚本
 */

/**
 * 通用请求方法
 *
 * GET 请求（不改变数据）在网络失败时自动重试，重试沿用原 url 中的全部
 * 查询参数，因此当前筛选/排序/分页/定位条件不会丢失。
 *
 * POST 请求会改变数据，网络失败时无法确认服务端是否已处理，故不自动
 * 重试，由调用方提示用户手动重试，避免重复收藏、重复提交。
 *
 * @param {string} url 请求地址
 * @param {object} options fetch 配置
 * @param {number} retries 剩余重试次数（默认按请求方法决定）
 * @returns {Promise<Response>}
 */
function fetchWithRetry(url, options = {}, retries) {
    const method = (options.method || 'GET').toUpperCase();
    if (retries === undefined) {
        retries = method === 'GET' ? 2 : 0;
    }
    return fetch(url, options).catch(error => {
        if (retries > 0) {
            // 重试仍使用原 url（含当前筛选/排序/分页等查询条件），不改变查看条件
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    });
}

/**
 * 初始化无缝滚动
 *
 * 仅在内容宽度超出容器时复制一份用于无缝衔接；通过 data-cloned 保证
 * 同一批内容只复制一次，避免 bfcache 恢复或重复初始化时标题重复、错位。
 */
function initScrollContent() {
    const scrollContent = document.getElementById('scrollContent');
    if (!scrollContent || scrollContent.dataset.cloned === '1') return;

    const wrapper = scrollContent.parentElement;
    const needsScroll = wrapper && scrollContent.scrollWidth > wrapper.clientWidth;

    if (needsScroll) {
        scrollContent.innerHTML += scrollContent.innerHTML;
        scrollContent.classList.add('is-scrolling');
    }
    scrollContent.dataset.cloned = '1';
}

document.addEventListener('DOMContentLoaded', initScrollContent);

// 视口变化后重新判断是否需要无缝滚动
window.addEventListener('resize', initScrollContent);

// 从 bfcache 恢复页面（浏览器前进/后退）时强制重新加载，
// 防止删除、审核后短暂看到旧内容，也避免滚动内容被再次复制
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        window.location.reload();
    }
});

/**
 * 切换收藏状态
 */
function toggleFavorite(event, btn) {
    event.preventDefault();
    event.stopPropagation();

    const messageId = btn.dataset.messageId;
    if (!messageId) return;

    const icon = btn.querySelector('.favorite-icon');
    const text = btn.querySelector('.favorite-text');
    const originalIcon = icon.textContent;
    const originalText = text.textContent;
    const originalClass = btn.className;

    btn.disabled = true;

    const formData = new FormData();
    formData.append('message_id', messageId);
    formData.append('action', 'toggle');

    fetchWithRetry('api/favorite.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result.code === 0) {
            if (result.data.favorited) {
                btn.classList.add('favorited');
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-warning');
                icon.textContent = '⭐';
                text.textContent = '已收藏';
                showToast(result.msg, 'success');
            } else {
                btn.classList.remove('favorited');
                btn.classList.remove('btn-warning');
                btn.classList.add('btn-secondary');
                icon.textContent = '☆';
                text.textContent = '收藏';
                showToast(result.msg, 'info');

                if (window.location.pathname.includes('favorites.php')) {
                    const card = btn.closest('.message-card');
                    if (card) {
                        card.style.transition = 'all 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'translateX(-100px)';
                        setTimeout(() => {
                            card.remove();
                            updateFavoritesStats();
                            checkEmptyState();
                        }, 300);
                    }
                }
            }
        } else {
            showToast(result.msg || '操作失败', 'error');
            icon.textContent = originalIcon;
            text.textContent = originalText;
            btn.className = originalClass;
        }
    })
    .catch(error => {
        console.error('收藏操作失败:', error);
        showToast('网络错误，请稍后重试', 'error');
        icon.textContent = originalIcon;
        text.textContent = originalText;
        btn.className = originalClass;
    })
    .finally(() => {
        btn.disabled = false;
    });
}

/**
 * 更新收藏页面统计数据
 */
function updateFavoritesStats() {
    const statNumbers = document.querySelectorAll('.favorites-stats .stat-number');
    statNumbers.forEach(el => {
        const current = parseInt(el.textContent) || 0;
        if (current > 0) {
            el.textContent = current - 1;
        }
    });

    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle) {
        const match = subtitle.textContent.match(/\d+/);
        if (match) {
            const current = parseInt(match[0]) || 0;
            subtitle.textContent = `共收藏 ${Math.max(0, current - 1)} 条留言`;
        }
    }
}

/**
 * 检查收藏页面是否为空
 */
function checkEmptyState() {
    const list = document.querySelector('.message-list');
    if (!list) return;

    const cards = list.querySelectorAll('.message-card');
    if (cards.length === 0) {
        const container = document.querySelector('.message-list-section .container');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⭐</div>
                    <p>暂无收藏的留言</p>
                    <a href="index.php" class="btn btn-primary">去浏览留言</a>
                </div>
            `;
        }
    }
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.textContent = message;

    const styles = {
        position: 'fixed',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '0.9rem',
        zIndex: '9999',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        animation: 'slideDown 0.3s ease',
        maxWidth: '90%',
        textAlign: 'center'
    };

    const typeColors = {
        success: 'background: #10b981',
        error: 'background: #ef4444',
        info: 'background: #3b82f6',
        warning: 'background: #f59e0b'
    };

    Object.assign(toast.style, styles);
    toast.style.cssText += ';' + (typeColors[type] || typeColors.info);

    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes slideDown {
            from { opacity: 0; transform: translate(-50%, -20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(styleSheet);

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2000);
}

/**
 * 打开举报弹窗
 */
function openReportModal(messageId) {
    const modal = document.getElementById('reportModal');
    if (!modal) return;

    document.getElementById('reportMessageId').value = messageId;
    document.getElementById('reportForm').reset();
    document.getElementById('reportDescCount').textContent = '0';
    modal.style.display = 'flex';
}

/**
 * 关闭举报弹窗
 */
function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 初始化举报表单
 */
function initReportForm() {
    const form = document.getElementById('reportForm');
    if (!form) return;

    const descInput = document.getElementById('reportDescription');
    const descCount = document.getElementById('reportDescCount');

    if (descInput && descCount) {
        descInput.addEventListener('input', function() {
            descCount.textContent = this.value.length;
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        submitReport();
    });

    document.getElementById('reportModal').addEventListener('click', function(e) {
        if (e.target === this) closeReportModal();
    });
}

/**
 * 提交举报
 */
function submitReport() {
    const form = document.getElementById('reportForm');
    if (!form) return;

    const submitBtn = document.getElementById('reportSubmitBtn');
    const messageId = document.getElementById('reportMessageId').value;
    const reportType = form.querySelector('input[name="report_type"]:checked');
    const description = document.getElementById('reportDescription').value;

    if (!reportType) {
        showToast('请选择举报类型', 'warning');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    const formData = new FormData();
    formData.append('message_id', messageId);
    formData.append('report_type', reportType.value);
    formData.append('description', description);
    formData.append('action', 'submit');

    fetchWithRetry('api/report.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result.code === 0) {
            showToast(result.msg, 'success');
            closeReportModal();

            const reportBtn = document.querySelector('.report-btn[data-message-id="' + messageId + '"]');
            if (reportBtn) {
                reportBtn.disabled = true;
                reportBtn.classList.remove('btn-danger');
                reportBtn.classList.add('btn-secondary');
                const reportText = reportBtn.querySelector('.report-text');
                if (reportText) {
                    reportText.textContent = '已举报';
                }
            }
        } else {
            showToast(result.msg || '举报失败', 'error');
        }
    })
    .catch(error => {
        console.error('举报提交失败:', error);
        showToast('网络错误，请稍后重试', 'error');
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = '提交举报';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initReportForm();
});
