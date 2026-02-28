chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 监听标签更新，确保脚本注入
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {

  // 匹配多个目标域名（比如 React SPA 部署在两个域名下）
  const isTargetDomain = tab.url?.includes("doubao.com") ||
    tab.url?.includes("qianwen.com") ||
    tab.url?.includes("deepseek.com") ||
    tab.url?.includes("gemini.google.com") ||
    tab.url?.includes("chatgpt.com") ||
    tab.url?.includes("yuanbao.tencent.com");

  if (info.status === 'complete' && isTargetDomain) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    }).catch(() => { });
  }
});