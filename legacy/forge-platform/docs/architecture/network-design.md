# Network design

- CIDR (dev): `10.20.0.0/16`
- AZs: 2
- Subnets: public (ALB/NAT), private-with-egress (ECS), isolated (Aurora)
- NAT: **1 gateway** (dev cost control). Production should use one NAT per AZ.
- Gateway endpoint: S3
- Interface endpoints: deferred in development (cost); enable via `enableInterfaceEndpoints`
- VPC flow logs: CloudWatch, ~30 day retention
