/**
 * 社区便民留言板 - 前端脚本
 */

/**
 * 从 bfcache 恢复页面（浏览器后退/前进）时强制重新加载，
 * 避免后台删除留言后，列表页/详情页短暂还原成已删除的旧内容
 */
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        window.location.reload();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    initScroll();
});

/**
 * 初始化无缝滚动
 * 关键点：
 * - 条目间距放在每个条目自身的 margin-right 上，复制后首尾间距一致，不会错位
 * - 按实际宽度复制足够份数（至少两份），条目很少时也能填满容器无缝衔接
 * - 用 WAAPI 按实际宽度驱动位移，而不是固定 translateX(-50%)
 */
function initScroll() {
    const content = document.getElementById('scrollContent');
    if (!content) return;

    const items = Array.from(content.children);
    if (items.length === 0) return;

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let animation = null;

    function setup() {
        if (animation) {
            animation.cancel();
            animation = null;
        }
        // 重置为服务端渲染的原始条目后再复制，避免窗口变化时重复堆积
        const originals = items.slice();
        content.innerHTML = '';
        originals.forEach(item => content.appendChild(item));

        const wrapperWidth = content.parentElement.clientWidth;
        // 第一组内容的总宽（含每条自身的右间距）
        let setWidth = 0;
        originals.forEach(item => { setWidth += item.offsetWidth; });
        if (setWidth === 0) return;

        // 至少复制一份；一组内容填不满容器时复制到能填满为止
        const copies = Math.max(2, Math.ceil(wrapperWidth / setWidth) + 1);
        for (let c = 1; c < copies; c++) {
            originals.forEach(item => {
                content.appendChild(item.cloneNode(true));
            });
        }

        // 速度恒定：每像素 30/1200 秒（原动画约 30s 滚完一屏）
        const duration = (setWidth / 1200) * 30000;
        animation = content.animate(
            [{ transform: 'translateX(0)' }, { transform: `translateX(-${setWidth}px)` }],
            { duration: duration, iterations: Infinity, easing: 'linear' }
        );
    }

    let resizeTimer = null;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setup, 200);
    });

    // 字体加载后条目宽度可能变化，字体就绪后计算一次；同时立即兜底执行一次
    setup();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(setup);
    }
    window.addEventListener('load', setup);
}

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

    fetch('api/favorite.php', {
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

                // 以接口成功返回为前提再刷新；刷新保留当前筛选/排序/页码，
                // 列表与统计数字统一由服务端重新计算，不会残留旧内容或出现数字漂移
                if (window.location.pathname.includes('favorites.php')) {
                    const card = btn.closest('.message-card');
                    if (card) {
                        card.style.transition = 'all 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'translateX(-100px)';
                        setTimeout(() => window.location.reload(), 300);
                    } else {
                        window.location.reload();
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

    fetch('api/report.php', {
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
