// Polyfill global File and Blob for Electron / Node 18 environments
if (typeof globalThis.File === 'undefined') {
    try {
        const { Blob } = require('buffer');
        if (Blob) {
            globalThis.Blob = Blob;
            globalThis.File = class File extends Blob {
                constructor(chunks, filename, options = {}) {
                    super(chunks, options);
                    this.name = filename;
                    this.lastModified = options.lastModified || Date.now();
                }
            };
        }
    } catch (_) {}
}

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

// 🚀 Turbo Performance & Memory Optimization Switches
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disable-site-isolation-trials');
const path = require('path');
const fs = require('fs-extra');

// تحديد مسار البيانات الآمن للبرنامج في AppData
const userDataPath = path.join(app.getPath('userData'), 'wa_bulk_data');
fs.ensureDirSync(userDataPath);
process.env.APP_DATA_DIR = userDataPath;

// استدعاء السيرفر وتشغيله داخل عملية Electron مباشرة
const { startServer } = require('./server');

let mainWindow = null;
let serverInstance = null;

// منع تشغيل أكثر من نسخة في نفس الوقت
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 960,
        minHeight: 650,
        title: 'WhatsApp Flow Pro | منظومة فلو للتسويق الذكي وإدارة واتساب',
        backgroundColor: '#075e54',
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        autoHideMenuBar: true,
        show: false
    });

    // بدء السيرفر الداخلي
    try {
        serverInstance = startServer(3000);
    } catch (e) {
        console.error('خطأ في تشغيل السيرفر الداخلي:', e);
    }

    // تحميل الواجهة بمجرد أن تصبح جاهزة
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 1000);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// التعامل مع الروابط الخارجية
ipcMain.handle('open-external', async (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        await shell.openExternal(url);
    }
});