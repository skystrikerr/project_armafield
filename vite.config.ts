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
  build: {
    rollupOptions: {
      // Two games share the toolchain: the colony at "/" and Ironfront at
      // "/ironfront.html". Both need to end up in dist.
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        ironfront: path.resolve(import.meta.dirname, "ironfront.html"),
      },
    },
  },
});
