import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom"],
    treeshake: true,
  },
  {
    // Script-tag build for server-rendered hosts (packages/laravel). Bundles React.
    entry: { snag: "src/standalone.ts" },
    format: ["iife"],
    globalName: "Snag",
    outExtension: () => ({ js: ".iife.js" }),
    platform: "browser",
    target: "es2019",
    minify: true,
    sourcemap: false,
    treeshake: true,
    noExternal: [/.*/],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
]);
