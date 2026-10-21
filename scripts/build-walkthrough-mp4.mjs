/**
 * Local MP4 builder for the Forge Industrial module walkthrough.
 * Uses ffmpeg title cards + burned-in captions (no Polly / API required).
 *
 * Usage:
 *   node scripts/build-walkthrough-mp4.mjs
 *   node scripts/build-walkthrough-mp4.mjs --ffmpeg "C:\\path\\to\\ffmpeg.exe"
 */
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const require = createRequire(import.meta.url);
const {
  EXECUTIVE_WALKTHROUGH_STEPS,
  EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME,
  estimateWalkthroughRuntimeMs,
} = require("../packages/contracts/dist/executive-walkthrough.js");

function parseArgs(argv) {
  const out = { ffmpeg: null, out: null, width: 1920, height: 1080 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--ffmpeg") out.ffmpeg = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--width") out.width = Number(argv[++i]) || 1920;
    else if (a === "--height") out.height = Number(argv[++i]) || 1080;
  }
  return out;
}

function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-2500)}`));
    });
  });
}

function wrapText(text, maxChars = 52) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 10);
}

function escapeDrawtext(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

async function encodeScene(ffmpeg, workDir, step, index, total, width, height) {
  const durationSec = Math.max(2, Math.round(step.durationMs / 1000));
  const out = join(workDir, `scene-${String(index).padStart(2, "0")}.mp4`);
  const title = escapeDrawtext(step.title);
  const brand = escapeDrawtext("Forge Industrial Safety");
  const counter = escapeDrawtext(`Scene ${index + 1} of ${total}`);
  const route = escapeDrawtext(step.route);
  const lines = wrapText(step.narrationText, 54).map(escapeDrawtext);

  const filters = [
    `drawtext=text='${brand}':fontcolor=0xcbd5e1:fontsize=28:x=80:y=72`,
    `drawtext=text='${counter}':fontcolor=0x94a3b8:fontsize=22:x=80:y=118`,
    `drawtext=text='${title}':fontcolor=white:fontsize=56:x=80:y=200`,
    `drawtext=text='${route}':fontcolor=0x93c5fd:fontsize=24:x=80:y=280`,
  ];
  lines.forEach((line, i) => {
    filters.push(
      `drawtext=text='${line}':fontcolor=0xe2e8f0:fontsize=30:x=80:y=${360 + i * 42}`,
    );
  });

  await run(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x0f172a:s=${width}x${height}:d=${durationSec}`,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-t",
    String(durationSec),
    out,
  ]);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaultFfmpeg = join(
    root,
    "tmp",
    "ffmpeg",
    "ffmpeg-master-latest-win64-gpl-shared",
    "bin",
    "ffmpeg.exe",
  );
  const ffmpeg = args.ffmpeg || process.env.FFMPEG_PATH || defaultFfmpeg;
  const outDir = join(root, "exports");
  const outPath =
    args.out || join(outDir, EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME || "Forge-Industrial-Safety_Module-Walkthrough.mp4");

  await mkdir(outDir, { recursive: true });
  const workDir = await mkdtemp(join(tmpdir(), "forge-walkthrough-mp4-"));

  try {
    const steps = EXECUTIVE_WALKTHROUGH_STEPS;
    console.log(`Building ${steps.length} scenes (~${Math.round(estimateWalkthroughRuntimeMs() / 1000)}s)…`);
    const parts = [];
    for (let i = 0; i < steps.length; i += 1) {
      process.stdout.write(`  encoding ${i + 1}/${steps.length}: ${steps[i].title}\n`);
      parts.push(await encodeScene(ffmpeg, workDir, steps[i], i, steps.length, args.width, args.height));
    }

    const listPath = join(workDir, "concat.txt");
    await writeFile(
      listPath,
      parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
      "utf8",
    );

    await run(ffmpeg, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outPath,
    ]);

    console.log(`Wrote ${outPath}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
