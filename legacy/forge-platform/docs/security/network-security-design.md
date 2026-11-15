# Network security design

- ALB SG: 80/443 from internet
- ECS API SG: port 4000 from ALB only
- Worker SG: no public ingress
- Database SG: 5432 from API, worker, migration SGs only
- No `0.0.0.0/0` to PostgreSQL
- Temporary HTTP on ALB until ACM/DNS (documented limitation)
