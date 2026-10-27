module.exports = {
  appId: 'com.typingpractice.app',
  productName: 'TypingPractice',
  asar: true,
  files: [
    'main.js',
    'preload.js',
    'online.js',
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
