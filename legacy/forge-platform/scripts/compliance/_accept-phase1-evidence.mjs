import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const today = "2026-07-26";
const reviewer = "Jeremy Powell";

function walk(dir, files = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith(".json") && !e.name.includes("evidence-index")) files.push(p);
  }
  return files;
}

const root = join("docs", "compliance", "soc2", "evidence");
for (const f of walk(root)) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (j.meta) {
    j.meta.review_status = "ACCEPTED";
    j.meta.reviewed_by = reviewer;
    j.meta.reviewed_at = today;
    writeFileSync(f, `${JSON.stringify(j, null, 2)}\n`);
  }
  const md = f.replace(/\.json$/, ".md");
  try {
    let t = readFileSync(md, "utf8");
    t = t.replace(
      /\| Review status \| GENERATED \(not ACCEPTED\) \|/,
      "| Review status | ACCEPTED |",
    );
    t = t.replace(/\| Review status \| GENERATED \|/, "| Review status | ACCEPTED |");
    if (!t.includes("| Reviewed by |")) {
      t = t.replace(
        /\| Integrity SHA-256 \|/,
        `| Reviewed by | ${reviewer} |\n| Reviewed at | ${today} |\n| Integrity SHA-256 |`,
      );
    }
    writeFileSync(md, t);
  } catch {
    // no md sidecar
  }
}

const indexPath = join(root, "evidence-index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
index.review_note = `Accepted by ${reviewer} on ${today} (Phase 1 closeout)`;
index.accepted_at = today;
index.accepted_by = reviewer;
for (const r of index.records) {
  r.review_status = "ACCEPTED";
  r.reviewed_by = reviewer;
  r.reviewed_at = today;
}
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

const mdLines = [
  "# Evidence index",
  "",
  `Generated: ${index.generated_at}`,
  `Accepted by: ${reviewer} on ${today}`,
  "",
  "| Evidence ID | Control | Title | Status | Location |",
  "| --- | --- | --- | --- | --- |",
  ...index.records.map(
    (r) =>
      `| ${r.evidence_id} | ${r.control_id || ""} | ${r.title} | ${r.review_status} | \`${r.storage_location}\` |`,
  ),
  "",
];
writeFileSync(join(root, "evidence-index.md"), mdLines.join("\n"));
console.log("evidence accepted", index.records.length);
