# Encryption design

| Key            | Purpose                                      |
| -------------- | -------------------------------------------- |
| general        | Default platform encryption                  |
| sensitive-data | SSN/FEMA-class data — **must stay separate** |
| storage        | S3 CMK                                       |
| logs           | CloudWatch log groups                        |
| backup         | AWS Backup vault                             |

Rotation enabled. Keys retain on destroy unless explicitly approved for cleanup.
