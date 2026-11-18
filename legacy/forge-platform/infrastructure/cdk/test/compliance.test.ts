import { describe, expect, it } from "vitest";
import { buildArn, getPartitionConfiguration } from "../lib/utils/partition.js";
import { resourceName, uniqueBucketName } from "../lib/utils/naming.js";
import { validateEnvironmentConfig } from "../lib/config/environment-schema.js";
import { developmentConfig } from "../lib/config/development.js";
import { govcloudDevelopmentConfig } from "../lib/config/govcloud.js";
import { createMandatoryTags, REQUIRED_TAGS } from "../lib/aspects/tagging-aspect.js";

describe("partition utilities", () => {
  it("commercial partition uses arn:aws", () => {
    expect(getPartitionConfiguration("aws").arnPrefix).toBe("arn:aws");
    expect(
      buildArn({
        partition: "aws",
        service: "s3",
        region: "",
        account: "",
        resource: "bucket/name",
      }),
    ).toMatch(/^arn:aws:/);
  });

  it("GovCloud partition uses arn:aws-us-gov", () => {
    expect(getPartitionConfiguration("aws-us-gov").arnPrefix).toBe("arn:aws-us-gov");
  });

  it("rejects unsupported partition via config schema", () => {
    expect(() =>
      validateEnvironmentConfig({
        ...developmentConfig,
        partition: "aws-cn",
      }),
    ).toThrow();
  });

  it("GovCloud config does not hard-code commercial ARN assumptions in names", () => {
    const name = resourceName(govcloudDevelopmentConfig, "s3", "documents");
    expect(name).not.toContain("arn:aws");
    expect(name).toContain("govcloud");
  });
});

describe("naming", () => {
  it("includes environment and account in bucket names", () => {
    const name = uniqueBucketName(developmentConfig, "documents");
    expect(name).toContain("development");
    expect(name).toContain(developmentConfig.account);
    expect(name).toContain(developmentConfig.region);
  });
});

describe("mandatory tags", () => {
  it("includes all required tag keys", () => {
    const tags = createMandatoryTags("development");
    for (const key of REQUIRED_TAGS) {
      expect(tags[key]).toBeTruthy();
    }
  });
});
