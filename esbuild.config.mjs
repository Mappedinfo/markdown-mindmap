import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const production = process.argv.includes("--production");

await esbuild.build({
  banner: {
    js: "/* Markdown Mindmap */"
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtins],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js"
});
