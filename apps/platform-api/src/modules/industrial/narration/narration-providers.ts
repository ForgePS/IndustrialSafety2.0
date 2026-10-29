/**
 * Narration TTS provider adapters for Walkthrough Studio.
 * Polly is the default production provider; OpenAI and ElevenLabs are available
 * when API keys are configured via environment.
 */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type VoiceId,
} from "@aws-sdk/client-polly";
import { Logger } from "@nestjs/common";
import { ForgeError } from "@forge/errors";

export type NarrationSynthInput = {
  text: string;
  voiceId: string;
  speed?: number;
  format?: "mp3" | "ogg_vorbis";
};

export type NarrationSynthResult = {
  audio: Buffer;
  contentType: string;
  durationMs: number;
  engine: string;
};

export interface NarrationProvider {
  readonly name: string;
  synthesize(input: NarrationSynthInput): Promise<NarrationSynthResult>;
}

const DEFAULT_VOICE = "Danielle";
const MP3_CONTENT_TYPE = "audio/mpeg";
const ASSUMED_MP3_BITRATE_BPS = 48_000;
const POLLY_ENGINES = ["generative", "neural", "standard"] as const;

export function estimateDurationMsFromBytes(byteLength: number): number {
  if (byteLength <= 0) return 0;
  return Math.max(500, Math.round((byteLength * 8 * 1000) / ASSUMED_MP3_BITRATE_BPS));
}

export function estimateDurationMsFromWords(text: string, speedPercent = 100): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 500;
  const wpm = Math.max(60, 150 * (Math.max(50, Math.min(200, speedPercent)) / 100));
  return Math.max(500, Math.round((words / wpm) * 60_000));
}

export function estimateDurationMs(text: string, byteLength: number, speedPercent = 100): number {
  const fromBytes = estimateDurationMsFromBytes(byteLength);
  const fromWords = estimateDurationMsFromWords(text, speedPercent);
  if (fromBytes < 800 && fromWords > fromBytes) return fromWords;
  return fromBytes;
}

function wrapSsml(text: string, speedPercent: number): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const rate = Math.max(50, Math.min(200, Math.round(speedPercent)));
  return `<speak><prosody rate="${rate}%">${escaped}</prosody></speak>`;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as Readable).pipe === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.alloc(0);
}

export class PollyNarrationProvider implements NarrationProvider {
  readonly name = "polly";
  private readonly client: PollyClient;
  private readonly logger = new Logger(PollyNarrationProvider.name);

  constructor(region: string) {
    this.client = new PollyClient({ region });
  }

  async synthesize(input: NarrationSynthInput): Promise<NarrationSynthResult> {
    const voiceId = (input.voiceId?.trim() ||
      process.env.POLLY_VOICE_ID ||
      DEFAULT_VOICE) as VoiceId;
    const speed = input.speed ?? 100;
    const format = input.format ?? "mp3";
    const text = input.text.trim();
    if (!text) {
      throw new ForgeError("VALIDATION_FAILED", "Narration text is required");
    }

    const ssml = wrapSsml(text, speed);
    let lastError: unknown;

    for (const engine of POLLY_ENGINES) {
      try {
        // Generative engine has limited SSML; use plain text for best quality.
        const useSsml = engine !== "generative";
        const response = await this.client.send(
          new SynthesizeSpeechCommand({
            Text: useSsml ? ssml : text,
            TextType: useSsml ? "ssml" : "text",
            OutputFormat: format === "ogg_vorbis" ? "ogg_vorbis" : "mp3",
            VoiceId: voiceId,
            Engine: engine as Engine,
          }),
        );
        const audio = await streamToBuffer(response.AudioStream);
        if (!audio.length) {
          throw new Error("Empty Polly audio stream");
        }
        return {
          audio,
          contentType: format === "ogg_vorbis" ? "audio/ogg" : MP3_CONTENT_TYPE,
          durationMs: estimateDurationMs(text, audio.byteLength, speed),
          engine: `polly:${engine}`,
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Polly ${engine} failed for voice=${voiceId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    throw new ForgeError(
      "INTERNAL_ERROR",
      `Polly narration failed: ${
        lastError instanceof Error
          ? lastError.name === "AccessDeniedException" || /not authorized/i.test(lastError.message)
            ? "API task role is missing polly:SynthesizeSpeech"
            : lastError.message.split("\n")[0]!.slice(0, 180)
          : "unknown Polly error"
      }`,
    );
  }
}

/**
 * OpenAI TTS adapter (tts-1 / tts-1-hd).
 * Requires OPENAI_API_KEY. Voice ids map to OpenAI voices (alloy, echo, fable, onyx, nova, shimmer).
 */
export class OpenAiNarrationProvider implements NarrationProvider {
  readonly name = "openai";
  private readonly logger = new Logger(OpenAiNarrationProvider.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = "tts-1-hd") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async synthesize(input: NarrationSynthInput): Promise<NarrationSynthResult> {
    const text = input.text.trim();
    if (!text) throw new ForgeError("VALIDATION_FAILED", "Narration text is required");
    const voice = mapOpenAiVoice(input.voiceId);
    const speed = Math.max(0.25, Math.min(4, (input.speed ?? 100) / 100));

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice,
        response_format: "mp3",
        speed,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      this.logger.error(`OpenAI TTS failed: ${response.status} ${detail}`);
      throw new ForgeError("INTERNAL_ERROR", `OpenAI narration failed (${response.status})`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio,
      contentType: MP3_CONTENT_TYPE,
      durationMs: estimateDurationMs(text, audio.byteLength, input.speed ?? 100),
      engine: `openai:${this.model}`,
    };
  }
}

function mapOpenAiVoice(voiceId: string): string {
  const raw = voiceId.trim().toLowerCase();
  const allowed = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
  if (allowed.has(raw)) return raw;
  // Map Polly-ish / Forge profile names onto OpenAI defaults.
  if (
    raw.includes("matthew") ||
    raw.includes("stephen") ||
    raw.includes("gregory") ||
    raw.includes("male")
  ) {
    return "onyx";
  }
  if (raw.includes("ruth") || raw.includes("executive")) return "nova";
  return "nova";
}

/**
 * ElevenLabs TTS adapter.
 * Requires ELEVENLABS_API_KEY. voiceId should be an ElevenLabs voice id.
 */
export class ElevenLabsNarrationProvider implements NarrationProvider {
  readonly name = "elevenlabs";
  private readonly logger = new Logger(ElevenLabsNarrationProvider.name);
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(apiKey: string, modelId = "eleven_multilingual_v2") {
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  async synthesize(input: NarrationSynthInput): Promise<NarrationSynthResult> {
    const text = input.text.trim();
    if (!text) throw new ForgeError("VALIDATION_FAILED", "Narration text is required");
    const voiceId = input.voiceId.trim() || process.env.ELEVENLABS_VOICE_ID || "";
    if (!voiceId) {
      throw new ForgeError("VALIDATION_FAILED", "ElevenLabs voice id is required");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      this.logger.error(`ElevenLabs TTS failed: ${response.status} ${detail}`);
      throw new ForgeError("INTERNAL_ERROR", `ElevenLabs narration failed (${response.status})`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio,
      contentType: MP3_CONTENT_TYPE,
      durationMs: estimateDurationMs(text, audio.byteLength, input.speed ?? 100),
      engine: `elevenlabs:${this.modelId}`,
    };
  }
}

export type NarrationProviderKind = "polly" | "openai" | "elevenlabs";

export function resolveNarrationProviderKind(explicit?: string | null): NarrationProviderKind {
  const raw = (explicit || process.env.WALKTHROUGH_TTS_PROVIDER || "polly").trim().toLowerCase();
  if (raw === "openai" || raw === "elevenlabs" || raw === "polly") return raw;
  return "polly";
}

export function createNarrationProvider(input: {
  region: string;
  provider?: string | null;
  openAiApiKey?: string | null;
  elevenLabsApiKey?: string | null;
}): NarrationProvider {
  const kind = resolveNarrationProviderKind(input.provider);
  if (kind === "openai") {
    const key = input.openAiApiKey || process.env.OPENAI_API_KEY || "";
    if (!key) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "OPENAI_API_KEY is required when WALKTHROUGH_TTS_PROVIDER=openai",
      );
    }
    return new OpenAiNarrationProvider(key, process.env.OPENAI_TTS_MODEL || "tts-1-hd");
  }
  if (kind === "elevenlabs") {
    const key = input.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || "";
    if (!key) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "ELEVENLABS_API_KEY is required when WALKTHROUGH_TTS_PROVIDER=elevenlabs",
      );
    }
    return new ElevenLabsNarrationProvider(
      key,
      process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    );
  }
  return new PollyNarrationProvider(input.region);
}

export function narrationCacheKey(parts: {
  provider: string;
  voiceId: string;
  text: string;
  speed: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        provider: parts.provider,
        voiceId: parts.voiceId,
        text: parts.text,
        speed: parts.speed,
      }),
    )
    .digest("hex");
}
