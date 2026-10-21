module.exports = {
  appId: 'com.typingpractice.app',
  productName: 'TypingPractice',
  asar: true,
  files: [
    'main.js',
    'preload.js',
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
  }
};
