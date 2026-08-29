// The desktop shell for Claudefield: a plain Electron window that loads the
// built page off disk. Nothing game-specific lives here — the whole game is
// the web build in dist/, so the desktop app and the browser version run
// exactly the same code.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const DEV_SERVER_URL = process.env.CLAUDEFIELD_DEV_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0d1117", // matches the deploy screen — no white flash on load
    autoHideMenuBar: true,
    title: "Claudefield",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
