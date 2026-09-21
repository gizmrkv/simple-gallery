import { defineConfig } from "vitest/config";

// GitHub Pages はリポジトリ名のサブパス配下で配信されるため base を合わせる。
export default defineConfig({
  base: "/simple-gallery/biter-maze/",
  test: {
    environment: "node",
  },
});
