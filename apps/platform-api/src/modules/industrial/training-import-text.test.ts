import { describe, expect, it } from "vitest";
import { decodeTextBuffer, repairUtf8Mojibake, sanitizeTrainingImportText } from "./training-import-text.js";

describe("decodeTextBuffer", () => {
  it("decodes UTF-8 with BOM", () => {
    const buffer = Buffer.from("\uFEFFQuestion,Answer", "utf8");
    expect(decodeTextBuffer(buffer)).toBe("Question,Answer");
  });

  it("decodes Windows-1252 CSV with smart punctuation", () => {
    const buffer = Buffer.from([...Buffer.from("What is LOTO", "ascii"), 0x97, ...Buffer.from("required?", "ascii")]);
    expect(decodeTextBuffer(buffer)).toContain("—");
    expect(decodeTextBuffer(buffer)).not.toContain("\uFFFD");
  });

  it("decodes legacy Windows-1252 en dash byte", () => {
    const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x96, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
    expect(decodeTextBuffer(buffer)).toBe("Hello–world");
  });
});

describe("repairUtf8Mojibake", () => {
  it("repairs double-encoded UTF-8 apostrophe", () => {
    const mojibake = "worker\u00E2\u20AC\u2122s harness";
    expect(repairUtf8Mojibake(mojibake)).toBe("worker\u2019s harness");
  });

  it("repairs literal mojibake sequences", () => {
    expect(repairUtf8Mojibake("workerâ€™s harness")).toBe("worker\u2019s harness");
  });
});

describe("sanitizeTrainingImportText", () => {
  it("repairs common mojibake apostrophe", () => {
    expect(sanitizeTrainingImportText("workerâ€™s harness")).toBe("worker's harness");
  });

  it("strips replacement characters from corrupted imports", () => {
    expect(sanitizeTrainingImportText("What is LOTO\uFFFDrequired?")).toBe("What is LOTOrequired?");
  });
});
