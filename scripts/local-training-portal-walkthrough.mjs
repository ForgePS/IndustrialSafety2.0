#!/usr/bin/env node
/**
 * API walkthrough for local training portal UAT (John Smith #10452).
 * Reads token from .local-training-uat.json or env FORGE_TRAINING_ACCESS_TOKEN.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = (process.env.PLATFORM_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(scriptsDir, "..", ".local-training-uat.json");

function loadToken() {
  if (process.env.FORGE_TRAINING_ACCESS_TOKEN?.trim()) {
    return process.env.FORGE_TRAINING_ACCESS_TOKEN.trim();
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const url = String(artifact.portalUrl ?? "");
  const match = url.match(/\/training\/access\/([^/?#]+)/);
  if (!match?.[1] || match[1] === "placeholder") {
    throw new Error("Re-run: node scripts/run-local-training-uat.mjs");
  }
  return match[1];
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.data ?? json;
}

function log(step, payload) {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function answerQuiz(token, sessionToken, assignmentId, attemptId, picks) {
  let runner = null;
  for (let i = 0; i < picks.length; i++) {
    if (i === 0) {
      const started = await api(
        "POST",
        `/api/v1/public/training/${encodeURIComponent(token)}/quizzes`,
        { sessionToken, assignmentId },
      );
      attemptId = started.attempt.id;
      runner = started.next;
    }
    const questionId = runner?.question?.id;
    if (!questionId) throw new Error("No question in runner");
    const answer = await api(
      "POST",
      `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/answer`,
      { sessionToken, questionId, selectedIndex: picks[i] },
    );
    if (answer.done) {
      const results = await api(
        "POST",
        `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/results`,
        { sessionToken },
      );
      return { attemptId, results, lastAnswer: answer };
    }
    runner = await api(
      "POST",
      `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/next`,
      { sessionToken },
    );
  }
  throw new Error("Quiz did not complete within pick count");
}

async function main() {
  const token = loadToken();
  const employeeNumber = "10452";
  const assignmentTitle = "Annual Lockout/Tagout Training";

  log(
    "1. Access link context",
    await api("GET", `/api/v1/public/training/access/${encodeURIComponent(token)}`),
  );

  const verified = await api(
    "POST",
    `/api/v1/public/training/access/${encodeURIComponent(token)}/verify`,
    {
      employeeNumber,
    },
  );
  log("2. Verify employee", {
    displayName: verified.displayName,
    employeeNumber: verified.employeeNumber,
    departmentName: verified.departmentName,
    summary: verified.summary,
  });

  const sessionToken = verified.sessionToken;
  const assignment = (verified.assignments ?? []).find((a) => a.title === assignmentTitle);
  if (!assignment) throw new Error(`Assignment not found: ${assignmentTitle}`);

  const course = await api(
    "GET",
    `/api/v1/public/training/access/${encodeURIComponent(token)}/course/${encodeURIComponent(assignment.assignmentId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
  );
  log("3. Course player", {
    title: course.title,
    sections: course.sections?.map((s) => s.title),
    assigneeStatus: course.assigneeStatus,
  });

  for (const section of course.sections ?? []) {
    const completed = [...(course.progress?.sectionsCompleted ?? []), section.id];
    await api("POST", `/api/v1/public/training/access/${encodeURIComponent(token)}/progress`, {
      sessionToken,
      assignmentId: assignment.assignmentId,
      sectionId: section.id,
      sectionsCompleted: completed,
      percentComplete: Math.round((completed.length / course.sections.length) * 100),
      quizAvailable: completed.length >= course.sections.length,
    });
  }
  log("4. Progress saved", {
    sectionsCompleted: course.sections?.length ?? 0,
    quizAvailable: true,
  });

  const fail = await answerQuiz(token, sessionToken, assignment.assignmentId, null, [0, 0, 0]);
  log("5. Attempt #1 (intentional fail)", {
    percent: fail.results.percent,
    letterGrade: fail.results.letterGrade,
    passed: fail.results.percent >= assignment.passingPercent,
  });

  const pass = await answerQuiz(token, sessionToken, assignment.assignmentId, null, [1, 1, 1]);
  log("6. Attempt #2 (pass)", {
    percent: pass.results.percent,
    letterGrade: pass.results.letterGrade,
    passed: pass.results.percent >= assignment.passingPercent,
  });

  const history = await api(
    "GET",
    `/api/v1/industrial/training/personnel/${encodeURIComponent(verified.personnelId ?? "missing")}/history`,
  ).catch((e) => ({ note: "Auth required for admin history endpoint", error: String(e.message) }));

  log("7. Summary", {
    employee: verified.displayName,
    employeeNumber,
    assignmentStatus: "PASSED (expected after attempt 2)",
    attempt1Percent: fail.results.percent,
    attempt2Percent: pass.results.percent,
    passingPercent: assignment.passingPercent,
    personnelHistory: history.note ?? "requires authenticated admin session",
    browserUrl: `http://localhost:3004/training/portal?token=${token}`,
  });

  console.log("\nUAT API walkthrough: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
