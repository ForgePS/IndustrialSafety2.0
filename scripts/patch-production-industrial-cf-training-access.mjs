#!/usr/bin/env node
/**
 * Patch production Industrial CloudFront viewer-request function for
 * /training/access/{token} static-export shell routing.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const REGION = "us-east-1";
const FUNCTION_NAME = "forge-production-cffn-industrial-idx";
const ETAG_PATH = ".forge-cf-industrial-idx-etag.json";
const CODE_PATH = ".forge-cf-industrial-idx-live.js";
const PATCHED_PATH = ".forge-cf-industrial-idx-patched.js";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const DESIRED_SNIPPET = `  var trainingAccessMatch = uri.match(/^\\/training\\/access\\/([^/]+)\\/?$/);
  if (trainingAccessMatch) {
    var accessSegment = trainingAccessMatch[1];
    if (accessSegment !== 'placeholder') {
      request.uri = '/training/access/placeholder/index.html';
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

  if (source.includes("trainingAccessMatch")) {
    console.log("CloudFront function already includes training/access rewrite.");
    return;
  }

  if (!source.includes("var trainingMatch = uri.match")) {
    throw new Error("Unexpected CloudFront function shape — manual patch required.");
  }

  source = source.replace(
    /if \(trainingSegment !== 'placeholder'\)/,
    "if (trainingSegment !== 'placeholder' && trainingSegment !== 'portal' && trainingSegment !== 'access')",
  );

  const insertAfter = source.indexOf("  }\n  if (uri.endsWith('/')) {");
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

  fs.writeFileSync(
    ETAG_PATH,
    JSON.stringify({ functionName: FUNCTION_NAME, etag: publish.ETag, updatedAt: new Date().toISOString() }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, functionName: FUNCTION_NAME, etag: publish.ETag }, null, 2));
}

main();
