import { describe, expect, it } from "vitest";
import {
  SANITATION_MAX_QUESTION_PHOTOS,
  addSanitationResponsePhoto,
  mergeSanitationResponses,
  parseSanitationPhoto,
  removeSanitationResponsePhoto,
} from "./sanitation-responses.js";

const photo = (id: string) => ({
  id,
  fileName: `${id}.jpg`,
  contentType: "image/jpeg",
  dataUrl: "data:image/jpeg;base64,AAAA",
});

describe("mergeSanitationResponses", () => {
  const stored = {
    q1: { result: "FAIL", notes: "dust", photos: [photo("p1")] },
    q2: { result: "PASS" },
  };

  it("keeps stored photos when an answer is sent without them", () => {
    const merged = mergeSanitationResponses(stored, { q1: { result: "FAIL", notes: "more dust" } });
    expect(merged.q1).toEqual({ result: "FAIL", notes: "more dust", photos: [photo("p1")] });
  });

  it("keeps questions that were not sent and adds new ones", () => {
    const merged = mergeSanitationResponses(stored, { q3: { result: "NA" } });
    expect(Object.keys(merged).sort()).toEqual(["q1", "q2", "q3"]);
    expect(merged.q2).toEqual({ result: "PASS" });
  });

  it("uses the sent photos when the photos key is present", () => {
    const merged = mergeSanitationResponses(stored, { q1: { result: "FAIL", photos: [] } });
    expect(merged.q1).toEqual({ result: "FAIL", photos: [] });
  });
});

describe("photo add/remove", () => {
  it("adds a photo to a new or existing answer, ignoring repeats", () => {
    let r: Record<string, unknown> = {};
    r = addSanitationResponsePhoto(r, "q1", photo("p1"), { label: "Dust" });
    expect(r.q1).toEqual({ result: "", label: "Dust", photos: [photo("p1")] });
    const again = addSanitationResponsePhoto(r, "q1", photo("p1"));
    expect(again).toBe(r);
    r = addSanitationResponsePhoto(r, "q1", photo("p2"));
    expect((r.q1 as { photos: unknown[] }).photos).toHaveLength(2);
  });

  it("caps photos per question", () => {
    let r: Record<string, unknown> = {};
    for (let i = 0; i < SANITATION_MAX_QUESTION_PHOTOS; i++) {
      r = addSanitationResponsePhoto(r, "q1", photo(`p${i}`));
    }
    expect(() => addSanitationResponsePhoto(r, "q1", photo("extra"))).toThrow(/at most/);
  });

  it("removes a photo by id and leaves others", () => {
    const r = { q1: { result: "FAIL", photos: [photo("p1"), photo("p2")] } };
    const next = removeSanitationResponsePhoto(r, "q1", "p1");
    expect((next.q1 as { photos: unknown[] }).photos).toEqual([photo("p2")]);
    expect(removeSanitationResponsePhoto(r, "q1", "missing")).toBe(r);
  });

  it("rejects non-image uploads", () => {
    expect(() => parseSanitationPhoto({ id: "x", dataUrl: "data:text/html;base64,AA" })).toThrow();
    expect(parseSanitationPhoto(photo("p1")).id).toBe("p1");
  });
});
