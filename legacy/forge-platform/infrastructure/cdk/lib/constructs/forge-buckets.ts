import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { PRODUCTION_PRE_CUTOVER_SPA_ORIGINS } from "../config/production-spa-origins.js";
import { uniqueBucketName } from "../utils/naming.js";

export interface ForgeBucketsProps {
  config: ForgeEnvironmentConfig;
  storageKey: kms.IKey;
}

/** Browser origins allowed to PUT/GET presigned objects (branding, imports, exports). */
function browserUploadCorsOrigins(config: ForgeEnvironmentConfig): string[] {
  const fromDomains = [
    config.domains?.rms,
    config.domains?.creator,
    config.domains?.tenantAdmin,
    config.domains?.industrial,
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) => (host.startsWith("http") ? host : `https://${host}`));

  const local = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
  ];

  if (config.environmentName.includes("production")) {
    return [
      ...new Set([
        ...fromDomains,
        ...PRODUCTION_PRE_CUTOVER_SPA_ORIGINS,
        // Tenant vanity hosts (e.g. producers-rice-mill.forgepublicsafety.com) upload
        // via presigned PUT from the browser — S3 CORS must allow the zone, not only
        // the canonical industrial.* hostname.
        "https://*.forgepublicsafety.com",
        "https://*.forgeindustrialsafety.com",
      ]),
    ];
  }
  return [...new Set([...fromDomains, ...local])];
}

function browserUploadCors(config: ForgeEnvironmentConfig): s3.CorsRule[] {
  return [
    {
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
      allowedOrigins: browserUploadCorsOrigins(config),
      allowedHeaders: ["*"],
      exposedHeaders: ["ETag", "x-amz-request-id", "x-amz-version-id"],
      maxAge: 3000,
    },
  ];
}

function enforceTls(bucket: s3.Bucket): void {
  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: "DenyInsecureTransport",
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ["s3:*"],
      resources: [bucket.bucketArn, bucket.arnForObjects("*")],
      conditions: {
        Bool: { "aws:SecureTransport": "false" },
      },
    }),
  );
}

export class ForgeBuckets extends Construct {
  readonly documents: s3.Bucket;
  readonly imports: s3.Bucket;
  readonly exports: s3.Bucket;
  readonly auditArchive: s3.Bucket;
  readonly applicationAssets: s3.Bucket;

  constructor(scope: Construct, id: string, props: ForgeBucketsProps) {
    super(scope, id);
    const { config, storageKey } = props;
    const isProd = config.environmentName.includes("production");

    const common: Partial<s3.BucketProps> = {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: storageKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    };

    const uploadCors = browserUploadCors(config);

    this.documents = new s3.Bucket(this, "Documents", {
      ...common,
      bucketName: uniqueBucketName(config, "documents"),
      cors: uploadCors,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) }],
    });

    this.imports = new s3.Bucket(this, "Imports", {
      ...common,
      bucketName: uniqueBucketName(config, "imports"),
      cors: uploadCors,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(config.retention.importFilesDays),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(3),
        },
      ],
    });

    this.exports = new s3.Bucket(this, "Exports", {
      ...common,
      bucketName: uniqueBucketName(config, "exports"),
      cors: uploadCors,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(config.retention.exportFilesDays),
        },
      ],
    });

    this.auditArchive = new s3.Bucket(this, "AuditArchive", {
      ...common,
      bucketName: uniqueBucketName(config, "audit"),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });
    cdk.Tags.of(this.auditArchive).add("DataClassification", "Confidential");

    this.applicationAssets = new s3.Bucket(this, "ApplicationAssets", {
      ...common,
      bucketName: uniqueBucketName(config, "app-assets"),
      versioned: false,
    });

    for (const bucket of [
      this.documents,
      this.imports,
      this.exports,
      this.auditArchive,
      this.applicationAssets,
    ]) {
      enforceTls(bucket);
    }
  }
}
