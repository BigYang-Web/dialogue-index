let allMessages = [];
let expandedIds = new Set();

async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isTargetDomain = tab.url?.includes("doubao.com") ||
    tab.url?.includes("qianwen.com") ||
    tab.url?.includes("deepseek.com") ||
    tab.url?.includes("gemini.google.com") ||
    tab.url?.includes("yuanbao.tencent.com");

    if (!isTargetDomain) {
        document.getElementById('list').innerHTML = '<div class="status-tip">支持的AI工具：豆包、千问、deepseek、元宝</div>';
        return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'GET_DATA_NOW' }, (res) => {
        if (!chrome.runtime.lastError && res?.data) {
            allMessages = res.data;
            render(allMessages);
        } else { setTimeout(init, 1000); }
    });
}

function render(data) {
    const list = document.getElementById('list');
    const keyword = document.getElementById('search').value.toLowerCase();

    // 过滤逻辑：搜索主内容或子标题
    const filtered = data.filter(m =>
        m.text.toLowerCase().includes(keyword) ||
        m.subHeaders.some(s => s.text.toLowerCase().includes(keyword))
    );

    if (filtered.length === 0) {
        list.innerHTML = '<div class="status-tip">无匹配结果</div>';
        return;
    }

    list.innerHTML = filtered.map(msg => {
        const hasSubs = msg.subHeaders.length > 0;
        const isExp = expandedIds.has(msg.id);

        return `
            <div class="message-group">
                <div class="nav-item" data-id="${msg.id}" data-can-fold="${hasSubs}">
                    <span class="role-tag ${msg.role === 'user' ? 'role-user' : 'role-ai'}">
                        ${msg.role === 'user' ? '问' : '答'}
                    </span>
                    ${hasSubs ? `<span class="fold-arrow" style="transform: rotate(${isExp ? 90 : 0}deg)">▶</span>` : ''}
                    <div class="content-preview">${escapeHtml(msg.text)}</div>
                </div>
                <div class="sub-headers-container" style="display: ${isExp ? 'block' : 'none'}">
                    ${msg.subHeaders.map(h => `
                        <div class="sub-item ${h.level}" data-id="${h.id}">
                            <span class="sub-icon">└</span> ${escapeHtml(h.text)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    bindClickEvents();
}

function bindClickEvents() {
    // 1. 处理主项：跳转 + 折叠切换
    document.querySelectorAll('.nav-item').forEach(el => {
        el.onclick = () => {
            const id = el.getAttribute('data-id');
            const canFold = el.getAttribute('data-can-fold') === 'true';

            // 执行网页跳转
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO', id });
            });

            // 执行折叠/展开记忆
            if (canFold) {
                const container = el.nextElementSibling;
                const arrow = el.querySelector('.fold-arrow');
                if (expandedIds.has(id)) {
                    expandedIds.delete(id);
                    container.style.display = 'none';
                    arrow.style.transform = 'rotate(0deg)';
                } else {
                    expandedIds.add(id);
                    container.style.display = 'block';
                    arrow.style.transform = 'rotate(90deg)';
                }
            }
        };
    });

    // 2. 处理子标题项：仅跳转，隔离冒泡
    document.querySelectorAll('.sub-item').forEach(el => {
        el.onclick = (e) => {
            e.stopPropagation(); // 【核心修复】防止点击子标题触发父级 nav-item 的折叠逻辑
            const id = el.getAttribute('data-id');
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO', id });
            });
        };
    });
}

function escapeHtml(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// 搜索监听：实时传入 allMessages 进行过滤
document.getElementById('search').oninput = () => render(allMessages);

// 自动更新监听
chrome.runtime.onMessage.addListener(m => {
    if (m.type === 'UPDATE_LIST') {
        allMessages = m.data;
        render(allMessages); // 更新时传入新数据，render 会根据 expandedIds 保持之前的展开状态
    }
});

document.addEventListener('DOMContentLoaded', init);