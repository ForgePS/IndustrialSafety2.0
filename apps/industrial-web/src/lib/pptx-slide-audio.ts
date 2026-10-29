import type JSZip from "jszip";
import { revokeTrainingAudioBuffer } from "@/lib/training-slide-audio-player";

export type PptxSlideAudioTrack = {
  slideIndex: number;
  fileName: string;
  mimeType: string;
  objectUrl: string;
};

export { unlockTrainingAudioPlayback } from "@/lib/training-slide-audio-player";

const AUDIO_EXT_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".webm": "audio/webm",
  ".wma": "audio/x-ms-wma",
};

function mimeForMediaPath(path: string): string | null {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  return AUDIO_EXT_MIME[lower.slice(dot)] ?? null;
}

function isBrowserPlayableMime(mimeType: string): boolean {
  return !/wma|x-ms-wma|asf/i.test(mimeType);
}

/** Detect real codec from magic bytes (PowerPoint extensions are often wrong/missing). */
function sniffAudioMime(bytes: Uint8Array, fallback: string | null): string | null {
  if (bytes.length >= 12) {
    if (bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xb2 && bytes[3] === 0x75) {
      return "audio/x-ms-wma";
    }
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      const tag = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
      if (tag === "WAVE") return "audio/wav";
    }
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio/mpeg";
    if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg";
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return "audio/mp4";
    }
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return "audio/ogg";
    }
  }
  return fallback;
}

function resolveZipPath(fromDir: string, target: string): string {
  const normalized = target.replace(/\\/g, "/").replace(/^\//, "");
  if (normalized.toLowerCase().startsWith("ppt/")) return normalized;
  const joined = [...fromDir.split("/").filter(Boolean), ...normalized.split("/")];
  const out: string[] = [];
  for (const part of joined) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

function parseRelationships(xml: string): Array<{ id: string; type: string; target: string }> {
  const rows: Array<{ id: string; type: string; target: string }> = [];
  const tagRe = /<Relationship\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml))) {
    const attrs = match[1] ?? "";
    const id = /\bId\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    const type = /\bType\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    const target = /\bTarget\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    if (id && type && target) rows.push({ id, type, target });
  }
  return rows;
}

function relationshipIdsUsedForAudio(slideXml: string): Set<string> {
  const ids = new Set<string>();
  const patterns = [/r:link\s*=\s*"([^"]+)"/gi, /r:embed\s*=\s*"([^"]+)"/gi];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(slideXml))) {
      ids.add(match[1]!);
    }
  }
  return ids;
}

function slideLooksLikeItHasAudio(slideXml: string): boolean {
  return /audioFile|p:audio|p14:media|a:wavAudioFile|embeddedAudio|sndTgt/i.test(slideXml);
}

function isAudioRelationship(type: string, target: string): boolean {
  const typeLower = type.toLowerCase();
  if (typeLower.includes("/relationships/audio")) return true;
  const mime = mimeForMediaPath(target);
  if (!mime) return false;
  if (typeLower.includes("/relationships/media")) return true;
  if (typeLower.includes("/relationships/video")) return true;
  return true;
}

function findMediaFile(zip: JSZip, zipPath: string, target: string) {
  const candidates = [
    zipPath,
    target.replace(/^\//, ""),
    target.replace(/^\.\.\//, "ppt/"),
    `ppt/media/${target.split("/").pop() ?? ""}`,
    `ppt/media/${zipPath.split("/").pop() ?? ""}`,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const file = zip.file(candidate);
    if (file) return { file, path: candidate };
  }
  const wanted = zipPath.toLowerCase();
  const match = Object.keys(zip.files).find((name) => name.toLowerCase() === wanted);
  if (match) {
    const file = zip.file(match);
    if (file) return { file, path: match };
  }
  return null;
}

async function listSlidePathsInOrder(zip: JSZip): Promise<string[]> {
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  const presentationRels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  if (presentationXml && presentationRels) {
    const relationships = parseRelationships(presentationRels);
    const byId = new Map(relationships.map((row) => [row.id, row]));
    const ordered: string[] = [];
    const seen = new Set<string>();
    const sldIdRe = /<p:sldId\b([^>]*?)\/?>/gi;
    let match: RegExpExecArray | null;
    while ((match = sldIdRe.exec(presentationXml))) {
      const attrs = match[1] ?? "";
      const rid =
        /\br:id\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? /\bId\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
      if (!rid) continue;
      const rel = byId.get(rid);
      if (!rel) continue;
      if (!/relationships\/slide/i.test(rel.type)) continue;
      const path = resolveZipPath("ppt", rel.target);
      if (seen.has(path)) continue;
      seen.add(path);
      ordered.push(path);
    }
    if (ordered.length) return ordered;
  }

  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const bi = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return ai - bi;
    });
}

/**
 * Extract per-slide embedded audio from a PPTX ArrayBuffer.
 * Callers must revoke returned object URLs when done.
 */
export async function extractPptxSlideAudio(
  buffer: ArrayBuffer,
): Promise<Map<number, PptxSlideAudioTrack[]>> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const bySlide = new Map<number, PptxSlideAudioTrack[]>();
  const objectUrlByZipPath = new Map<string, string>();
  const mimeByZipPath = new Map<string, string>();

  const slidePaths = await listSlidePathsInOrder(zip);

  for (let slideIndex = 0; slideIndex < slidePaths.length; slideIndex += 1) {
    const slidePath = slidePaths[slideIndex]!;
    const slideBase = slidePath.split("/").pop() ?? "";
    const slideNum = slideBase.match(/slide(\d+)\.xml/i)?.[1];
    const relsPath = slideNum
      ? `ppt/slides/_rels/slide${slideNum}.xml.rels`
      : slidePath.replace(/[^/]+$/, (name) => `_rels/${name}.rels`);

    const relsFile = zip.file(relsPath);
    if (!relsFile) continue;

    const slideXml = (await zip.file(slidePath)?.async("string")) ?? "";
    const relsXml = await relsFile.async("string");
    const relationships = parseRelationships(relsXml);
    const usedIds = relationshipIdsUsedForAudio(slideXml);
    const looksAudio = slideLooksLikeItHasAudio(slideXml);

    const tracks: PptxSlideAudioTrack[] = [];
    const seenPaths = new Set<string>();

    for (const rel of relationships) {
      if (!isAudioRelationship(rel.type, rel.target)) continue;
      if (/^https?:\/\//i.test(rel.target) || /^file:/i.test(rel.target)) continue;

      const explicitlyLinked = usedIds.has(rel.id);
      const isStrictAudioType = /relationships\/audio/i.test(rel.type);
      if (usedIds.size > 0 && !explicitlyLinked && !isStrictAudioType && !looksAudio) {
        continue;
      }
      if (
        usedIds.size === 0 &&
        !looksAudio &&
        !isStrictAudioType &&
        !mimeForMediaPath(rel.target)
      ) {
        continue;
      }

      const zipPath = resolveZipPath("ppt/slides", rel.target);
      const found = findMediaFile(zip, zipPath, rel.target);
      if (!found || seenPaths.has(found.path)) continue;
      seenPaths.add(found.path);

      const fallbackMime =
        mimeForMediaPath(found.path) ?? mimeForMediaPath(rel.target) ?? "audio/mpeg";

      let objectUrl = objectUrlByZipPath.get(found.path);
      let mimeType = mimeByZipPath.get(found.path) ?? fallbackMime;

      if (!objectUrl) {
        const bytes = await found.file.async("uint8array");
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const sniffed = sniffAudioMime(copy, fallbackMime);
        if (!sniffed || !isBrowserPlayableMime(sniffed)) {
          tracks.push({
            slideIndex,
            fileName: found.path.split("/").pop() || found.path,
            mimeType: sniffed ?? fallbackMime,
            objectUrl: "",
          });
          continue;
        }
        mimeType = sniffed;
        const blob = new Blob([copy], { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        objectUrlByZipPath.set(found.path, objectUrl);
        mimeByZipPath.set(found.path, mimeType);
      }

      tracks.push({
        slideIndex,
        fileName: found.path.split("/").pop() || found.path,
        mimeType,
        objectUrl,
      });
    }

    const playable = tracks.filter((track) => track.objectUrl);
    const finalTracks = playable.length ? playable : tracks;
    if (finalTracks.length) bySlide.set(slideIndex, finalTracks);
  }

  return bySlide;
}

export function revokePptxSlideAudio(tracksBySlide: Map<number, PptxSlideAudioTrack[]>): void {
  const seen = new Set<string>();
  for (const tracks of tracksBySlide.values()) {
    for (const track of tracks) {
      if (!track.objectUrl || seen.has(track.objectUrl)) continue;
      seen.add(track.objectUrl);
      revokeTrainingAudioBuffer(track.objectUrl);
      URL.revokeObjectURL(track.objectUrl);
    }
  }
}

export function slideHasAudio(
  tracksBySlide: Map<number, PptxSlideAudioTrack[]>,
  slideIndex: number,
): boolean {
  return (tracksBySlide.get(slideIndex)?.length ?? 0) > 0;
}

/** Exposed for unit tests — keep parsing helpers pure. */
export const __pptxAudioTestUtils = {
  mimeForMediaPath,
  resolveZipPath,
  parseRelationships,
  relationshipIdsUsedForAudio,
  slideLooksLikeItHasAudio,
  isAudioRelationship,
  isBrowserPlayableMime,
  sniffAudioMime,
};
