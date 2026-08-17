import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Relative asset paths: the desktop build loads index.html straight off
  // disk via file://, where an absolute "/assets/…" URL resolves to nothing.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
