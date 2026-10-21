#!/usr/bin/env node
/**
 * Patch production Industrial CloudFront viewer-request function for
 * /my-training/assignments/{assignmentId} static-export shell routing.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const FUNCTION_NAME = "forge-production-cffn-industrial-idx";
const CODE_PATH = ".forge-cf-industrial-idx-live.js";
const PATCHED_PATH = ".forge-cf-industrial-idx-my-training.js";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const DESIRED_SNIPPET = `  var myTrainingAssignmentMatch = uri.match(/^\\/my-training\\/assignments\\/([^/]+)\\/?$/);
  if (myTrainingAssignmentMatch) {
    var assignmentSegment = myTrainingAssignmentMatch[1];
    if (assignmentSegment !== 'placeholder') {
      request.uri = '/my-training/assignments/placeholder/index.html';
      return request;
    }
  }`;

function main() {
  const meta = JSON.parse(
    sh(`aws cloudfront describe-function --name ${FUNCTION_NAME} --stage LIVE --output json`),
  );
  const etag = meta.ETag;

  sh(`aws cloudfront get-function --name ${FUNCTION_NAME} --stage LIVE ${CODE_PATH}`);
  let source = fs.readFileSync(CODE_PATH, "utf8");

  if (source.includes("myTrainingAssignmentMatch")) {
    console.log("CloudFront function already includes my-training/assignments rewrite.");
    return;
  }

  const marker = "  if (uri.endsWith('/')) {";
  const insertAfter = source.lastIndexOf(marker);
  if (insertAfter === -1) {
    throw new Error("Could not find insertion point in CloudFront function.");
  }
  source = `${source.slice(0, insertAfter)}${DESIRED_SNIPPET}\n${source.slice(insertAfter)}`;
  fs.writeFileSync(PATCHED_PATH, source, "utf8");

  const update = JSON.parse(
    sh(
      `aws cloudfront update-function --name ${FUNCTION_NAME} --if-match ${etag} --function-config Comment="Rewrite directory URIs to index.html for Industrial",Runtime=cloudfront-js-2.0 --function-code fileb://${PATCHED_PATH} --output json`,
    ),
  );

  const publish = JSON.parse(
    sh(
      `aws cloudfront publish-function --name ${FUNCTION_NAME} --if-match ${update.ETag} --output json`,
    ),
  );

  console.log(JSON.stringify({ ok: true, functionName: FUNCTION_NAME, etag: publish.ETag }, null, 2));
}

main();
