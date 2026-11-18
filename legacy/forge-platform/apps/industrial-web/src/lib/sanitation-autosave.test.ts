import { describe, expect, it } from "vitest";
import {
  sanitationAutosaveLabel,
  stripResponsePhotos,
  unansweredSanitationQuestions,
} from "./sanitation-module";

describe("stripResponsePhotos", () => {
  it("drops photos from every answer and keeps the rest", () => {
    const out = stripResponsePhotos({
      q1: {
        result: "FAIL",
        notes: "dust",
        photos: [{ id: "p1", dataUrl: "data:image/jpeg;base64,AA" }],
      },
      q2: { result: "PASS" },
    });
    expect(out).toEqual({ q1: { result: "FAIL", notes: "dust" }, q2: { result: "PASS" } });
    expect(JSON.stringify(out)).not.toContain("data:image");
  });
});

describe("sanitationAutosaveLabel", () => {
  it("describes each save state", () => {
    expect(sanitationAutosaveLabel({ state: "idle" }, 0)).toBe("");
    expect(sanitationAutosaveLabel({ state: "saving" }, 0)).toBe("Saving…");
    expect(sanitationAutosaveLabel({ state: "error" }, 2)).toBe(
      "Not saved yet. Retrying… · 2 photos waiting to upload",
    );
    expect(sanitationAutosaveLabel({ state: "offline" }, 0)).toBe("Offline. Saved on this device");
    expect(sanitationAutosaveLabel({ state: "idle" }, 1)).toBe("1 photo waiting to upload");
    expect(sanitationAutosaveLabel({ state: "saved" }, 0)).toBe("All changes saved");
  });
});

describe("unansweredSanitationQuestions", () => {
  it("lists questions without Yes, No or N/A, in order", () => {
    const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }];
    const out = unansweredSanitationQuestions(questions, {
      q1: { result: "PASS" },
      q2: { result: "" },
      q4: { result: "na" },
    });
    expect(out.map((q) => q.id)).toEqual(["q2", "q3"]);
  });
});
