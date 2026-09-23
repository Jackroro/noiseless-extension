document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('globalToggle');
  const adFoldToggle = document.getElementById('adFoldToggle');
  const apiKeyInput = document.getElementById('apiKey');
  const zhipuApiKeyInput = document.getElementById('zhipuApiKey');
  const atriaApiKeyInput = document.getElementById('atriaApiKey');
  const tavilyApiKeyInput = document.getElementById('tavilyApiKey');
  const keywordInput = document.getElementById('keywordInput');
  const tagsContainer = document.getElementById('tagsContainer');
  const privacyCheck = document.getElementById('privacyCheck');
  const saveBtn = document.getElementById('saveBtn');

  let keywords = [];

  const encodeKey = (str) => str ? btoa(encodeURIComponent(str)) : '';
  const decodeKey = (str) => {
    if (!str) return '';
    try { return decodeURIComponent(atob(str)); } catch(e) { return str; } 
  };

  chrome.storage.local.get(['enabled', 'adFoldEnabled', 'apiKey', 'zhipuApiKey', 'atriaApiKey', 'tavilyApiKey', 'keywords', 'privacyAccepted'], (data) => {
    toggleBtn.checked = data.enabled !== false;
    adFoldToggle.checked = data.adFoldEnabled !== false;
    apiKeyInput.value = decodeKey(data.apiKey);
    zhipuApiKeyInput.value = decodeKey(data.zhipuApiKey);
    atriaApiKeyInput.value = decodeKey(data.atriaApiKey);
    tavilyApiKeyInput.value = decodeKey(data.tavilyApiKey);
    keywords = data.keywords || [];
    privacyCheck.checked = !!data.privacyAccepted;
    saveBtn.disabled = !privacyCheck.checked;
    renderTags();
  });

  privacyCheck.addEventListener('change', (e) => {
    saveBtn.disabled = !e.target.checked;
  });

  const setupEye = (btnId, input) => {
    const btn = document.getElementById(btnId);
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    btn.onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; };
  };

  setupEye('toggleEyeGemini', apiKeyInput);
  setupEye('toggleEyeZhipu', zhipuApiKeyInput);
  setupEye('toggleEyeAtria', atriaApiKeyInput);
  setupEye('toggleEyeTavily', tavilyApiKeyInput);

  keywordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPendingKeyword(); });
  
  function addPendingKeyword() {
    const val = keywordInput.value.trim();
    if (val && !keywords.includes(val)) { keywords.push(val); renderTags(); }
    keywordInput.value = ''; keywordInput.focus();
  }

  function renderTags() {
    tagsContainer.innerHTML = '';
    keywords.forEach((kw, index) => {
      const tag = document.createElement('div'); tag.className = 'tag';
      const safeText = String(kw).replace(/[&<>"']/g, m => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'}[m]));
      tag.innerHTML = `<span>${safeText}</span><span class="tag-close" data-index="${index}">&times;</span>`;
      tagsContainer.appendChild(tag);
    });
    document.querySelectorAll('.tag-close').forEach(btn => {
      btn.onclick = (e) => { keywords.splice(e.target.getAttribute('data-index'), 1); renderTags(); };
    });
  }

  saveBtn.onclick = () => {
    addPendingKeyword(); 
    chrome.storage.local.set({
      enabled: toggleBtn.checked,
      adFoldEnabled: adFoldToggle.checked,
      apiKey: encodeKey(apiKeyInput.value.trim()),
      zhipuApiKey: encodeKey(zhipuApiKeyInput.value.trim()),
      atriaApiKey: encodeKey(atriaApiKeyInput.value.trim()),
      tavilyApiKey: encodeKey(tavilyApiKeyInput.value.trim()),
      keywords: keywords,
      privacyAccepted: privacyCheck.checked
    }, () => {
      saveBtn.innerText = '已生效 ✓';
      setTimeout(() => { saveBtn.innerText = '应用并保存设定'; }, 1500);
    });
  };
});