module.exports = {
  appId: 'com.typingpractice.app',
  productName: 'TypingPractice',
  asar: true,
  files: [
    'main.js',
    'preload.js',
    'online.js',
    'ai.js',
    'renderer/**/*',
    'data/**/*',
    'build/icon.png'
  ],
  directories: {
    output: 'dist',
    buildResources: 'build'
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png'
  },
  // 微软商店打包配置：本机 electron-builder（26.15.3）没有 msix 目标，用 appx 目标（产物 .appx，商店通用格式）。
  // 仅 `npm run dist:store`（= --win appx）时生效，不影响默认 nsis 构建。
  // identityName / publisher 必须与 Microsoft Partner Center「产品标识」完全一致，否则商店提交被拒。
  appx: {
    // ↓↓↓ 以下三个值取自 Microsoft Partner Center「产品标识」，须与商店预留完全一致 ↓↓↓
    identityName: 'ROSELiu.TypingPractice',
    publisher: 'CN=7FF4E197-9BFE-4F7D-B12B-519AB1738365',
    publisherDisplayName: 'ROSE Liu',
    backgroundColor: '#2d2d2d',
    displayName: 'Typing_Practice',
    // 包声明的语言资源：不设时默认 en-US，会导致商店把包标成英文、与中文界面/描述不符。
    // 界面为简体中文，故声明 zh-CN（商店列表的语言也要包含「中文(简体)」）。
    languages: ['zh-CN'],
    // 能力声明：runFullTrust 是 Electron 桌面桥接必需（默认已有）；internetClient 必加，
    // 否则商店沙箱里在线素材 / AI 生成等网络请求会被掐断。
    capabilities: ['runFullTrust', 'internetClient'],
    // 证书非必需：不配证书时产出 unsigned .appx，商店提交后由微软重签，可直接上传。
    // 仅当你想本机 Add-AppxPackage 试装时，才需要一个「主体(Subject) == 上方 publisher」的自签证书：
    //   certificateFile: process.env.APPX_CERT_FILE,
    //   certificatePassword: process.env.APPX_CERT_PASSWORD
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'TypingPractice',
    installerLanguages: ['zh_CN'],
    artifactName: 'TypingPractice-Setup-${version}.${ext}'
  },
  // 自动更新源：GitHub Releases（electron-updater 读取 Release 里的 latest.yml）
  // 本地 npm run dist 不会自动上传，只有显式 --publish always 才发布
  publish: [
    { provider: 'github', owner: 'DFLS-ROSE', repo: 'TypingPractice' }
  ]
};
