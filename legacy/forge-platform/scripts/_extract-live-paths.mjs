import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "live-module-page.js";
const src = readFileSync(file, "utf8");
const paths = new Set();
for (const m of src.matchAll(/\/api\/v1\/industrial\/[A-Za-z0-9/_-]*/g)) {
  paths.add(m[0]);
}
const training = [...paths].filter((p) => p.includes("training")).sort();
console.log(JSON.stringify({ trainingPaths: training, allCount: paths.size }, null, 2));
