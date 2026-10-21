#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const POLICY = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "EmergencyAlertSmsSend",
      Effect: "Allow",
      Action: ["sms-voice:SendTextMessage"],
      Resource: ["*"],
    },
  ],
};

const path = ".forge-ea-sms-iam.json";
fs.writeFileSync(path, JSON.stringify(POLICY));

const roles = ["forge-development-iam-api-task", "forge-production-iam-api-task"];
for (const role of roles) {
  execFileSync(
    "aws",
    [
      "iam",
      "put-role-policy",
      "--role-name",
      role,
      "--policy-name",
      "EmergencyAlertSmsSend",
      "--policy-document",
      `file://${path}`,
    ],
    { stdio: "inherit" },
  );
  const listed = execFileSync(
    "aws",
    ["iam", "list-role-policies", "--role-name", role, "--output", "json"],
    { encoding: "utf8" },
  );
  console.log(role, listed.trim());
}

const regs = execFileSync(
  "aws",
  [
    "pinpoint-sms-voice-v2",
    "describe-registrations",
    "--region",
    "us-east-1",
    "--output",
    "json",
  ],
  { encoding: "utf8" },
);
const phones = execFileSync(
  "aws",
  [
    "pinpoint-sms-voice-v2",
    "describe-phone-numbers",
    "--region",
    "us-east-1",
    "--output",
    "json",
  ],
  { encoding: "utf8" },
);
console.log("registrations", regs.trim());
console.log("phoneNumbers", phones.trim());
