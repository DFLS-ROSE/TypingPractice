# TypingPractice

参考**金山打字通**的阶段性打字学习练习软件。Electron + 原生 HTML/CSS/JS（ES Modules，**零构建链**），课程与素材全部 JSON 数据驱动——加一节课、换一段练习文本都不用碰代码。

- 版本：v1.2.1 ｜ 平台：Windows x64 ｜ 许可：MIT

## 功能

| 模块 | 说明 |
|---|---|
| 打字教程 | S1–S6 六个阶段 17 节课（认识键盘 → 基准键 → 上排 → 下排 → 数字符号 → 综合文章），每节课「课程说明 → 按键练习 → 混合练习 → 小节测试」，按成绩评 1–3 星 |
| 打字引擎 | `keydown` 逐字判定；**严格模式**（按错即停）/ **自由模式**（可退格改正）**练习中可随时切换**；打错时在期望字符正上方显示你**实际按下的键**（⏎/␣ 会显式标注），**改对或退格撤回后标注消失，但该位仍算错过、保留标红记录**；实时统计 WPM / CPM / 准确率 / 每个键的错误次数 |
| 虚拟键盘 | 高亮当前应击键并联动对应 Shift，八色指法着色，F/J 定位点，按错闪烁 |
| 素材练习 | 内置英文文章与词库 + **「导入 txt」**（在「文章」tab 导入归文章、在「词库」tab 导入归词库；导入内容存在用户目录，覆盖安装/卸载不丢） |
| 在线素材 | 「在线」tab 按关键词取素材：**主题词库**（Datamuse）、**例句短文**（Tatoeba）、**高频词表**（Google 10000）。搜到后预览 → 一键导入为词库或文章，无需手动准备 txt |
| AI 生成素材 | 自己填大模型 API（OpenAI 兼容，DeepSeek / 通义 / Kimi / 智谱 / OpenAI 等均可），在「在线 → AI 生成」输入主题即可生成**词库**或**短文**。Key 用系统凭据加密存本机，不上传第三方 |
| 速度测试 | 1 / 3 / 5 分钟限时，随机单词或文章两种来源，限时到自动出成绩 |
| 成绩统计 | 练习次数、累计时长、最佳 WPM、平均准确率、WPM 趋势图、最近记录、课程进度 |
| 多会话保留 | 离开练习页自动暂停计时（**暂停时间不计入用时**），侧栏列出**所有进行中的练习**（标题 + 进度），可随时切回任意一个继续；最多同时保留 6 个，可单条放弃 |
| 设置 | 默认练习模式、虚拟键盘开关、清空记录、当前版本显示与检查更新（自动更新入口） |

## 快速开始

环境要求：Node.js 18+（仅开发需要）、Windows 10/11。

```bash
git clone <你的仓库地址>
cd TypingPractice
npm install
npm start
```

## 目录结构

```
TypingPractice/
├── main.js                 # 主进程：app:// 协议、IPC、成绩持久化
├── preload.js              # contextBridge，向渲染层暴露 window.api
├── online.js               # 在线素材源适配（域名白名单 + 超时 + 文本清洗）
├── ai.js                   # 大模型素材生成（Key 加密存储 + OpenAI 兼容调用 + 输出清洗）
├── electron-builder.js     # 打包配置（appId / NSIS / files 白名单）
├── package.json            # 依赖与脚本（start / test / dist）
├── renderer/
│   ├── index.html          # 入口（CSP 已配置）
│   ├── css/style.css
│   └── js/
│       ├── app.js          # 导航、会话管理、成绩保存（串行化）
│       ├── engine.js       # 打字引擎 + 星级评定（纯逻辑，可单测）
│       ├── keyboard.js     # 虚拟键盘
│       ├── session.js      # 练习界面（计时、结果面板、模式切换、错字符标注、暂停/恢复）
│       ├── storage.js      # JSON 加载 + userData 读写封装
│       └── views/          # tutorial / practice / test / stats / settings
├── data/                   # 全部数据，改这里就等于改内容
│   ├── curriculum.json     # 课程：阶段 → 分节 → 文本/星级标准
│   ├── layout.json         # 键位坐标 + 八色指法配色
│   └── materials/          # articles.json（文章）/ words.json（词库）
├── scripts/
│   ├── gen-icon.mjs        # 生成应用图标 build/icon.png
│   └── repair-records.mjs  # 清洗异常练习记录
├── test/engine.test.mjs    # 引擎单元测试（28 项）
├── build/icon.png          # 应用图标（npm run icon 可重新生成）
└── README.md               # 本文档；RELEASE_NOTES.md 仅本机维护（已 gitignore）
```

## 添加练习素材

### 方式一：应用内导入（推荐）

「素材练习」页 → **导入 txt** → 选择 `.txt` 文件 → 立即出现在当前 tab 的列表最前（带「导入」标记，可单篇删除）。导入归到哪个 tab 取决于导入时所在 tab：**「文章」tab 导入 = 文章（整段文本）；「词库」tab 导入 = 词库（按空格 / 换行切分成单词）**，按钮文案也会随 tab 变为「导入 txt 文章 / 导入 txt 词库」。导入内容保存在用户目录，**覆盖安装、卸载都不会丢**。

### 方式二：在线搜索（v1.1.0 起，v1.2.0 增加 AI 生成）

「素材练习」页 → **在线** tab → 选来源、填关键词 → **搜索** → 点结果预览 → **导入为词库 / 文章**。

| 来源 | 输入 | 得到 | 实测耗时 |
|---|---|---|---|
| 主题词库 | 主题词（如 `music`） | 150 个相关词 → 词库 | ~0.6 秒 |
| 例句短文 | 关键词（如 `animals`） | 20 句左右的英文例句 → 文章（每句一行） | 7–10 秒 |
| 高频词表 | 过滤词（可留空） | Google 10000 高频词中匹配的词 → 词库 | ~2 秒 |
| AI 生成 | 主题或描述（需先配置 API） | 按你的要求生成词库或短文 | 取决于模型，通常 5–20 秒 |

- 三个公共源都免费、无需 API Key，且**国内可直连**（Wikipedia / Project Gutenberg / jsDelivr 等实测不可达，故未采用）。
- 例句源会自动去重（挡掉 `I/She/He played music.` 这类模板变体）、过滤脏话与过长过短的句子。
- 请求由主进程发起，带 **15 秒超时**和**域名白名单**（`api.datamuse.com` / `tatoeba.org` / `raw.githubusercontent.com`），不会变成任意网址抓取器。

**AI 生成怎么配**（设置 → AI 素材生成）：

| 项 | 说明 |
|---|---|
| 常用服务 | 点一下自动填入 API 地址与模型名（DeepSeek / 通义千问 / Kimi / 智谱 GLM / OpenAI），可再改 |
| API 地址 | OpenAI 兼容地址；填域名、`.../v1` 或完整 `.../chat/completions` 都能识别 |
| 模型名 | 如 `deepseek-chat`、`qwen-plus`、`gpt-4o-mini` |
| API Key | 用系统凭据（Windows DPAPI）加密后存本机，**界面不回显**；留空保存表示不修改 |
| 测试连接 | 发一个极小请求验证地址 / Key / 模型三者是否都对，错误信息会原样显示 |

- AI 源走的是**你自己填的地址**，因此不受公共源的域名白名单限制（仍只允许 http/https）；Key 与请求只在你填的接口和你之间。
- 生成的输出会自动清洗：去掉标题、编号、项目符号、markdown 标记和中文行；词库去重、只保留英文单词。
- 离线或超时会明确报错，不影响本地导入与内置素材。

### 方式三：改 JSON（内置素材，随打包发布）

| 文件 | 格式 |
|---|---|
| `data/materials/articles.json` | `{ "articles": [{ "id": "art-4", "name": "文章名", "text": "要练的文本" }] }` |
| `data/materials/words.json` | `{ "lists": [{ "id": "w-my", "name": "词库名", "words": ["apple", "banana"] }] }` |
| `data/curriculum.json` | `sections: [{ "id": "s2-4", "name": "课名", "keys": "asdf", "desc": "说明", "text": "练习文本" }]`；星级门槛在顶层 `starThresholds` |

改完重启应用生效。注意：`id` 不能与已有条目重复；`text` 中的英文双引号要写成 `\"`。

### 支持的格式

| 格式 | 支持 |
|---|---|
| `.txt`（UTF-8 纯文本） | ✅ 直接导入 |
| 英文大小写 / 数字 / 英文标点 / 空格 | ✅ |
| 多行文本（换行按 Enter 键输入） | ✅ |
| `.docx` / `.pdf` | ❌ 请先另存为 `.txt` |
| 中文输入 | 🚧 二期（需处理输入法 IME） |

## 测试

```bash
npm test        # 引擎单元测试（28 项，纯逻辑）
npm run smoke   # GUI 冒烟：自动驱动界面跑 9 条链路（下一节/测试选项/模式切换/切页保活/多会话并存与切换/素材导入含词库 tab/在线素材搜索导入/AI 生成导入/设置页版本与 AI 配置字段）
```

冒烟日志出现 `DRIVE_*` 五行且无 `_ERROR` 即通过；`--smoke` 模式下应用使用独立的临时 userData，**不会污染真实成绩**。

## 打包

```bash
npm run dist
```

产物在 `dist/`：`TypingPractice-Setup-<版本>.exe`（NSIS 安装包，可选安装目录、中文安装界面、桌面 + 开始菜单快捷方式）和 `win-unpacked/`（免安装绿色版）。完整安装包约 106 MiB（Electron 运行时占大头）。

**代码签名**（可选）：未签名时 SmartScreen 会提示「未知发布者」，需手动「更多信息 → 仍要运行」。有代码签名证书（PFX）时：

```bash
# PowerShell
$env:CSC_LINK = "路径\证书.pfx"
$env:CSC_KEY_PASSWORD = "证书密码"
npm run dist
```

签名 ≠ 一定不弹 SmartScreen：新证书 / 低下载量仍会被拦，需要积累下载信誉。个人版代码签名证书约 650–680 元/年（Certum，阿里云市场可个人申请）。

**分发渠道限制**：Gitee 发行版单附件 ≤ 100M、单仓库附件总量 ≤ 1G——完整安装包约 106 MiB，**超出限制**。可选方案：改用 GitHub Releases（单文件 2G，无需分卷）、对象存储直链（腾讯云 COS / 蓝奏云），或分卷上传（`7z a -v90m 安装包.exe`，用户用 7z 打开任一卷自动合并）。

**发布到 GitHub Releases（含自动更新元数据）**：

```bash
# PowerShell（GH_TOKEN 只需 repo 写权限，切勿提交到代码库）
$env:GH_TOKEN = "ghp_xxx"
npm run dist -- --publish always
```

这会把安装包和 `latest.yml`（版本号、大小、sha512、下载地址）一起传到对应版本的 Release，客户端的「检查更新」即会自动发现新版本。**版本号铁律：git tag 必须与 `package.json` 的 version 一致（`v1.2.1` ↔ `1.2.1`）**，不一致时更新会静默失败。

**自动更新机制**（`electron-updater` + GitHub Releases）：设置页「检查更新」→ 发现新版本 → 用户点「下载并安装」→ 下载完点「重启并安装」。仅**安装版**可自动更新（便携版 zip 与 `win-unpacked` 没有安装上下文）；开发模式（`npm start`）下按钮退化为「打开发行页」，不会发起检查。

## 数据存在哪

成绩与进度**不在安装目录**，因此覆盖安装、卸载都不会丢：

| 数据 | 位置 |
|---|---|
| 进度 / 星级 / 设置 | `%APPDATA%\typingpractice\user-data\progress.json` |
| 成绩历史 | `%APPDATA%\typingpractice\user-data\history.json` |
| 导入的素材（文章 + 词库） | `%APPDATA%\typingpractice\user-data\custom-materials.json` |
| AI 配置（地址 / 模型 / 加密后的 Key） | `%APPDATA%\typingpractice\user-data\ai-config.json` |

备份 = 拷贝整个 `user-data` 文件夹。注意：修改 `package.json` 的 `name` 会改变该路径（等于换了一个数据目录）。

## 开发注意（踩过的坑）

- **不要在设置了 `ELECTRON_RUN_AS_NODE=1` 的终端里启动 Electron**（部分 IDE/代理环境会设），否则 `require('electron')` 退化成路径字符串、应用直接崩。自己的终端 `npm start` 不受影响。
- 冒烟脚本内置 `--no-sandbox`：受限环境（虚拟机 / 安全软件）里 Chromium 沙箱会导致 GPU 进程崩溃（`0xC0000005` → `GPU process isn't usable. Goodbye.`），整个应用起不来；`--smoke` 模式下 main.js 还会自动加 `--disable-gpu`（纯 DOM 界面，不受影响）。
- 在线素材的联网请求都在主进程（`online.js`）里做：渲染层受 CSP 限制，且主进程才能统一加超时与域名白名单。`--smoke` 时该 IPC 走内置 mock，**冒烟完全不依赖网络**。
- 在线素材源挑的是国内可直连的接口。实测不可达/极慢的（en.wikipedia.org、gutendex.com、cdn.jsdelivr.net、Guardian RSS、Gutenberg 正文下载约 1.2KB/s）不要用。
- AI 生成同样在主进程调用（`ai.js`）：60 秒超时；API Key 用 `safeStorage`（Windows DPAPI）加密，配置里存的是 `enc:` 开头的 base64 密文，取不到加密能力才退回 `plain:` 明文；`ai:getConfig` 只回传「有没有 Key」，不回传明文。
- 打包时如果报 `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]`：electron-builder 要先删旧 `dist/`，被环境安全策略拦截。先把旧目录改名挪开再打包，或 `npm run dist -- -c.directories.output=dist-new` 后换名。
- `app://data/xxx.json` 经 URL 解析后 **host 是 `data`**，协议处理器必须按 host 分支映射，不能按 pathname 前缀判断（否则 404）。

## 路线图

- [ ] 中文打字练习（拼音，需处理输入法 IME composition）
- [ ] 打字游戏（警察抓小偷 / 青蛙过河类）
- [ ] 成绩导出、自定义课程编辑界面

## License

MIT
