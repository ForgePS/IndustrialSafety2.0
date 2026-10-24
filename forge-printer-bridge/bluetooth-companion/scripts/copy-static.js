"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const distSrc = path.join(root, "dist", "src");
const bradyBundle = path.join(
  root,
  "node_modules",
  "@bradycorporation",
  "brady-web-sdk",
  "dist",
  "bundle.js",
);

fs.mkdirSync(distSrc, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  const from = path.join(root, "src", file);
  const to = path.join(distSrc, file);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
  }
}

const bradyDestDir = path.join(distSrc, "vendor", "brady-web-sdk");
fs.mkdirSync(bradyDestDir, { recursive: true });
if (fs.existsSync(bradyBundle)) {
  fs.copyFileSync(bradyBundle, path.join(bradyDestDir, "bundle.js"));
} else {
  console.warn("[copy-static] Brady Web SDK bundle not found. Run npm install before build.");
}

esbuild
  .build({
    entryPoints: [path.join(root, "src", "renderer.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["chrome120"],
    outfile: path.join(distSrc, "renderer.js"),
    sourcemap: true,
    // Bundle Brady into renderer so Electron/asar does not depend on import maps
    // (bare specifier + importmap frequently leaves #app empty when the module fails).
    alias: {
      "brady-web-sdk": bradyBundle,
      "@bradycorporation/brady-web-sdk": bradyBundle,
    },
  })
  .then(() => {
    console.log("[build-renderer] Bundled dist/src/renderer.js + Brady SDK + static assets");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
