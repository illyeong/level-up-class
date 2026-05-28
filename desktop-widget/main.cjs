const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

let mainWindow = null;
let localServer = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
};

function startLocalServer() {
  return new Promise((resolve) => {
    localServer = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      const file = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      const filePath = path.join(__dirname, file);
      const ext = path.extname(filePath).toLowerCase();

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    // 포트 0 = OS가 사용 가능한 포트 자동 할당
    localServer.listen(0, 'localhost', () => {
      resolve(localServer.address().port);
    });
  });
}

async function createWindow() {
  // localhost HTTP 서버로 로드해야 Firebase Auth 도메인 인증 통과
  const port = await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 392,
    height: 640,
    minWidth: 340,
    minHeight: 520,
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    backgroundColor: '#0f172a',
    title: 'LevelUp Class 위젯',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}/`);

  // Firebase Auth signInWithPopup 팝업 허용
  mainWindow.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 480,
        height: 640,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      },
    };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-external', async (_event, url) => {
  if (!url || typeof url !== 'string') return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('set-always-on-top', (_event, enabled) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(enabled), 'floating');
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});
