// 立即执行函数，隔离作用域
(function () {
    /**
     * 站点配置中心
     * ALL: 匹配所有对话气泡（包含问和答）的选择器
     * IS_AI: 用于判断当前节点是否为 AI 的检测函数 (返回 true/false)
     * GET_TEXT: (可选) 自定义提取文本内容的函数，用于精准获取文字
     * GET_HEADERS: (可选) 自定义提取标题的容器选择器，默认为当前节点
     */
    const SITE_CONFIGS = {
        'doubao.com': {
            ALL: 'div[data-testid="message_text_content"]',
            IS_AI: (el) => el.classList.contains('container-P2rR72'),
            // 豆包直接取 innerText 即可
        },
        'qianwen.com': {
            // 匹配问和答的外层容器
            ALL: 'div[class*="questionItem-"], div[class*="answerItem-"]',
            // 只要类名包含 answerItem 即为 AI
            IS_AI: (el) => el.className.includes('answerItem-'),
            // 精准提取：AI 取 markdown 区域，用户取 content 区域
            GET_TEXT_NODE: (el, isAi) => {
                return isAi
                    ? el.querySelector('.qk-markdown')
                    : (el.querySelector('[class*="content-"]') || el.querySelector('.bubble-uo23is'));
            }
        },
        'deepseek.com': {
            // DeepSeek 的对话通常在一个特定的 wrapper 中，这里做简单适配
            ALL: '.ds-markdown, .fbb737a4',
            IS_AI: (el) => el.classList.contains('ds-markdown') || el.closest('.ds-markdown'),
        },
        'yuanbao.tencent.com': {
            // 元宝所有消息都在这个 item 里
            ALL: '.agent-chat__list__item',
            // 通过 BEM 修饰符判断角色
            IS_AI: (el) => el.classList.contains('agent-chat__list__item--ai'),
            // 精准提取内容节点
            GET_TEXT_NODE: (el, isAi) => {
                return isAi
                    ? el.querySelector('.hyc-common-markdown') // AI 内容区
                    : el.querySelector('.hyc-content-text');   // 用户内容区
            }
        },
        'gemini.google.com': {
            // 扩大匹配范围：model-response 是 AI，.query-text-container 或 .query-text 是用户
            ALL: 'model-response, .query-text-container, .query-text, .user-query-content',
            IS_AI: (el) => el.tagName.toLowerCase() === 'model-response',
            GET_TEXT_NODE: (el, isAi) => {
                if (isAi) {
                    // 尝试多个可能的类名，Gemini 经常变动
                    return el.querySelector('.message-content') ||
                        el.querySelector('.markdown') ||
                        el.querySelector('.model-response-text') ||
                        el; // 实在找不到就返回自身
                }
                // 用户消息通常就在节点本身或其子层
                return el.querySelector('.query-text') || el;
            }
        },
        'chatgpt.com': {
            ALL: 'article',
            IS_AI: el => !!el.querySelector('[data-message-author-role="assistant"]'),
            CONTENT: '.markdown'
        },
    };

    // 获取当前站点的配置
    function getCurrentSiteConfig() {
        const host = window.location.host;
        if (host.includes('doubao.com')) return SITE_CONFIGS['doubao.com'];
        if (host.includes('qianwen.com')) return SITE_CONFIGS['qianwen.com'];
        if (host.includes('deepseek.com')) return SITE_CONFIGS['deepseek.com'];
        if (host.includes('yuanbao.tencent.com')) return SITE_CONFIGS['yuanbao.tencent.com'];
        if (host.includes('gemini.google.com')) return SITE_CONFIGS['gemini.google.com'];
        if (host.includes('chatgpt.com')) return SITE_CONFIGS['chatgpt.com'];
        return null;
    }

    // 核心提取逻辑
    function getChatData() {
        const config = getCurrentSiteConfig();
        if (!config) return [];

        const allMessages = document.querySelectorAll(config.ALL);

        // 使用 filter 过滤掉空节点或无效节点
        return Array.from(allMessages).map((el, index) => {
            // 1. 设置锚点 ID (如果未设置过)
            const id = el.getAttribute('data-nav-id') || `msg-${index}`;
            if (!el.getAttribute('data-nav-id')) {
                el.setAttribute('data-nav-id', id);
            }

            // 2. 判断角色
            const role = config.IS_AI(el) ? 'ai' : 'user';

            // 3. 提取文本内容
            let text = "";
            let contentNode = el; // 默认内容节点就是当前元素

            // 如果配置了自定义提取逻辑，则使用自定义逻辑
            if (config.GET_TEXT_NODE) {
                contentNode = config.GET_TEXT_NODE(el, role === 'ai');
            }

            if (contentNode) {
                text = contentNode.innerText.trim();
            }

            // 4. 提取子标题 (仅 AI)
            const subHeaders = [];
            if (role === 'ai' && contentNode) {
                // 在内容节点下查找标题
                contentNode.querySelectorAll('h1, h2, h3').forEach((h, hIdx) => {
                    const hId = `${id}-h-${hIdx}`;
                    // 避免重复设置
                    if (!h.getAttribute('data-nav-id')) {
                        h.setAttribute('data-nav-id', hId);
                    }
                    subHeaders.push({
                        id: hId,
                        level: h.tagName.toLowerCase(),
                        text: h.innerText.replace(/[#]/g, '').trim()
                    });
                });
            }

            return { id, role, text: text.substring(0, 100), subHeaders };
        }).filter(item => item.text.length > 0); // 过滤掉没有提取到文本的消息
    }

    // 消息监听器
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        // console.log("ContentJS 收到消息:", msg.type);

        if (msg.type === 'GET_DATA_NOW') {
            try {
                const data = getChatData();
                sendResponse({ data: data || [] });
            } catch (error) {
                console.error("提取数据出错:", error);
                sendResponse({ data: [], error: error.message });
            }
            return false; // 同步响应，避免通道关闭错误
        }

        if (msg.type === 'SCROLL_TO') {
            const target = document.querySelector(`[data-nav-id="${msg.id}"]`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // 添加临时高亮效果
                const originalTransition = target.style.transition;
                const originalBg = target.style.backgroundColor;

                target.style.transition = "background-color 0.5s";
                target.style.backgroundColor = "rgba(59, 130, 246, 0.1)"; // 浅蓝色高亮

                setTimeout(() => {
                    target.style.backgroundColor = originalBg;
                    setTimeout(() => {
                        target.style.transition = originalTransition;
                    }, 500);
                }, 1500);

                sendResponse({ success: true });
            } else {
                sendResponse({ success: false });
            }
            return false;
        }

        return false;
    });

    // 自动监听 DOM 变化并通知侧边栏
    let lastDataStr = "";
    // 防抖计时器，避免频繁发送消息
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            const data = getChatData();
            // 简单比对 JSON 字符串，如果数据变了才发送更新
            const currentDataStr = JSON.stringify(data.map(d => d.id + d.text.length)); // 仅比对ID和长度，性能更好

            if (currentDataStr !== lastDataStr) {
                lastDataStr = currentDataStr;
                // 发送消息，捕获错误防止后台未连接时报错
                try {
                    chrome.runtime.sendMessage({ type: 'UPDATE_LIST', data }).catch(() => { });
                } catch (e) { }
            }
        }, 500); // 500ms 防抖
    });

    // 启动监听
    observer.observe(document.body, { childList: true, subtree: true });

    // --- 新增：监听标签页可见性变化 ---
    document.addEventListener('visibilitychange', () => {
        // 当页面从后台切换到前台（visible）时，主动发送一次数据
        if (document.visibilityState === 'visible') {
            const data = getChatData();
            // 更新最后记录的字符串，防止重复触发
            lastDataStr = JSON.stringify(data.map(d => d.id + d.text.length));

            try {
                chrome.runtime.sendMessage({ type: 'UPDATE_LIST', data }).catch(() => { });
                console.log("页面可见，已自动同步数据");
            } catch (e) {
                // 插件上下文失效（如插件更新后未刷新页面），静默处理
            }
        }
    });

    // --- 新增：针对元宝等单页应用的路由切换监听 ---
    // 有些 AI 切换对话列表时不刷新页面，只改变 URL
    window.addEventListener('popstate', () => {
        setTimeout(() => {
            const data = getChatData();
            chrome.runtime.sendMessage({ type: 'UPDATE_LIST', data }).catch(() => { });
        }, 500);
    });

})();