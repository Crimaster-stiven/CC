const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null

function showWindow() {
  mainWindow.show()
  mainWindow.focus()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  try { mainWindow.setIcon(nativeImage.createFromPath(iconPath)) } catch {}

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  let trayIcon
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('番茄钟')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: showWindow },
    { type: 'separator' },
    {
      label: '置顶窗口',
      type: 'checkbox',
      checked: true,
      click: (item) => { mainWindow.setAlwaysOnTop(item.checked) }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { app.isQuitting = true; app.quit() }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', showWindow)
}

ipcMain.on('window-hide', () => { mainWindow.hide() })
ipcMain.on('window-close', () => { app.isQuitting = true; app.quit() })
ipcMain.on('set-always-on-top', (_, value) => { mainWindow.setAlwaysOnTop(value) })
ipcMain.on('send-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body })
    notif.on('click', showWindow)
    notif.show()
  }
})
ipcMain.handle('get-version', () => app.getVersion())

app.whenReady().then(() => { createWindow(); createTray() })
app.on('activate', showWindow)
