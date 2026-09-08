import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(Date.now().toString(36)) },
});
