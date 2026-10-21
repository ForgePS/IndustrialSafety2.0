/**
 * Helpers for making training video uploads playable on mobile browsers
 * (Android Chrome + iOS Safari): H.264 + AAC + yuv420p + moov-at-front / faststart.
 *
 * Speed strategy:
 * - Skip (instant) when the uploaded MP4 is already mobile-playable.
 * - Remux (seconds) for QuickTime/MOV that only needs a container rewrite.
 * - Transcode only for known-bad codecs/profiles (HEVC, Opus, Baseline@L3.1@1080p, …).
 */

export const TRAINING_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export function isTrainingVideoMime(mimeType: string): boolean {
  return TRAINING_VIDEO_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

export type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  profile?: string | number;
  width?: number;
  height?: number;
  /** ffprobe reports H.264 level as integer tenths (31 = 3.1, 40 = 4.0). */
  level?: number;
};

export type FfprobeReport = {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    duration?: string;
    tags?: Record<string, string | undefined>;
  };
};

export type VideoCompatDecision =
  | { action: "skip"; reason: string }
  | { action: "remux"; reason: string }
  | { action: "transcode"; reason: string };

function profileLooksIncompatible(profile: string | number | undefined): boolean {
  const p = String(profile ?? "").toLowerCase();
  if (!p) return false;
  return (
    p.includes("10") ||
    p.includes("422") ||
    p.includes("444") ||
    p.includes("high 10") ||
    p.includes("high422") ||
    p.includes("high444")
  );
}

function profileIsBaseline(profile: string | number | undefined): boolean {
  const p = String(profile ?? "").toLowerCase();
  return p.includes("baseline") || p === "66";
}

/** Practical Level 3.1 frame size for landscape / portrait tablets. */
export function fitsMobileLevel31Frame(width?: number, height?: number): boolean {
  const w = Number(width ?? 0);
  const h = Number(height ?? 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  return (w <= 1280 && h <= 720) || (w <= 720 && h <= 1280);
}

/** True when the upload is already an MP4-family container (not QuickTime .mov). */
export function isLikelyMp4Container(input: {
  probe?: FfprobeReport | undefined;
  mimeType?: string | null | undefined;
  filename?: string | null | undefined;
}): boolean {
  const name = String(input.filename ?? "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".mov")) return false;
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return true;

  const mime = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  if (mime === "video/quicktime") return false;
  if (mime === "video/mp4") return true;

  const brand = String(input.probe?.format?.tags?.major_brand ?? "")
    .trim()
    .toLowerCase();
  if (brand === "qt" || brand === "quicktime") return false;
  if (["isom", "iso2", "mp41", "mp42", "avc1", "dash", "msdh", "m4v"].includes(brand)) {
    return true;
  }
  return false;
}

/**
 * Prefer skip/remux (fast). Transcode only for known-bad mobile cases.
 */
export function decideTrainingVideoCompat(
  probe: FfprobeReport,
  opts?: { mimeType?: string | null | undefined; filename?: string | null | undefined },
): VideoCompatDecision {
  const video = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const audioStreams = (probe.streams ?? []).filter((s) => s.codec_type === "audio");

  if (!video?.codec_name) {
    return { action: "transcode", reason: "no video stream" };
  }

  const codec = video.codec_name.toLowerCase();
  if (codec !== "h264") {
    return { action: "transcode", reason: `video codec ${codec}` };
  }
  if ((video.pix_fmt ?? "").toLowerCase() !== "yuv420p") {
    return { action: "transcode", reason: `pixel format ${video.pix_fmt ?? "unknown"}` };
  }
  if (profileLooksIncompatible(video.profile)) {
    return { action: "transcode", reason: `H.264 profile ${video.profile}` };
  }

  for (const audio of audioStreams) {
    const acodec = (audio.codec_name ?? "").toLowerCase();
    if (acodec && acodec !== "aac") {
      return { action: "transcode", reason: `audio codec ${acodec}` };
    }
  }

  const level = Number(video.level ?? 0);
  const oversizedForL31 = !fitsMobileLevel31Frame(video.width, video.height);
  if (oversizedForL31 && level > 0 && level <= 31) {
    return {
      action: "transcode",
      reason: `non-conformant Level ${level / 10} at ${video.width}x${video.height}`,
    };
  }
  if (oversizedForL31 && profileIsBaseline(video.profile) && !(level >= 40)) {
    return {
      action: "transcode",
      reason: `Baseline at ${video.width}x${video.height} (level ${level || "unknown"})`,
    };
  }

  // Already a playable MP4 → activate immediately (no download / rewrite).
  if (
    isLikelyMp4Container({
      probe,
      mimeType: opts?.mimeType,
      filename: opts?.filename,
    })
  ) {
    return { action: "skip", reason: "H.264/AAC MP4 already mobile-playable" };
  }

  // QuickTime / odd container with good codecs → remux to mp4 + faststart.
  return { action: "remux", reason: "H.264/AAC needs MP4/faststart remux" };
}

/** ffmpeg args to remux into a mobile-friendly MP4 without re-encoding. */
export function iosRemuxArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-brand",
    "mp42",
    "-f",
    "mp4",
    outputPath,
  ];
}

/**
 * Fast tablet re-encode when remux/skip is unsafe:
 * Main@L4.0, ultrafast, max 960 wide (keeps long course videos finishing quickly).
 */
export function iosTranscodeArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-profile:v",
    "main",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    // 960px is enough for tablets and much faster than 1080→1280 on 1 vCPU.
    "-vf",
    "scale='min(960,iw)':-2",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    "-brand",
    "mp42",
    "-f",
    "mp4",
    outputPath,
  ];
}
