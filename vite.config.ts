import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Relative asset paths. The desktop build loads index.html straight off disk
  // via file://, where an absolute "/assets/…" URL resolves to nothing, and the
  // web build is served from a project subpath on GitHub Pages rather than the
  // domain root. Relative URLs are correct in both.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
