import type { AwsPartition } from "./types.js";

export interface AwsPartitionConfiguration {
  partition: AwsPartition;
  dnsSuffix: string;
  arnPrefix: string;
}

export function getPartitionConfiguration(partition: AwsPartition): AwsPartitionConfiguration {
  if (partition === "aws-us-gov") {
    return {
      partition: "aws-us-gov",
      dnsSuffix: "amazonaws.com",
      arnPrefix: "arn:aws-us-gov",
    };
  }
  return {
    partition: "aws",
    dnsSuffix: "amazonaws.com",
    arnPrefix: "arn:aws",
  };
}

export function buildArn(parts: {
  partition: AwsPartition;
  service: string;
  region: string;
  account: string;
  resource: string;
}): string {
  const { arnPrefix } = getPartitionConfiguration(parts.partition);
  return `${arnPrefix}:${parts.service}:${parts.region}:${parts.account}:${parts.resource}`;
}
