// The desktop shell. Thronglets is a self-contained client-side sim — no
// server, no network calls except the optional oracle the player wires up
// themselves — so this window just loads the built page off disk and gets
// out of the way. CommonJS (.cjs) because the rest of the project is ESM
// ("type": "module" in package.json) and Electron's main process is loaded
// directly by Node without going through Vite.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const DEV_SERVER_URL = process.env.THRONGLETS_DEV_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a1030", // matches the sim's night sky — no white flash on load
    autoHideMenuBar: true,
    title: "Thronglets",
    webPreferences: {
      // No preload, no IPC, no Node integration in the page: the renderer
      // is an ordinary web page and never needs to touch the filesystem.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Anything the page tries to open in a new tab (the oracle's "get a key"
  // links) goes to the system browser instead of a second app window.
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
