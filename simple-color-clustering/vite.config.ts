import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages はリポジトリ名のサブパス配下で配信されるため base を合わせる。
export default defineConfig({
  base: "/simple-color-clustering/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
  },
});
