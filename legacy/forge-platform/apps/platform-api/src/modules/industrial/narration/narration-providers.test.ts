import { describe, expect, it } from "vitest";
import {
  createNarrationProvider,
  resolveNarrationProviderKind,
  PollyNarrationProvider,
} from "./narration-providers.js";

describe("narration providers", () => {
  it("defaults to polly", () => {
    expect(resolveNarrationProviderKind(undefined)).toBe("polly");
    expect(resolveNarrationProviderKind("unknown")).toBe("polly");
  });

  it("creates a Polly provider by default", () => {
    const provider = createNarrationProvider({ region: "us-east-1", provider: "polly" });
    expect(provider).toBeInstanceOf(PollyNarrationProvider);
    expect(provider.name).toBe("polly");
  });

  it("requires API keys for openai and elevenlabs", () => {
    expect(() =>
      createNarrationProvider({ region: "us-east-1", provider: "openai", openAiApiKey: "" }),
    ).toThrow(/OPENAI_API_KEY/);
    expect(() =>
      createNarrationProvider({
        region: "us-east-1",
        provider: "elevenlabs",
        elevenLabsApiKey: "",
      }),
    ).toThrow(/ELEVENLABS_API_KEY/);
  });
});
