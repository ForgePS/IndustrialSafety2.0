/**
 * Capture the live Forge Industrial walkthrough UI + narration into an MP4.
 *
 * Default narration: Windows SAPI (local, no cloud).
 * Optional: --polly Danielle|Ruth|Joanna|Matthew|Stephen (Amazon Polly)
 *
 * Usage:
 *   node scripts/capture-walkthrough-mp4.mjs --pick-voice
 *   node scripts/capture-walkthrough-mp4.mjs --voice Matthew
 *   node scripts/capture-walkthrough-mp4.mjs --polly --voice Danielle
 *   node scripts/capture-walkthrough-mp4.mjs --list-voices
 *   node scripts/capture-walkthrough-mp4.mjs --settle-ms 3000
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

const {
  EXECUTIVE_WALKTHROUGH_STEPS,
  EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME,
  EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS,
} = require("../packages/contracts/dist/executive-walkthrough.js");
const { INDUSTRIAL_MODULE_REGISTRY } = require("../packages/contracts/dist/industrial.js");
const moduleRegistry = INDUSTRIAL_MODULE_REGISTRY ?? [];

const VOICE_OPTIONS = [
  { id: "Danielle", label: "Danielle", hint: "Natural female (recommended)" },
  { id: "Ruth", label: "Ruth", hint: "Natural female" },
  { id: "Joanna", label: "Joanna", hint: "Classic female" },
  { id: "Matthew", label: "Matthew", hint: "Natural male" },
  { id: "Stephen", label: "Stephen", hint: "Natural male" },
];

/** Extra on-screen time after navigation so the module is visible before narration. */
const SCENE_SETTLE_MS = 700;

function parseArgs(argv) {
  const out = {
    voice: process.env.WALKTHROUGH_VOICE || "",
    base: process.env.INDUSTRIAL_WEB_BASE_URL || "http://127.0.0.1:3004",
    out: null,
    width: 1920,
    height: 1080,
    ffmpeg: null,
    skipStart: false,
    polly: false,
    pickVoice: false,
    settleMs: SCENE_SETTLE_MS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--voice") out.voice = argv[++i];
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--width") out.width = Number(argv[++i]) || 1920;
    else if (a === "--height") out.height = Number(argv[++i]) || 1080;
    else if (a === "--ffmpeg") out.ffmpeg = argv[++i];
    else if (a === "--skip-start") out.skipStart = true;
    else if (a === "--polly") out.polly = true;
    else if (a === "--pick-voice") out.pickVoice = true;
    else if (a === "--settle-ms") out.settleMs = Math.max(500, Number(argv[++i]) || SCENE_SETTLE_MS);
    else if (a === "--list-voices") {
      for (const v of VOICE_OPTIONS) console.log(`${v.id}\t${v.hint}`);
      process.exit(0);
    }
  }
  return out;
}

async function resolveVoice(args) {
  const ids = new Set(VOICE_OPTIONS.map((v) => v.id));
  if (args.voice && ids.has(args.voice)) return args.voice;
  if (args.voice && !ids.has(args.voice)) {
    console.warn(`Unknown voice "${args.voice}". Available: ${[...ids].join(", ")}`);
  }
  if (!args.pickVoice && !process.stdin.isTTY) {
    return "Danielle";
  }
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nSelect narration voice:");
  VOICE_OPTIONS.forEach((v, i) => {
    console.log(`  ${i + 1}) ${v.id} — ${v.hint}`);
  });
  const answer = (await rl.question("Voice number or name [1 Danielle]: ")).trim();
  rl.close();
  if (!answer) return "Danielle";
  const asNum = Number(answer);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= VOICE_OPTIONS.length) {
    return VOICE_OPTIONS[asNum - 1].id;
  }
  const match = VOICE_OPTIONS.find((v) => v.id.toLowerCase() === answer.toLowerCase());
  return match?.id ?? "Danielle";
}

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
      shell: Boolean(opts.shell),
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${(stderr || stdout).slice(-3000)}`));
    });
  });
}

function resolveFfmpeg(explicit) {
  if (explicit) return explicit;
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const portable = join(
    root,
    "tmp",
    "ffmpeg",
    "ffmpeg-master-latest-win64-gpl-shared",
    "bin",
    "ffmpeg.exe",
  );
  if (existsSync(portable)) return portable;
  return "ffmpeg";
}

function resolveFfprobe(ffmpegBin) {
  if (ffmpegBin.toLowerCase().endsWith("ffmpeg.exe")) {
    return ffmpegBin.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  }
  if (ffmpegBin.endsWith("ffmpeg")) return ffmpegBin.replace(/ffmpeg$/, "ffprobe");
  return "ffprobe";
}

async function probeDurationMs(ffprobe, filePath) {
  const { stdout } = await run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const sec = Number(String(stdout).trim());
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.round(sec * 1000);
}

/** Map walkthrough voice ids onto installed Windows voices when possible. */
function sapiVoiceHint(voiceId) {
  const map = {
    Danielle: "Zira",
    Ruth: "Zira",
    Joanna: "Zira",
    Matthew: "David",
    Stephen: "David",
  };
  return map[voiceId] || voiceId;
}

async function synthesizeSapi(text, voiceHint, wavPath) {
  const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$preferred = @('${voiceHint.replace(/'/g, "''")}', 'Zira', 'David', 'Mark', 'Hazel')
$voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
foreach ($name in $preferred) {
  $match = $voices | Where-Object { $_ -like "*$name*" } | Select-Object -First 1
  if ($match) { $synth.SelectVoice($match); break }
}
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile('${wavPath.replace(/'/g, "''")}')
$synth.Speak(@'
${text.replace(/'/g, "''")}
'@)
$synth.Dispose()
`.trim();
  const scriptPath = `${wavPath}.ps1`;
  await writeFile(scriptPath, ps, "utf8");
  await run(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { shell: false },
  );
}

async function synthesizePolly(text, voice, outPath) {
  try {
    await run(
      "aws",
      [
        "polly",
        "synthesize-speech",
        "--output-format",
        "mp3",
        "--voice-id",
        voice,
        "--engine",
        "generative",
        "--text",
        text,
        outPath,
      ],
      { shell: process.platform === "win32" },
    );
  } catch {
    await run(
      "aws",
      [
        "polly",
        "synthesize-speech",
        "--output-format",
        "mp3",
        "--voice-id",
        voice,
        "--engine",
        "neural",
        "--text",
        text,
        outPath,
      ],
      { shell: process.platform === "win32" },
    );
  }
}

function captureMePayload() {
  const modules = moduleRegistry
    .filter((m) => m.implementationStatus === "AVAILABLE")
    .map((m) => m.code);
  return {
    userId: "walkthrough-capture-user",
    personId: null,
    tenantId: "producers-rice-mill-capture",
    organizationIds: [],
    permissions: [
      "industrial.access",
      "industrial.admin",
      "industrial.presentation.executive.view",
      "industrial.presentation.executive.manage",
      "industrial.presentation.executive.export",
      "industrial.personnel.view",
      "industrial.training.view",
      "industrial.incidents.view",
      "industrial.osha.view",
      "industrial.inspections.view",
      "industrial.fleet.view",
      "industrial.reporting.view",
    ],
    activeProducts: ["FORGE_INDUSTRIAL"],
    activeModules: modules.length
      ? modules
      : ["CORE", "PERSONNEL", "TRAINING", "INCIDENTS", "OSHA", "FLEET"],
    isPlatformAdmin: true,
    authProvider: "capture",
    accessMode: "PLATFORM_ADMIN_SUPPORT",
    tenants: [
      {
        tenantId: "producers-rice-mill-capture",
        slug: "producers-rice-mill",
        displayName: "Producers Rice Mill",
        tenantStatus: "ACTIVE",
        membershipId: null,
        membershipStatus: "ACTIVE",
        isDefaultTenant: true,
        selectable: true,
      },
    ],
    legalAcknowledgments: {
      status: "NOT_REQUIRED",
      pendingCount: 0,
      gatePath: "/legal/acknowledge/",
      enabled: false,
    },
  };
}

function startAudioServer(assets) {
  const byName = new Map(assets.map((a) => [a.fileName, a.filePath]));
  const server = createServer((req, res) => {
    const name = decodeURIComponent(String(req.url ?? "/").replace(/^\//, ""));
    const filePath = byName.get(name);
    if (!filePath) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

async function waitForUrl(url, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  args.voice = await resolveVoice(args);
  console.log(`Using voice: ${args.voice}${args.polly ? " (Polly)" : " (local Windows TTS)"}`);
  const ffmpeg = resolveFfmpeg(args.ffmpeg);
  const ffprobe = resolveFfprobe(ffmpeg);
  const outDir = join(root, "exports");
  const outPath = args.out || join(outDir, EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME);
  const workDir = await mkdtemp(join(tmpdir(), "forge-walkthrough-capture-"));
  const audioDir = join(workDir, "audio");
  const videoDir = join(workDir, "video");
  await mkdir(outDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });
  await mkdir(videoDir, { recursive: true });

  let nextProc = null;
  let audioServer = null;

  try {
    console.log(
      args.polly
        ? `Synthesizing Polly narration (${args.voice})…`
        : `Synthesizing local Windows narration (hint=${sapiVoiceHint(args.voice)})…`,
    );
    const assets = [];
    for (const step of EXECUTIVE_WALKTHROUGH_STEPS) {
      const fileName = `${step.id}.mp3`;
      const filePath = join(audioDir, fileName);
      process.stdout.write(`  ${step.id}… `);
      if (args.polly) {
        await synthesizePolly(step.narrationText, args.voice, filePath);
      } else {
        const wavPath = join(audioDir, `${step.id}.wav`);
        await synthesizeSapi(step.narrationText, sapiVoiceHint(args.voice), wavPath);
        await run(ffmpeg, ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-qscale:a", "2", filePath]);
      }
      const probed = await probeDurationMs(ffprobe, filePath);
      const durationMs = probed ?? step.durationMs;
      console.log(`${Math.round(durationMs / 1000)}s`);
      assets.push({ sceneId: step.id, fileName, filePath, durationMs });
    }

    const { server, port } = await startAudioServer(assets);
    audioServer = server;
    const narrationInject = assets.map((a) => ({
      sceneId: a.sceneId,
      durationMs: a.durationMs,
      downloadUrl: `http://127.0.0.1:${port}/${a.fileName}`,
      contentType: "audio/mpeg",
    }));

    if (!args.skipStart) {
      console.log("Starting industrial-web (capture mode)…");
      nextProc = spawn(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["--filter", "@forge/industrial-web", "dev"],
        {
          cwd: root,
          env: {
            ...process.env,
            NEXT_PUBLIC_WALKTHROUGH_CAPTURE: "true",
          },
          stdio: ["ignore", "pipe", "pipe"],
          shell: process.platform === "win32",
        },
      );
      nextProc.stdout.on("data", (c) => {
        const s = String(c);
        if (/ready|started|Local:/i.test(s)) process.stdout.write(`  [web] ${s}`);
      });
      nextProc.stderr.on("data", (c) => {
        const s = String(c);
        if (/error|Error|Ready/i.test(s)) process.stderr.write(`  [web] ${s}`);
      });
    }

    await waitForUrl(`${args.base.replace(/\/$/, "")}/`);
    console.log("Recording live platform walkthrough…");

    const playwrightPath = join(root, "apps", "platform-api", "node_modules", "playwright");
    const { chromium } = require(existsSync(playwrightPath) ? playwrightPath : "playwright");

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: args.width, height: args.height },
        recordVideo: { dir: videoDir, size: { width: args.width, height: args.height } },
      });
      const page = await context.newPage();

      let ready = false;
      let complete = false;
      await page.exposeFunction("__forgeWalkthroughMark", (kind) => {
        if (kind === "ready") ready = true;
        if (kind === "complete") complete = true;
      });

      const me = captureMePayload();
      await page.addInitScript(
        ({ narration, meJson }) => {
          sessionStorage.setItem("forge-walkthrough-capture", "1");
          sessionStorage.setItem("forge-walkthrough-capture-me", meJson);
          window.__FORGE_WALKTHROUGH_NARRATION__ = narration;
          window.addEventListener("forge-walkthrough-ready", () => {
            window.__forgeWalkthroughMark?.("ready");
          });
          window.addEventListener("forge-walkthrough-complete", () => {
            window.__forgeWalkthroughMark?.("complete");
          });
        },
        { narration: narrationInject, meJson: JSON.stringify(me) },
      );

      const renderUrl = `${args.base.replace(/\/$/, "")}/presentation/executive-walkthrough/render/?mode=render`;
      await page.goto(`${args.base.replace(/\/$/, "")}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      // Wait for capture auth + walkthrough API to mount inside the shell.
      await page.waitForFunction(
        () => Boolean(window.__FORGE_WALKTHROUGH_API__),
        undefined,
        { timeout: 60_000 },
      );

      await page.evaluate(
        ({ narration, voiceId }) => {
          window.__FORGE_WALKTHROUGH_NARRATION__ = narration;
          // Host drives scene timing from narration durations; disable in-page
          // auto-advance so Playwright next() cannot race the audio-end handler.
          window.__FORGE_WALKTHROUGH_API__?.start({
            mode: "render",
            narrationEnabled: false,
            captions: true,
            contentVersion: "local-capture",
            voiceId,
          });
          window.dispatchEvent(new CustomEvent("forge-walkthrough-ready"));
        },
        { narration: narrationInject, voiceId: args.voice },
      );
      ready = true;

      async function settleScene(stepIndex) {
        const step = EXECUTIVE_WALKTHROUGH_STEPS[stepIndex];
        const started = Date.now();
        if (step?.route) {
          try {
            await page.waitForURL(
              (url) => {
                const path = url.pathname.replace(/\/$/, "") || "/";
                const want = String(step.route).split("?")[0].replace(/\/$/, "") || "/";
                return path === want || path.endsWith(want);
              },
              { timeout: 8_000 },
            );
          } catch {
            // Some steps share routes or use query-only changes.
          }
        }
        if (step?.targetSelector) {
          try {
            await page.waitForSelector(`[data-walkthrough="${step.targetSelector}"]`, {
              timeout: 6_000,
              state: "visible",
            });
          } catch {
            // Demo/capture shells may omit a target; still apply minimum settle.
          }
        }
        const elapsed = Date.now() - started;
        if (elapsed < args.settleMs) {
          await page.waitForTimeout(args.settleMs - elapsed);
        }
      }

      // Drive scene advances from the capture host so the UI leads the narrator.
      for (let i = 0; i < assets.length; i += 1) {
        await settleScene(i);
        const waitMs = Math.max(1200, assets[i].durationMs);
        console.log(
          `  scene ${i + 1}/${assets.length}: ${assets[i].sceneId} (settle + ${Math.round(waitMs / 1000)}s narration)`,
        );
        await page.waitForTimeout(waitMs);
        if (i < assets.length - 1) {
          await page.evaluate(() => window.__FORGE_WALKTHROUGH_API__?.next());
        }
      }
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-walkthrough-complete", "true");
        window.dispatchEvent(new CustomEvent("forge-walkthrough-complete"));
      });
      complete = true;
      await page.waitForTimeout(1500);
      await context.close();
    } finally {
      await browser.close().catch(() => undefined);
    }

    const files = await readdir(videoDir);
    const webm = files.find((f) => f.endsWith(".webm"));
    if (!webm) throw new Error("Playwright produced no video");
    const videoPath = join(videoDir, webm);

    console.log("Muxing platform video + narration audio (with settle padding)…");
    const padded = [];
    for (const asset of assets) {
      const delayed = join(workDir, `${asset.sceneId}-padded.mp3`);
      // Lead silence matches on-screen settle so audio starts after the module appears.
      await run(ffmpeg, [
        "-y",
        "-i",
        asset.filePath,
        "-af",
        `adelay=${args.settleMs}|${args.settleMs}`,
        "-codec:a",
        "libmp3lame",
        "-qscale:a",
        "2",
        delayed,
      ]);
      padded.push(delayed);
    }
    const listPath = join(workDir, "audio.txt");
    await writeFile(
      listPath,
      padded.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
      "utf8",
    );
    const narrationPath = join(workDir, "narration.mp3");
    await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", narrationPath]);

    await run(ffmpeg, [
      "-y",
      "-i",
      videoPath,
      "-i",
      narrationPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      "-r",
      "30",
      outPath,
    ]);

    await copyFile(narrationPath, join(outDir, "walkthrough-narration.mp3")).catch(() => undefined);
    console.log(`Wrote ${outPath}`);
  } finally {
    if (audioServer) await new Promise((r) => audioServer.close(() => r()));
    if (nextProc && !nextProc.killed) nextProc.kill();
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
