# IAM design (Sprint 1C)

Separate task roles:

- API execution + API task
- Worker execution + Worker task
- Migration task (DB secret read)

Least-privilege grants for S3/SQS/Secrets. No shared mega-role.
