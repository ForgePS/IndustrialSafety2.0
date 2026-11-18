import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(
  root,
  "apps/industrial-web/node_modules/pptx-preview/dist/pptx-preview.es.js",
);
const fallback = "C:/Temp/package/dist/pptx-preview.es.js";
const target = path.join(root, "apps/industrial-web/src/vendor/pptx-preview.es.js");

const input = fs.existsSync(source) ? source : fallback;
let content = fs.readFileSync(input, "utf8");
const needle = ".filter((function(t){return t.userDrawn}))";
const count = content.split(needle).length - 1;
content = content.split(needle).join("");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, content);
console.log(`patched ${target} (${count} userDrawn filters removed)`);
