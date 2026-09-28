let extensionEnabled = true;
let adFoldEnabled = true;
let blockKeywords = [];
const localSensitiveWords = ['色情', '血腥', '暴恐', '违禁测试词']; 

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

chrome.storage.local.get(['enabled', 'adFoldEnabled', 'keywords'], (result) => {
  extensionEnabled = result.enabled !== false;
  adFoldEnabled = result.adFoldEnabled !== false;
  blockKeywords = (result.keywords || []).filter(k => k.trim().length > 0);
  if (extensionEnabled) {
    scanAndProcessNewTweets();
    observeTweets();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.enabled) extensionEnabled = changes.enabled.newValue !== false;
    if (changes.adFoldEnabled) adFoldEnabled = changes.adFoldEnabled.newValue !== false;
    if (changes.keywords) blockKeywords = (changes.keywords.newValue || []).filter(k => k.trim().length > 0);
    if (extensionEnabled) {
      scanAndProcessNewTweets();
    }
  }
});

function observeTweets() {
  const observer = new MutationObserver((mutations) => {
    if (!extensionEnabled) return; 
    requestAnimationFrame(() => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches('article[role="article"], article[data-testid="tweet"]')) {
              processTweet(node);
            } else if (node.querySelectorAll) {
              const articles = node.querySelectorAll('article[role="article"]:not([data-x-processed="true"]), article[data-testid="tweet"]:not([data-x-processed="true"])');
              if (articles.length > 0) articles.forEach(processTweet);
            }
          }
        }
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function scanAndProcessNewTweets() {
  document.querySelectorAll('article[role="article"]:not([data-x-processed="true"]), article[data-testid="tweet"]:not([data-x-processed="true"])').forEach(processTweet);
}

function getXTheme() {
  const bg = window.getComputedStyle(document.body).backgroundColor || '';
  if (bg.includes('0, 0, 0')) return 'theme-lights-out';
  if (bg.includes('21, 32, 43')) return 'theme-dim';
  return 'theme-default';
}

function foldTweetSpace(article, reason) {
  const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
  if (cell.dataset.folded === 'true') return;
  cell.dataset.folded = 'true';
  cell.dataset.oldOpacity = cell.style.opacity; 
  cell.dataset.oldHeight = cell.style.height; 
  cell.dataset.oldOverflow = cell.style.overflow;
  cell.style.opacity = '0.25'; 
  cell.style.height = '60px'; 
  cell.style.overflow = 'hidden'; 
  cell.style.cursor = 'pointer';
  cell.title = `🙈 扩展已柔性折叠: ${reason} (点击展开)`;
  const unfoldHandler = () => unfoldTweetSpace(article);
  cell.addEventListener('click', unfoldHandler, { once: true });
  cell._unfoldHandler = unfoldHandler;
}

function unfoldTweetSpace(article) {
  const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
  if (cell.dataset.folded !== 'true') return;
  cell.dataset.folded = 'false';
  cell.style.opacity = cell.dataset.oldOpacity || ''; 
  cell.style.height = cell.dataset.oldHeight || ''; 
  cell.style.overflow = cell.dataset.oldOverflow || '';
  cell.style.cursor = ''; 
  cell.title = '';
  if (cell._unfoldHandler) cell.removeEventListener('click', cell._unfoldHandler);
}

function sanitizeHtml(str) { 
  return String(str || '').replace(/[&<>"']/g, m => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'}[m])); 
}

function processTweet(article) {
  article.dataset.xProcessed = "true";
  const isAd = article.querySelector('[data-testid="placementTracking"], [data-testid="promotedIndicator"]');
  if (isAd && adFoldEnabled) { foldTweetSpace(article, "推广内容"); return; }

  const textEls = article.querySelectorAll('div[data-testid="tweetText"], div[lang][dir="auto"]');
  if (textEls.length === 0) return;

  const currentTweetId = article.getAttribute('aria-labelledby') || Date.now().toString();
  unfoldTweetSpace(article);

  let rawText = Array.from(textEls).map(el => el.textContent).join(' ');
  let blockHit = blockKeywords.find(kw => {
    try {
      return new RegExp(escapeRegExp(kw), 'i').test(rawText);
    } catch (e) {
      return false;
    }
  });
  if (blockHit) { foldTweetSpace(article, `命中屏蔽词 "${blockHit}"`); return; }

  injectActionBtn(article, article.closest('[data-testid="cellInnerDiv"]') || article, currentTweetId, rawText);
}

function injectActionBtn(article, cell, tweetId, rawText) {
  if (article.querySelector('.fact-check-btn-wrapper')) return true;
  const textEls = article.querySelectorAll('div[data-testid="tweetText"], div[lang][dir="auto"]');
  if (textEls.length === 0) return false;

  const hasToolHint = /(github\.com|http:\/\/|https:\/\/|\.io|\.ai|\.app|\.dev|开源|架构|软件|工具|平台)/i.test(rawText);

  const wrapper = document.createElement('span');
  wrapper.className = 'fact-check-btn-wrapper';
  wrapper.style.cssText = `display: inline-flex; align-items: center; vertical-align: middle; margin-left: 8px; user-select: none; position: relative; z-index: 10;`;

  const btn = document.createElement('button');
  btn.innerHTML = hasToolHint ? `🛠️<span style="margin-left:3px; font-weight:600;">工具研判</span>` : `🔍<span style="margin-left:3px; font-weight:600;">研判</span>`;
  btn.style.cssText = `background: ${hasToolHint ? 'rgba(16,185,129,0.08)' : 'rgba(14,165,233,0.08)'}; border: 1px solid ${hasToolHint ? 'rgba(16,185,129,0.28)' : 'rgba(14,165,233,0.25)'}; color: ${hasToolHint ? '#059669' : '#0EA5E9'}; padding: 0 8px; border-radius: 12px; font-size: 12px; cursor: pointer; height: 22px; transition: all 0.2s;`;
  
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.preventDefault(); 
    e.stopPropagation();
    let currentText = Array.from(textEls).map(el => el.innerText.trim()).join('\n');
    
    if (localSensitiveWords.some(w => currentText.includes(w))) {
      alert("⚠️ Noiseless 提示：检测到潜在敏感或违规词汇。为保护您的 API Key 账户免受风控封禁，本地已熔断此次请求。");
      return;
    }

    toggleFactCheckPopup(btn, currentText, cell, tweetId, new Date().toISOString());
  });
  
  wrapper.appendChild(btn);
  textEls[0].appendChild(wrapper);
  return true;
}

function toggleFactCheckPopup(anchorBtn, text, cell, tweetId, tweetTime) {
  let existingHost = document.querySelector('.fact-check-shadow-host');
  if (existingHost) {
    if (existingHost._port) existingHost._port.disconnect();
    existingHost.remove();
    if (existingHost._anchorBtn === anchorBtn) return;
  }

  const host = document.createElement('div');
  host.className = `fact-check-shadow-host ${getXTheme()}`; 
  host._anchorBtn = anchorBtn;
  host.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15,23,42,0.65); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 2147483647;`;
  const shadow = host.attachShadow({ mode: 'open' });
  
  // 仅在明确点击背景遮罩外部时才关闭，防止误触
  host.addEventListener('click', (e) => {
    if (e.target === host) {
      if (host._port) host._port.disconnect();
      host.remove();
    }
  });

  shadow.innerHTML = `
    <style>
      :host { --bg-color: #FFFFFF; --card-bg: #FFFFFF; --card-border: #EDF2F7; --text-main: #334155; --text-sub: #64748B; --border-color: #E2E8F0; --title-color: #0F172A; --shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.12); --menu-bg: #FFFFFF; }
      :host(.theme-dim) { --bg-color: #15202B; --card-bg: rgba(255, 255, 255, 0.03); --card-border: #2B3742; --text-main: #E2E8F0; --text-sub: #94A3B8; --border-color: #38444D; --title-color: #FFFFFF; --menu-bg: #1E2732; }
      :host(.theme-lights-out) { --bg-color: #0B0E14; --card-bg: rgba(255, 255, 255, 0.025); --card-border: #1E2532; --text-main: #CBD5E1; --text-sub: #8B949E; --border-color: #1F2633; --title-color: #FFFFFF; --menu-bg: #16181C; }
      * { box-sizing: border-box; }
      .popup-card { position: relative; width: min(880px, calc(100vw - 40px)); height: min(820px, 86vh); background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 24px; box-shadow: var(--shadow); padding: 22px 28px; font-family: sans-serif; color: var(--text-main); display: flex; flex-direction: column; cursor: default; }
      
      .header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px; }
      .analyst-title { font-weight: 700; color: var(--title-color); font-size: 15px; }
      .quality-badge { font-size: 13px; font-weight: 700; padding: 4px 16px; border-radius: 20px; background: rgba(148,163,184,0.1); color: #64748B; border: 1px solid rgba(148,163,184,0.25); display: inline-flex; align-items: center; gap: 6px; }
      .quality-badge.level-high { background: rgba(16,185,129,0.1); color: #10B981; border-color: rgba(16,185,129,0.3); }
      .quality-badge.level-mid { background: rgba(245,158,11,0.1); color: #F59E0B; border-color: rgba(245,158,11,0.3); }
      .quality-badge.level-low { background: rgba(239,68,68,0.1); color: #EF4444; border-color: rgba(239,68,68,0.3); }
      
      .header-right { display: flex; align-items: center; gap: 8px; justify-self: end; }
      .refresh-btn { background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.22); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #0EA5E9; transition: all 0.2s ease; outline: none; padding: 0; }
      .refresh-btn svg { width: 16px; height: 16px; }
      .refresh-btn:hover { background: rgba(14, 165, 233, 0.2); }
      .refresh-btn.spinning svg { animation: spin 0.8s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .close-btn { background: none; border: none; font-size: 24px; color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; padding:0; }
      .close-btn:hover { color: #EF4444; background: rgba(239, 68, 68, 0.12); }

      .model-menu { position: absolute; top: 52px; right: 40px; background: var(--menu-bg); border: 1px solid var(--border-color); box-shadow: 0 14px 32px -6px rgba(0,0,0,0.25); border-radius: 14px; width: 250px; z-index: 10; display: none; flex-direction: column; padding: 6px; }
      .model-menu.show { display: flex; }
      .menu-header { font-size: 11px; font-weight: 700; color: var(--text-sub); padding: 8px 10px 4px; }
      .menu-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-main); }
      .menu-item:hover { background: rgba(14, 165, 233, 0.12); color: #0EA5E9; }

      .content { flex: 1; overflow-y: auto; padding-right: 8px; }
      .section-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; padding: 18px 22px; margin-bottom: 14px; }
      .section-card-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 15.5px; font-weight: 700; color: var(--title-color); margin-bottom: 12px; border-left: 3.5px solid #0EA5E9; padding-left: 8px; }
      .section-card-title.tool-accent { border-left-color: #10B981; }
      
      .title-text { display: inline-block; }
      .fact-item { display: flex; justify-content: space-between; padding: 10px; margin-bottom: 8px; background: rgba(148,163,184,0.04); border: 1px solid rgba(148,163,184,0.12); border-radius: 12px; font-size: 14px; }
      .prob-pill { font-size: 11.5px; font-weight: 700; color: #0284C7; background: rgba(14,165,233,0.12); padding: 2px 10px; border-radius: 12px; white-space: nowrap; }
      .prob-pill.green { color: #059669; background: rgba(16,185,129,0.12); }
      .prob-pill.yellow { color: #D97706; background: rgba(245,158,11,0.12); }
      .prob-pill.red { color: #DC2626; background: rgba(239,68,68,0.12); }
      
      .core-summary { background: rgba(14,165,233,0.06); color: #0284C7; padding: 8px 12px; border-radius: 10px; font-size: 13.5px; font-weight: 600; margin-bottom: 12px; }
      .core-summary.green { background: rgba(16,185,129,0.08); color: #059669; }
      
      .tool-grid { display: flex; flex-direction: column; gap: 14px; }
      .tool-item-card { background: rgba(148,163,184,0.03); border: 1px solid var(--border-color); border-radius: 14px; padding: 14px 16px; }
      .tool-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      .tool-name-badge { display: flex; align-items: center; gap: 8px; }
      .tool-name { font-size: 15px; font-weight: 700; color: var(--title-color); }
      .tool-cat { font-size: 11px; padding: 2px 7px; border-radius: 8px; background: rgba(148,163,184,0.15); color: var(--text-sub); }
      .pros-cons-container { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
      .pc-box { background: rgba(148,163,184,0.04); border-radius: 10px; padding: 10px 12px; }
      .pc-box-title { font-size: 12.5px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
      .pc-box.pros .pc-box-title { color: #10B981; }
      .pc-box.cons .pc-box-title { color: #F59E0B; }
      .pc-list-item { font-size: 13px; line-height: 1.45; margin-bottom: 4px; color: var(--text-main); }
      .verdict-box { margin-top: 10px; font-size: 12.5px; color: var(--text-sub); border-left: 2px solid #CBD5E1; padding-left: 8px; font-style: italic; }

      .loading { color: #0EA5E9; font-size: 14.5px; font-weight: 500; text-align: center; padding: 60px 0; animation: pulse 1.5s infinite; }
      .tech-disclaimer { margin-top: 18px; padding: 14px 18px; border-radius: 14px; background: linear-gradient(135deg, rgba(148, 163, 184, 0.06) 0%, rgba(14, 165, 233, 0.04) 100%); border: 1px solid rgba(148, 163, 184, 0.18); display: flex; gap: 12px; font-size: 12.5px; color: var(--text-sub); }
      
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    </style>
    <div class="popup-card" id="popupCard">
      <div class="header">
        <div class="analyst-title" id="analystTitle">逻辑透镜：正在接入神经网络...</div>
        <div style="text-align:center;"><div class="quality-badge" id="qualityBadge">深层结构推演中</div></div>
        <div class="header-right">
          <button class="refresh-btn" id="refreshBtn" title="切换引擎重新研判">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          </button>
          <button class="close-btn" id="closeBtn">&times;</button>
        </div>
        <div class="model-menu" id="modelMenu">
          <div class="menu-header">选择研判引擎重新计算</div>
          <div class="menu-item" data-provider="auto">🔄 自动优选 (3.8 ➔ 3.5 Lite ➔ ATRIA)</div>
          <div class="menu-item" data-provider="gemini_38">⚡ Gemini 3.8 Flash</div>
          <div class="menu-item" data-provider="gemini_35_lite">⚡ Gemini 3.5 Flash Lite</div>
          <div class="menu-item" data-provider="atria">🪐 Atria-Dawn</div>
          <div class="menu-item" data-provider="zhipu">🇨🇳 智谱 GLM-5.3</div>
        </div>
      </div>
      <div class="content" id="mainContent">
        <div class="loading" id="loadingText">⚡ 正在结构化重组内容逻辑与推演事实...<br><br><span style="font-size:12px; color:var(--text-sub);">为保障渲染稳定性，引擎切换为完整接收后展示。请稍候 (约 3-8 秒)</span></div>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const popupCard = shadow.getElementById('popupCard');
  const closeBtn = shadow.getElementById('closeBtn');
  const refreshBtn = shadow.getElementById('refreshBtn');
  const modelMenu = shadow.getElementById('modelMenu');
  const contentEl = shadow.getElementById('mainContent');
  const analystTitle = shadow.getElementById('analystTitle');
  const qualityBadge = shadow.getElementById('qualityBadge');
  
  popupCard.addEventListener('click', (e) => { e.stopPropagation(); modelMenu.classList.remove('show'); });
  closeBtn.onclick = (e) => { e.stopPropagation(); if (host._port) host._port.disconnect(); host.remove(); };
  refreshBtn.onclick = (e) => { e.stopPropagation(); modelMenu.classList.toggle('show'); };

  shadow.querySelectorAll('.menu-item').forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation(); 
      modelMenu.classList.remove('show');
      const provider = item.getAttribute('data-provider');
      startAnalysis(true, provider === 'auto' ? undefined : provider);
    };
  });

  function startAnalysis(isForce = false, specifiedProvider = undefined) {
    if (host._port) host._port.disconnect();
    
    qualityBadge.className = 'quality-badge';
    qualityBadge.innerText = '深层结构推演中';
    analystTitle.innerText = specifiedProvider ? `运算核心：切换至 ${specifiedProvider}...` : '运算核心：正在连接...';
    contentEl.innerHTML = `<div class="loading" id="loadingText">${isForce ? '🔄 正在清空缓存，重新发起深度研判...' : '⚡ 正在结构化重组内容逻辑与推演事实...<br><br><span style="font-size:12px; color:var(--text-sub);">为保障渲染稳定性，引擎切换为完整接收后展示。请稍候 (约 3-8 秒)</span>'}</div>`;
    refreshBtn.classList.add('spinning');

    let port;
    try { 
      port = chrome.runtime.connect({ name: 'noiseless-logic-lens' }); 
      host._port = port; 
    } catch (err) { 
      contentEl.innerHTML = `<div style="text-align:center; color:#EF4444; padding:40px;">核心组件断开，请刷新推特页面后重试。</div>`; 
      refreshBtn.classList.remove('spinning');
      return; 
    }

    port.postMessage({ 
      action: 'analyze', 
      text: text, 
      tweetId: tweetId, 
      tweetTime: tweetTime, 
      forceRefresh: isForce, 
      specifiedProvider: specifiedProvider 
    });

    port.onMessage.addListener((msg) => {
      if (!host.isConnected) { port.disconnect(); return; }

      const loadingText = shadow.getElementById('loadingText');

      if (msg.modelName) {
        const cleanName = msg.modelName.replace(/\s*\(深度逻辑推演中\)/g, '');
        if (msg.done || msg.status === 'cached') {
          analystTitle.innerText = `运算核心：${cleanName}`;
        } else {
          analystTitle.innerText = `运算核心：${cleanName} (深度逻辑推演中)`;
        }
      }

      if (msg.status === 'tavily_searching') { if (loadingText) loadingText.innerHTML = `🌐 正在通过 Tavily 探查产品背景与全网评测...`; return; }
      if (msg.status === 'ai_analyzing') { if (loadingText) loadingText.innerHTML = `✨ ${msg.modelName || 'AI'} 结构化逻辑与项目研判中...`; return; }
      
      // 关键修复：命中缓存时仅更新文字提示，不 return，继续向下走渲染流程
      if (msg.status === 'cached') { 
        if (loadingText) loadingText.innerHTML = `⚡ 已命中本地结构化缓存，正在加载...`; 
      }

      if (msg.error) {
        refreshBtn.classList.remove('spinning');
        contentEl.innerHTML = `<div style="padding:20px; color:#EF4444; background:rgba(239,68,68,0.08); border-radius:12px;">${sanitizeHtml(msg.error).replace(/\n/g, '<br/>')}</div>`;
        qualityBadge.className = 'quality-badge level-low'; 
        qualityBadge.innerText = '研判中止';
        return;
      }

      if (msg.fullJson && msg.done) {
        refreshBtn.classList.remove('spinning');
        const data = msg.fullJson;
        const q = data.quality || '中';
        qualityBadge.innerText = `综合质量评估：${q}`;
        qualityBadge.className = `quality-badge level-${q === '高' ? 'high' : q === '中' ? 'mid' : 'low'}`;

        let html = '';

        // 提及产品/项目/软件客观验证
        if (Array.isArray(data.product_eval) && data.product_eval.length > 0) {
          let productsHtml = data.product_eval.map(p => {
            const rawScore = parseInt(p.rating || '60', 10);
            const pillColorClass = rawScore >= 75 ? 'green' : (rawScore >= 50 ? 'yellow' : 'red');
            const prosList = (p.pros || []).map(item => `<div class="pc-list-item">✅ ${sanitizeHtml(item)}</div>`).join('');
            const consList = (p.cons || []).map(item => `<div class="pc-list-item">⚠️ ${sanitizeHtml(item)}</div>`).join('');

            return `
              <div class="tool-item-card">
                <div class="tool-header-row">
                  <div class="tool-name-badge">
                    <span class="tool-name">${sanitizeHtml(p.name)}</span>
                    <span class="tool-cat">${sanitizeHtml(p.category || '工具')}</span>
                  </div>
                  <span class="prob-pill ${pillColorClass}">推荐指数: ${sanitizeHtml(p.rating)}</span>
                </div>
                <div class="core-summary green" style="margin-bottom:8px;">🎯 <b>核心作用：</b>${sanitizeHtml(p.utility)}</div>
                <div class="pros-cons-container">
                  <div class="pc-box pros">
                    <div class="pc-box-title">优点 / 核心价值</div>
                    ${prosList || '<div class="pc-list-item" style="color:var(--text-sub);">暂无突出优点总结</div>'}
                  </div>
                  <div class="pc-box cons">
                    <div class="pc-box-title">缺点 / 局限性</div>
                    ${consList || '<div class="pc-list-item" style="color:var(--text-sub);">暂无明显痛点</div>'}
                  </div>
                </div>
                ${p.verdict ? `<div class="verdict-box">💬 研判简评：${sanitizeHtml(p.verdict)}</div>` : ''}
              </div>
            `;
          }).join('');

          html += `
            <div class="section-card">
              <div class="section-card-title tool-accent">
                <span class="title-text">🛠️ 提及项目 / 软件 / 网站实测评估</span>
              </div>
              <div class="tool-grid">${productsHtml}</div>
            </div>
          `;
        }

        // 一、事实可验证度
        let factItems = [];
        let factScore = '';
        let factSummary = '';

        if (Array.isArray(data.facts)) {
          factItems = data.facts;
        } else if (data.facts && typeof data.facts === 'object') {
          factItems = data.facts.items || [];
          factScore = data.facts.score || '';
          factSummary = data.facts.summary || '';
        }

        let factsScoreHtml = factScore ? `<span class="prob-pill">可验证度: ${sanitizeHtml(factScore)}</span>` : '';
        let factsBodyHtml = '';

        if (factSummary) {
          factsBodyHtml += `<div class="core-summary">💡 ${sanitizeHtml(factSummary)}</div>`;
        }

        if (factItems.length > 0) {
          factsBodyHtml += factItems.map((f, i) => `
            <div class="fact-item">
              <div><span style="font-weight:bold; color:#0EA5E9; margin-right:8px;">${i+1}.</span>${sanitizeHtml(f.statement)}</div>
              <span class="prob-pill">可验证度: ${sanitizeHtml(f.verifiability)}</span>
            </div>`).join('');
        } else {
          factsBodyHtml += `<div style="font-size:13.5px; color:var(--text-sub); padding:4px 0;">经研判，原文未包含明确可查验的客观事实数据，全篇偏向纯主观论点、感性表达或情绪宣泄。</div>`;
        }

        html += `<div class="section-card">
          <div class="section-card-title">
            <span class="title-text">一、事实可验证度</span>
            ${factsScoreHtml}
          </div>
          ${factsBodyHtml}
        </div>`;

        // 二、论据充分与逻辑严密性
        if (data.logic) {
          let detailsHtml = (data.logic.details || []).map(d => `<div style="margin-bottom:6px; font-size:14px;">- ${sanitizeHtml(d)}</div>`).join('');
          let logicScoreHtml = data.logic.score ? `<span class="prob-pill">严密概率: ${sanitizeHtml(data.logic.score)}</span>` : '';
          html += `<div class="section-card">
            <div class="section-card-title">
              <span class="title-text">二、论据充分与逻辑严密性</span>
              ${logicScoreHtml}
            </div>
            <div class="core-summary">💡 ${sanitizeHtml(data.logic.summary)}</div>
            ${detailsHtml}
          </div>`;
        }

        // 三、实践可行性
        if (data.feasibility) {
          let detailsHtml = (data.feasibility.details || []).map(d => `<div style="margin-bottom:6px; font-size:14px;">- ${sanitizeHtml(d)}</div>`).join('');
          let feasScoreHtml = data.feasibility.score ? `<span class="prob-pill">可行概率: ${sanitizeHtml(data.feasibility.score)}</span>` : '';
          html += `<div class="section-card">
            <div class="section-card-title">
              <span class="title-text">三、实践可行性</span>
              ${feasScoreHtml}
            </div>
            <div class="core-summary">💡 ${sanitizeHtml(data.feasibility.summary)}</div>
            ${detailsHtml}
          </div>`;
        }

        // 四、信噪比
        if (data.noise) {
          let noiseScoreHtml = data.noise.score ? `<span class="prob-pill">有效信息率: ${sanitizeHtml(data.noise.score)}</span>` : '';
          html += `<div class="section-card">
            <div class="section-card-title">
              <span class="title-text">四、信噪比</span>
              ${noiseScoreHtml}
            </div>
            <div class="core-summary">💡 ${sanitizeHtml(data.noise.summary)}</div>
            <div style="font-size:14px;">${sanitizeHtml(data.noise.detail)}</div>
          </div>`;
        }

        // 五、外部检索信源
        if (data.sources && data.sources.length > 0) {
          let linksHtml = data.sources.map(s => `<div style="margin-bottom:8px;"><a href="${sanitizeHtml(s.url)}" target="_blank" style="color:#0284C7; text-decoration:none; font-size:13.5px;">🔗 ${sanitizeHtml(s.title)}</a></div>`).join('');
          html += `<div class="section-card"><div class="section-card-title"><span class="title-text">五、外部检索信源</span></div>${linksHtml}</div>`;
        }

        html += `
          <div class="tech-disclaimer">
            <span style="font-size:16px;">ℹ️</span>
            <div>
              <div style="font-weight:700;margin-bottom:4px;">算法边界说明</div>
              所有评分与百分比均为大型语言模型基于文本逻辑与联网评测的概率推演，不代表绝对事实鉴定。内容仅供参考，不构成任何决策依据，请以官方信源与权威报道为准。
            </div>
          </div>
        `;

        contentEl.innerHTML = html;
      }
    });
  }

  startAnalysis(false);
}