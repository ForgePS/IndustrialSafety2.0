import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";

export interface ForgeEdgeTlsProps {
  config: ForgeEnvironmentConfig;
  alb: elbv2.IApplicationLoadBalancer;
  apiTargetGroup: elbv2.IApplicationTargetGroup;
}

/**
 * Optional HTTPS edge for the API ALB (ADR-025).
 *
 * When `edge.enableHttps` is false this construct is a no-op so development
 * can remain on HTTP until DNS is delegated. When enabled it resolves or
 * creates an ACM certificate, attaches a TLS listener on 443, and keeps HTTP:80
 * forwarding to the target group so CloudFront→ALB (HTTP_ONLY) still works before
 * external DNS cutover. SPA CloudFront edges still use ViewerProtocolPolicy.REDIRECT_TO_HTTPS.
 */
export class ForgeEdgeTls extends Construct {
  readonly certificate?: acm.ICertificate;
  readonly httpsListener?: elbv2.ApplicationListener;
  readonly httpListener?: elbv2.ApplicationListener;
  readonly enabled: boolean;

  constructor(scope: Construct, id: string, props: ForgeEdgeTlsProps) {
    super(scope, id);
    const edge = props.config.edge;
    this.enabled = edge.enableHttps;
    if (!edge.enableHttps) {
      return;
    }

    if (edge.certificateArn) {
      this.certificate = acm.Certificate.fromCertificateArn(
        this,
        "ImportedCertificate",
        edge.certificateArn,
      );
    } else if (edge.hostedZoneId && edge.apiHostname) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId: edge.hostedZoneId,
        zoneName: parentZoneName(edge.apiHostname),
      });
      this.certificate = new acm.Certificate(this, "ApiCertificate", {
        domainName: edge.apiHostname,
        validation: acm.CertificateValidation.fromDns(zone),
      });
      new route53.ARecord(this, "ApiAlias", {
        zone,
        recordName: edge.apiHostname,
        target: route53.RecordTarget.fromAlias(new route53_targets.LoadBalancerTarget(props.alb)),
      });
    } else {
      throw new Error("edge.enableHttps requires certificateArn or hostedZoneId with apiHostname");
    }

    this.httpsListener = props.alb.addListener("Https", {
      port: 443,
      open: true,
      certificates: [this.certificate],
      defaultTargetGroups: [props.apiTargetGroup],
      sslPolicy: elbv2.SslPolicy.TLS13_RES,
    });

    // Keep HTTP forward for CloudFront OriginProtocolPolicy.HTTP_ONLY until
    // external DNS cutover allows an HTTPS origin (or Host-based redirect rules).
    // A blanket HTTP→HTTPS redirect would 301 the CF→ALB hop and break the API.
    this.httpListener = props.alb.addListener("HttpForward", {
      port: 80,
      open: true,
      defaultTargetGroups: [props.apiTargetGroup],
    });
  }
}

function parentZoneName(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length < 2) {
    return hostname;
  }
  return parts.slice(1).join(".");
}
