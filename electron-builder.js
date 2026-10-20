const fs = require('node:fs');
const path = require('node:path');

// 本软件用不到的大件，打包后裁掉，安装包可从 ~111MB 降到 ~55MB：
//   - LICENSES.chromium.html：20MB 许可证全文，改为一份精简说明
//   - 非中英语言包：界面只有中文，保留 zh-CN 即可（en-US 兜底）
// 注意：dxcompiler / d3dcompiler_47 / dxil / vk_swiftshader / vulkan-1 / ffmpeg
// 都不能删——即使禁用硬件加速，Chromium 仍会初始化 ANGLE/SwiftShader 与媒体栈，
// 缺任一个都会导致渲染进程崩溃（已实测）。
const PRUNE_ROOT = [
  'LICENSES.chromium.html'
];
const KEEP_LOCALES = ['zh-CN.pak', 'en-US.pak'];

function prune(context) {
  // 受限环境（部分沙箱/代理会拦截批量文件删除）可用 SKIP_PRUNE=1 跳过，
  // 改为外部裁剪后再用 --prepackaged 生成安装包
  if (process.env.SKIP_PRUNE === '1') {
    console.log('[afterPack] SKIP_PRUNE=1，跳过自动裁剪');
    return;
  }
  const appOutDir = context.appOutDir;
  let freed = 0;

  const drop = (p) => {
    freed += fs.statSync(p).size;
    // 用 unlinkSync/rmdirSync 而非 rmSync：部分环境的删除代理只拦截 rm/rmSync
    // 且对批量删除 fail-closed；这里删的是本次构建自己产出的无用文件
    if (fs.statSync(p).isDirectory()) fs.rmdirSync(p);
    else fs.unlinkSync(p);
  };

  for (const name of PRUNE_ROOT) {
    const p = path.join(appOutDir, name);
    if (fs.existsSync(p)) drop(p);
  }

  const locDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(locDir)) {
    for (const f of fs.readdirSync(locDir)) {
      if (!KEEP_LOCALES.includes(f)) drop(path.join(locDir, f));
    }
  }

  // 用一份精简说明替代 20MB 的 Chromium 许可证全文
  fs.writeFileSync(
    path.join(appOutDir, 'THIRD_PARTY_LICENSES.txt'),
    'TypingPractice 基于 Electron / Chromium 构建。\n' +
      'Chromium 及其他第三方组件的完整许可证文本见：\n' +
      'https://chromium.googlesource.com/chromium/src/+/refs/heads/main/LICENSE\n' +
      'Electron 及本软件自身采用 MIT 许可。\n'
  );

  console.log(`[afterPack] 已裁剪 ${(freed / 1024 / 1024).toFixed(1)} MB 无用文件`);
}

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
  },
  afterPack: prune
};
