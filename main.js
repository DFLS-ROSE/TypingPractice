const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

// 本软件是纯 DOM 界面，禁用硬件加速，避免个别机器上 GPU 进程崩溃
app.disableHardwareAcceleration();

const SMOKE = process.argv.includes('--smoke');
const RENDERER_DIR = path.join(__dirname, 'renderer');

// 冒烟测试用独立的 userData，绝不污染真实成绩与进度
if (SMOKE) {
  app.setPath('userData', path.join(os.tmpdir(), 'typingpractice-smoke'));
}

let mainWindow = null;

// 注册 app:// 自定义协议：标准 + 安全 + 支持 fetch，
// 这样渲染层可以用原生 ES Modules（file:// 下模块脚本会被 CORS 拦截）
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function userDataDir() {
  const dir = path.join(app.getPath('userData'), 'user-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userDataDir(), file), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(userDataDir(), file), JSON.stringify(data, null, 2));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#f5f6f8',
    title: 'TypingPractice',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL(SMOKE ? 'app://index.html?smoke=1' : 'app://index.html');

  if (SMOKE) {
    win.webContents.on('console-message', (event, _level, message) => {
      const text = event && typeof event.message === 'string' ? event.message : message;
      console.log('RENDERER:', text);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('LOAD_FAIL:', code, desc, url));
  }
  mainWindow = win;
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let filePath;
      let base;
      if (url.host === 'data') {
        // app://data/xxx.json → 项目 data/ 目录
        // 注意：'app://data/x.json' 经 URL 解析后 host 是 'data'，pathname 只剩 '/x.json'，
        // 不能按 pathname 判断，必须按 host 分支
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        base = path.join(__dirname, 'data');
        filePath = path.normalize(path.join(base, rel));
      } else {
        // app://index.html、app://index.html/js/x.js → renderer/ 目录
        let p = decodeURIComponent(url.pathname);
        if (p.endsWith('/')) p += 'index.html';
        base = RENDERER_DIR;
        filePath = path.normalize(path.join(base, p));
      }
      if (!filePath.startsWith(base)) return new Response('forbidden', { status: 403 });
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, { headers: { 'content-type': MIME[ext] || 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });

  createWindow();
  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('data:loadProgress', () => readJson('progress.json', { settings: {}, sections: {} }));
ipcMain.handle('data:saveProgress', (_e, data) => { writeJson('progress.json', data); return true; });
ipcMain.handle('data:loadHistory', () => readJson('history.json', []));
ipcMain.handle('data:appendHistory', (_e, record) => {
  const list = readJson('history.json', []);
  list.push(record);
  if (list.length > 500) list.splice(0, list.length - 500);
  writeJson('history.json', list);
  return true;
});
ipcMain.handle('data:clearHistory', () => { writeJson('history.json', []); return true; });

// 用户自己导入的练习文章（存 userData，覆盖安装 / 卸载都不丢）
ipcMain.handle('data:loadCustomMaterials', () => readJson('custom-materials.json', { articles: [] }));
ipcMain.handle('data:saveCustomMaterials', (_e, data) => { writeJson('custom-materials.json', data); return true; });

// 选择并读取一个 .txt 文本文件，返回 { name, text }
ipcMain.handle('data:importTextFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择练习文本（.txt）',
    properties: ['openFile'],
    filters: [{ name: '文本文件', extensions: ['txt'] }]
  });
  if (canceled || !filePaths.length) return null;
  const file = filePaths[0];
  const text = await fs.promises.readFile(file, 'utf8');
  return { name: path.basename(file, path.extname(file)), text };
});

// 版本信息与检查更新：版本取 package.json，发行页地址在 package.json 的 releaseUrl 配置
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:openReleases', async () => {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  } catch (err) {
    return { ok: false, message: '读取 package.json 失败' };
  }
  if (!pkg.releaseUrl) {
    return { ok: false, message: '尚未配置发行页地址（package.json 的 releaseUrl）' };
  }
  await shell.openExternal(pkg.releaseUrl);
  return { ok: true };
});

// ============ 自动更新（electron-updater + GitHub Releases）============
// 只在打包后的应用中启用；开发模式下不检查，避免无谓的网络请求与错误噪音
let updateState = { status: 'idle', version: '', percent: 0, message: '' };

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  // 推送给渲染层（设置页订阅 update:state）
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:state', updateState);
  }
}

function initAutoUpdater() {
  if (!app.isPackaged) return;

  // 不自动下载：检查到新版本后由用户点「下载并安装」，配合进度显示
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking', percent: 0, message: '正在检查更新…' });
  });
  autoUpdater.on('update-available', (info) => {
    setUpdateState({ status: 'available', version: info.version, message: `发现新版本 v${info.version}` });
  });
  autoUpdater.on('update-not-available', () => {
    setUpdateState({ status: 'not-available', message: '已是最新版本' });
  });
  autoUpdater.on('download-progress', (p) => {
    const percent = Math.round(p.percent || 0);
    setUpdateState({ status: 'downloading', percent, message: `下载中 ${percent}%` });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({ status: 'downloaded', version: info.version, message: '新版本已就绪，重启后生效' });
  });
  autoUpdater.on('error', (err) => {
    setUpdateState({ status: 'error', message: `更新检查失败：${err && err.message ? err.message : err}` });
  });
}

ipcMain.handle('app:checkUpdate', async () => {
  if (!app.isPackaged) {
    setUpdateState({ status: 'dev', message: '开发模式下不检查更新' });
    return { ok: false, dev: true };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('app:downloadUpdate', async () => {
  if (!app.isPackaged) return { ok: false, dev: true };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('app:installUpdate', () => {
  if (!app.isPackaged) return { ok: false, dev: true };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

async function runSmokeDrive(name) {
  try {
    const result = await mainWindow.webContents.executeJavaScript(`window.__smoke.${name}()`);
    console.log(`DRIVE_${name}:`, JSON.stringify(result));
  } catch (err) {
    console.log(`DRIVE_${name}_ERROR:`, err && err.message ? err.message : String(err));
  }
}

ipcMain.on('smoke:ready', () => {
  console.log('SMOKE_READY');
  setTimeout(async () => {
    await runSmokeDrive('driveNextSection');
    await runSmokeDrive('driveTestOptions');
    await runSmokeDrive('driveModeSwitch');
    await runSmokeDrive('driveSessionKeepAlive');
    await runSmokeDrive('driveCustomMaterial');
    await runSmokeDrive('driveSettings');
    setTimeout(() => app.quit(), 400);
  }, 300);
});

if (SMOKE) {
  setTimeout(() => { console.log('SMOKE_TIMEOUT'); app.quit(); }, 30000);
}
