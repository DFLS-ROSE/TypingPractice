#!/usr/bin/env node
// 构建微软商店包（AppX）。
// 关键：必须同时给 Electron 本体和 electron-builder 二进制设国内镜像，
// 否则 ELECTRON_MIRROR 缺失会导致 Electron 从 GitHub 直连下载卡死（表现为「跑完没产出」）。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');

const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

// 输出到独立目录 dist-store，避免 electron-builder 清空 dist/（那里有 nsis/zip 发行产物）
const args = [cli, '--win', 'appx', '-c.directories.output=dist-store', ...process.argv.slice(2)];

const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
