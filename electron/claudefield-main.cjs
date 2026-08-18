// The desktop shell for Claudefield. Same shape as electron/main.cjs (the
// Thronglets shell) but points at the other built page: this repo ships two
// unrelated games from one Vite build, and each gets its own Electron entry
// so they can be packaged as two separate desktop apps.
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
    win.loadFile(path.join(__dirname, "..", "dist", "ironfront.html"));
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
