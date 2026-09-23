# 🔍 Noiseless - 社交信息净化与逻辑透镜 (Logic Lens)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge-blue)](#)

> 基于用户私有 API Key 的推特 (X.com) 智能净化与客观事实/逻辑深度研判工具。零服务器中转，守护真实纯净的阅读体验。

---

## 💡 为什么需要 Noiseless？

在社交媒体信息流中，过度情绪化输出、营销炒作、事实缺乏佐证的推文日益泛滥。**Noiseless** 旨在通过大语言模型强大的结构化分析能力，为你提供客观、理性的第二视角：
- **不被情绪带偏**：拆解论点、论据与可信度。
- **净化信息视线**：智能柔性折叠推特赞助广告与无意义噪音。
- **纯私有沙盒安全**：无需第三方中间服务，完全由用户自带官方 API Key 直连大模型。

---

## ✨ 核心特性

### 1. 🔍 四维逻辑结构拆解 (Logic Lens)
在推文操作区一键调出研判窗口或通过右键划词分析，由大模型输出严格的标准化评估：
- **事实可验证度 (Facts)**：自动提取推文内的客观事实陈述，给出可查证度评分与说明。
- **逻辑严密性 (Logic)**：推演因果推理链条，指出逻辑跳跃或论证漏洞。
- **实践可行性 (Feasibility)**：评估建议的落地执行价值与现实局限性。
- **信噪比评估 (Noise)**：识别是否属于纯口水鸡汤、无增量宣泄或营销导流。

### 2. 🤖 多模型引擎协同 & 联网核实
- **多平台模型接入**：原生适配 Google Gemini (`gemini-3.8-flash` / `gemini-3.5-flash-lite`)、智谱 AI (`glm-5.3-flash`) 以及 Atria-Dawn。
- **故障降级与自动优选**：支持一键切换引擎与自动轮询重试。
- **Tavily 实时联网核验**：选填 Tavily API Key 后，分析时可实时挂载全网参考信源进行背景交叉核对。

### 3. 🛡️ 纯本地化安全与隐私保障
- **零服务端存储**：API Key 仅保存在用户浏览器的本地安全沙盒（`chrome.storage.local`），不上传、不收集任何浏览记录。
- **本地敏感词风控熔断**：内置本地词汇熔断机制，降低意外触发大模型官方违规封禁的风险。
- **轻量本地缓存**：研判结果在本地自动维护缓存队列，避免相同推文反复调用产生 Token 消耗。

### 4. 🧹 沉浸式阅读流过滤
- **赞助内容柔性折叠**：自动折叠推特页面流中的推广/广告推文（保留半透明占位条，支持点击展开）。
- **黑名单关键词屏蔽**：支持自定义屏蔽词过滤，自动淡化弱化命中规则的内容。
- **深浅色主题自适应**：深度匹配推特 Default（浅色）、Dim（暗蓝）与 Lights out（纯黑）界面模式。

---

## 📥 安装指南

### 方式一：加载离线安装包（开发者模式）
1. 在本仓库右侧 [Releases](../../releases) 页面下载最新的 `Noiseless-vX.X.X.zip` 并解压。
2. 打开 Google Chrome 或 Edge 浏览器，访问：`chrome://extensions/`。
3. 开启页面右上角的 **“开发者模式 (Developer mode)”** 开关。
4. 点击左上角 **“加载已解压的扩展程序 (Load unpacked)”**。
5. 选择解压出来的文件夹即可完成加载。

### 方式二：源码运行
```bash
# 克隆仓库
git clone [https://github.com/your-username/noiseless-extension.git](https://github.com/your-username/noiseless-extension.git)

# 按照上述步骤在浏览器扩展管理页直接载入该项目文件夹即可
