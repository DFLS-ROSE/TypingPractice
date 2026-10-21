# TypingPractice

参考**金山打字通**的阶段性打字学习练习软件。Electron + 原生 HTML/CSS/JS（ES Modules，**零构建链**），课程与素材全部 JSON 数据驱动——加一节课、换一段练习文本都不用碰代码。

- 版本：v1.0.2 ｜ 平台：Windows x64 ｜ 许可：MIT

## 功能

| 模块 | 说明 |
|---|---|
| 打字教程 | S1–S6 六个阶段 17 节课（认识键盘 → 基准键 → 上排 → 下排 → 数字符号 → 综合文章），每节课「课程说明 → 按键练习 → 混合练习 → 小节测试」，按成绩评 1–3 星 |
| 打字引擎 | `keydown` 逐字判定；**严格模式**（按错即停）/ **自由模式**（可退格改正）**练习中可随时切换**；打错时在期望字符正上方显示你**实际按下的键**（⏎/␣ 会显式标注）；实时统计 WPM / CPM / 准确率 / 每个键的错误次数 |
| 虚拟键盘 | 高亮当前应击键并联动对应 Shift，八色指法着色，F/J 定位点，按错闪烁 |
| 素材练习 | 内置英文文章与词库 + **「导入 txt 文章」**（导入内容存在用户目录，覆盖安装/卸载不丢） |
| 速度测试 | 1 / 3 / 5 分钟限时，随机单词或文章两种来源，限时到自动出成绩 |
| 成绩统计 | 练习次数、累计时长、最佳 WPM、平均准确率、WPM 趋势图、最近记录、课程进度 |
| 切页保留 | 离开练习页自动暂停计时（**暂停时间不计入用时**），侧栏出现「继续练习」可原样恢复 |
| 设置 | 默认练习模式、虚拟键盘开关、清空记录 |

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
├── package.json            # 依赖 + electron-builder 打包配置
├── renderer/
│   ├── index.html          # 入口（CSP 已配置）
│   ├── css/style.css
│   └── js/
│       ├── app.js          # 导航、会话管理、成绩保存（串行化）
│       ├── engine.js       # 打字引擎 + 星级评定（纯逻辑，可单测）
│       ├── keyboard.js     # 虚拟键盘
│       ├── session.js      # 练习界面（计时、结果面板、模式切换、暂停/恢复）
│       ├── storage.js      # JSON 加载 + userData 读写封装
│       └── views/          # tutorial / practice / test / stats / settings
├── data/                   # 全部数据，改这里就等于改内容
│   ├── curriculum.json     # 课程：阶段 → 分节 → 文本/星级标准
│   ├── layout.json         # 键位坐标 + 八色指法配色
│   └── materials/          # articles.json（文章）/ words.json（词库）
├── scripts/
│   ├── gen-icon.mjs        # 生成应用图标 build/icon.png
│   └── repair-records.mjs  # 清洗异常练习记录
├── test/engine.test.mjs    # 引擎单元测试（24 项）
└── build/icon.png
```

## 添加练习素材

### 方式一：应用内导入（推荐）

「素材练习」页 → **导入 txt 文章** → 选择 `.txt` 文件 → 立即出现在列表最前（带「导入」标记，可单篇删除）。导入内容保存在用户目录，**覆盖安装、卸载都不会丢**。

### 方式二：改 JSON（内置素材，随打包发布）

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
npm test        # 引擎单元测试（24 项，纯逻辑）
npm run smoke   # GUI 冒烟：自动驱动界面跑 5 条链路（下一节/测试选项/模式切换/切页保活/素材导入）
```

冒烟日志出现 `DRIVE_*` 五行且无 `_ERROR` 即通过；`--smoke` 模式下应用使用独立的临时 userData，**不会污染真实成绩**。

## 打包

```bash
npm run dist
```

产物在 `dist/`：`TypingPractice-Setup-<版本>.exe`（NSIS 安装包，可选安装目录、中文安装界面、桌面 + 开始菜单快捷方式）和 `win-unpacked/`（免安装绿色版）。

**自动裁剪（让安装包从 ~106 MiB 降到 ~97.5 MiB）**：`electron-builder.js` 的 `afterPack` 钩子会删掉 20MB 的 Chromium 许可证全文（换一份精简说明）和 53 个非中英语言包（保留 zh-CN / en-US）。注意 `dxcompiler` / `d3dcompiler_47` / `dxil` / `vk_swiftshader` / `vulkan-1` / `ffmpeg` **一个都不能删**——即使禁用硬件加速，Chromium 仍会初始化 ANGLE/SwiftShader 与媒体栈，缺任一个都会让渲染进程崩溃（已实测）。若在会拦截批量文件删除的环境里打包，用 `SKIP_PRUNE=1` 跳过钩子，改为外部裁剪后 `npx electron-builder --prepackaged dist/win-unpacked --win` 生成安装包。

**代码签名**（可选）：未签名时 SmartScreen 会提示「未知发布者」，需手动「更多信息 → 仍要运行」。有代码签名证书（PFX）时：

```bash
# PowerShell
$env:CSC_LINK = "路径\证书.pfx"
$env:CSC_KEY_PASSWORD = "证书密码"
npm run dist
```

签名 ≠ 一定不弹 SmartScreen：新证书 / 低下载量仍会被拦，需要积累下载信誉。个人版代码签名证书约 650–680 元/年（Certum，阿里云市场可个人申请）。

**分发渠道限制**：Gitee 发行版单附件 ≤ 100M、单仓库附件总量 ≤ 1G——本安装包 97.5 MiB 可直接上传。若仍超限可分卷（`7z a -v90m 安装包.exe`，用户用 7z 打开任一卷自动合并），或改用 GitHub Releases（单文件 2G）/ 对象存储直链。

## 数据存在哪

成绩与进度**不在安装目录**，因此覆盖安装、卸载都不会丢：

| 数据 | 位置 |
|---|---|
| 进度 / 星级 / 设置 | `%APPDATA%\typingpractice\user-data\progress.json` |
| 成绩历史 | `%APPDATA%\typingpractice\user-data\history.json` |
| 导入的文章 | `%APPDATA%\typingpractice\user-data\custom-materials.json` |

备份 = 拷贝整个 `user-data` 文件夹。注意：修改 `package.json` 的 `name` 会改变该路径（等于换了一个数据目录）。

## 开发注意（踩过的坑）

- **不要在设置了 `ELECTRON_RUN_AS_NODE=1` 的终端里启动 Electron**（部分 IDE/代理环境会设），否则 `require('electron')` 退化成路径字符串、应用直接崩。自己的终端 `npm start` 不受影响。
- 打包时如果报 `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]`：electron-builder 要先删旧 `dist/`，被环境安全策略拦截。先把旧目录改名挪开再打包，或 `npm run dist -- -c.directories.output=dist-new` 后换名。
- `app://data/xxx.json` 经 URL 解析后 **host 是 `data`**，协议处理器必须按 host 分支映射，不能按 pathname 前缀判断（否则 404）。

## 路线图

- [ ] 中文打字练习（拼音，需处理输入法 IME composition）
- [ ] 打字游戏（警察抓小偷 / 青蛙过河类）
- [ ] 成绩导出、自定义课程编辑界面

## License

MIT
