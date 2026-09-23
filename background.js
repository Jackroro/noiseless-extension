chrome.runtime.onInstalled.addListener(() => {
  // 清理之前已注册的右键菜单项
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll();
  }
});

const decodeKey = (str) => {
  if (!str) return '';
  try { return decodeURIComponent(atob(str)); } catch(e) { return str; }
};

// 自动补全截断的 JSON 闭合符号
function repairJson(jsonStr) {
  let str = jsonStr.trim();
  let inString = false;
  let isEscaped = false;
  const stack = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  if (inString) {
    str += '"';
  }

  str = str.replace(/,\s*$/, '');
  if (str.endsWith(':')) {
    str += 'null';
  }

  while (stack.length > 0) {
    const openChar = stack.pop();
    str = str.replace(/,\s*$/, '');
    if (openChar === '{') str += '}';
    else if (openChar === '[') str += ']';
  }

  return str;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'noiseless-logic-lens') return;

  let abortController = new AbortController();
  let isDisconnected = false;

  const safePostMessage = (msg) => {
    if (isDisconnected) return;
    try { port.postMessage(msg); } catch (e) { isDisconnected = true; }
  };

  port.onDisconnect.addListener(() => {
    isDisconnected = true;
    abortController.abort();
  });

  port.onMessage.addListener(async (msg) => {
    if (msg.action === 'analyze') {
      try {
        const data = await chrome.storage.local.get(['apiKey', 'zhipuApiKey', 'atriaApiKey', 'tavilyApiKey', 'cache']);
        const apiKey = decodeKey(data.apiKey).trim();
        const zhipuApiKey = decodeKey(data.zhipuApiKey).trim();
        const atriaApiKey = decodeKey(data.atriaApiKey).trim();
        const tavilyApiKey = decodeKey(data.tavilyApiKey).trim();
        let initialCache = data.cache || {};

        const specifiedProvider = msg.specifiedProvider;

        if (!apiKey && !zhipuApiKey && !atriaApiKey) { safePostMessage({ error: '请先在扩展面板中至少配置一个 API Key。' }); return; }

        if (msg.tweetId) {
          if (msg.forceRefresh && initialCache[msg.tweetId]) {
            delete initialCache[msg.tweetId];
            await chrome.storage.local.set({ cache: initialCache });
          } else if (!msg.forceRefresh && initialCache[msg.tweetId]) {
            const cachedItem = initialCache[msg.tweetId];
            safePostMessage({ status: 'cached', modelName: cachedItem.model || '本地缓存', fullJson: cachedItem.json, done: true });
            return;
          }
        }

        let searchContext = "";
        let referenceSources = [];

        if (tavilyApiKey) {
          safePostMessage({ status: 'tavily_searching' });
          const tavilyAbort = new AbortController();
          const timeoutId = setTimeout(() => tavilyAbort.abort(), 6000);
          try {
            const tRes = await fetch('https://api.tavily.com/search', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ api_key: tavilyApiKey, query: `背景资料核实: ${msg.text.substring(0, 300)}`, search_depth: "basic", include_answer: false }),
              signal: tavilyAbort.signal
            });
            clearTimeout(timeoutId);
            if (tRes.ok) {
              const tData = await tRes.json();
              if (tData.results && tData.results.length > 0) {
                searchContext = "\n【Tavily实时检索结果作为背景参考】\n" + tData.results.map(r => `- ${r.title}:${r.content}`).join('\n');
                referenceSources = tData.results.slice(0, 3).map(r => ({ title: r.title, url: r.url }));
              }
            }
          } catch (e) { clearTimeout(timeoutId); console.warn("Tavily 跳过"); }
        }

        const systemPrompt = `
你是一个极度理性的数据分析师。
请严格以 JSON 格式对下方社交媒体文本进行客观的逻辑结构拆解。

【强制约束】
1. 你的回答必须是合法的纯 JSON 字符串，严禁输出任何 markdown 标记（如 \`\`\`json ），换行与引号须正确转义。
2. 提取逻辑结构时，严禁复述原文中的违规或敏感词汇，采用中立学术概括。
3. 所有 score 字段统一采用正向评估（1%-99%），数值越高代表品质越好、价值越高：
   - facts.score：客观事实占比/可验证度（无事实或纯感性时给 0%~15%）
   - logic.score：逻辑严密性（因果推导越严密越高）
   - feasibility.score：实践指导性与落地可行性
   - noise.score：有效信息率（若全篇为鸡汤、情绪宣泄或营销广告，有效信息率应评为低分，如 5%~25%；若干货密集则评高分）
4. 若原文为纯主观感性表达或情绪宣泄，facts.items 可为空，并在 facts.summary 中简要说明。

【JSON 结构要求】
{
  "quality": "高|中|低",
  "facts": {
    "score": "XX%",
    "summary": "一句话评估事实客观度或无事实说明",
    "items": [
      { "statement": "具体事实陈述", "verifiability": "XX%" }
    ]
  },
  "logic": {
    "score": "XX%",
    "summary": "一句话定性论证严密性",
    "details": ["具体逻辑链分析1", "分析2"]
  },
  "feasibility": {
    "score": "XX%",
    "summary": "一句话定性实践指导意义",
    "details": ["现实局限或落地建议1", "局限2"]
  },
  "noise": {
    "score": "XX%",
    "summary": "一句话判定有效信息增量",
    "detail": "是否存在营销导流、口水鸡汤或纯情绪宣泄"
  }
}`;
        
        const finalUserText = `【待分析文本】\n${msg.text}\n${searchContext}`;
        
        let response = null;
        let activeProvider = '';
        let currentModelDisplayName = '';

        const requestGemini = async (modelCode, displayName) => {
          if (!apiKey) return null;
          safePostMessage({ status: 'ai_analyzing', modelName: displayName });
          try {
            return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelCode}:streamGenerateContent?alt=sse`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: finalUserText }] }],
                generationConfig: {
                  maxOutputTokens: 2500,
                  responseMimeType: "application/json"
                }
              }), signal: abortController.signal
            }).then(res => { if (res.ok) { activeProvider = 'gemini'; currentModelDisplayName = displayName; } return res; });
          } catch (e) { return null; }
        };

        const tryOpenAICompat = async (url, key, modelCode, displayName, isZhipu = false) => {
          if (!key) return null;
          safePostMessage({ status: 'ai_analyzing', modelName: displayName });
          try {
            const payload = {
              model: modelCode,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: finalUserText }],
              stream: true,
              max_tokens: 2500,
              temperature: 0.1
            };
            if (!isZhipu) {
              payload.response_format = { type: "json_object" };
            }
            
            return await fetch(url, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
              body: JSON.stringify(payload), signal: abortController.signal
            }).then(res => { if (res.ok) { activeProvider = 'openai_compat'; currentModelDisplayName = displayName; } return res; });
          } catch (e) { return null; }
        };

        const gemini38Model = 'gemini-3.8-flash'; 
        const gemini35LiteModel = 'gemini-3.5-flash-lite';
        const zhipuModel = 'glm-5.3-flash';

        if (specifiedProvider === 'gemini_38') response = await requestGemini(gemini38Model, 'Gemini 3.8 Flash');
        else if (specifiedProvider === 'gemini_35_lite') response = await requestGemini(gemini35LiteModel, 'Gemini 3.5 Flash Lite');
        else if (specifiedProvider === 'atria') response = await tryOpenAICompat('https://api.atria-asi.ai/v1/chat/completions', atriaApiKey, 'Atria-Dawn-Preview', 'Atria-Dawn');
        else if (specifiedProvider === 'zhipu') response = await tryOpenAICompat('https://open.bigmodel.cn/api/paas/v4/chat/completions', zhipuApiKey, zhipuModel, '智谱 GLM-5.3', true);
        else {
          if (apiKey) {
            response = await requestGemini(gemini38Model, 'Gemini 3.8 Flash');
            if (!response || !response.ok) response = await requestGemini(gemini35LiteModel, 'Gemini 3.5 Flash Lite');
          }
          if ((!response || !response.ok) && atriaApiKey) response = await tryOpenAICompat('https://api.atria-asi.ai/v1/chat/completions', atriaApiKey, 'Atria-Dawn-Preview', 'Atria-Dawn');
          if ((!response || !response.ok) && zhipuApiKey) response = await tryOpenAICompat('https://open.bigmodel.cn/api/paas/v4/chat/completions', zhipuApiKey, zhipuModel, '智谱 GLM-5.3', true);
        }

        if (!response || !response.ok) {
          safePostMessage({ error: `请求失败 (状态码: ${response ? response.status : '网络中断'})\n请检查 API Key 额度或网络连通性。` }); return;
        }

        safePostMessage({ modelName: currentModelDisplayName });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let streamBuffer = ""; 
        let fullResponse = ""; 
        let streamError = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop(); 
          
          for (let line of lines) {
            line = line.trim();
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6).trim());
                let content = '';

                if (activeProvider === 'openai_compat') {
                  const delta = parsed.choices?.[0]?.delta;
                  content = delta?.content || '';
                } else {
                  const candidate = parsed.candidates?.[0];
                  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                    if (candidate.finishReason === 'SAFETY') {
                      safePostMessage({ error: '已触发大模型官方安全审查 (SAFETY)，研判被平台强制掐断。' });
                      streamError = true; break;
                    }
                  }
                  content = candidate?.content?.parts?.[0]?.text || '';
                }

                if (content) fullResponse += content;
              } catch (e) {}
            }
          }
          if (streamError) break;
        }

        if (!streamError) {
          try {
            let cleanJsonStr = fullResponse;
            cleanJsonStr = cleanJsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
            cleanJsonStr = cleanJsonStr.replace(/```json/gi, '').replace(/```/g, '');
            const startIdx = cleanJsonStr.indexOf('{');
            
            if (startIdx === -1) {
              throw new Error("未检测到有效 JSON 起始结构。");
            }

            cleanJsonStr = cleanJsonStr.substring(startIdx);
            
            let jsonObj;
            try {
              jsonObj = JSON.parse(cleanJsonStr);
            } catch (initialErr) {
              const repairedStr = repairJson(cleanJsonStr);
              jsonObj = JSON.parse(repairedStr);
            }

            jsonObj.sources = referenceSources; 
            
            if (msg.tweetId && !isDisconnected) {
              const latestData = await chrome.storage.local.get('cache');
              let currentCache = latestData.cache || {};
              currentCache[msg.tweetId] = { json: jsonObj, model: currentModelDisplayName };
              const keys = Object.keys(currentCache);
              while (keys.length > 50) { delete currentCache[keys[0]]; keys.shift(); }
              chrome.storage.local.set({ cache: currentCache });
            }

            safePostMessage({ modelName: currentModelDisplayName, fullJson: jsonObj, done: true });
          } catch (parseErr) {
            let snippet = fullResponse.trim().substring(0, 150).replace(/</g, '&lt;');
            safePostMessage({ 
              error: `模型输出格式异常，研判中止。<br>详细原因: ${parseErr.message}<br><br><b>原始返回数据:</b><br><code style="color:#D97706; font-size:11px; display:block; margin-top:6px; word-break:break-all;">${snippet || '无返回数据'}...</code>` 
            });
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') safePostMessage({ error: err.message });
      }
    }
  });
});