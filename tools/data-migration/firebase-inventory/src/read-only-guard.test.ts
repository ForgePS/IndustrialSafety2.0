import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Patterns that indicate Firestore/customer-data writes (not Set/Map methods). */
const FORBIDDEN_PATTERNS = [
  /writeBatch\s*\(/,
  /collection\([^)]*\)\s*\.\s*add\s*\(/,
  /\.doc\([^)]*\)\s*\.\s*set\s*\(/,
  /\.doc\([^)]*\)\s*\.\s*update\s*\(/,
  /\.doc\([^)]*\)\s*\.\s*delete\s*\(/,
  /FieldValue\.delete\s*\(/,
  /getFirestore\(\)[\s\S]{0,80}\.set\s*\(/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".test.ts")) continue;
    // Third-party dependencies are not inventory sources; crawling them made this test time out.
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("READ_ONLY_GUARD", () => {
  it("forbids Firestore write APIs in inventory sources", () => {
    const files = walk(srcDir);
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          violations.push(`${path.relative(srcDir, file)} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
