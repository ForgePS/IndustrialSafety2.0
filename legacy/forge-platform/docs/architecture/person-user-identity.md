# Person, User, and Authentication Identity

**Sprint:** 1D  
**Related ADR:** [ADR-013](../decisions/ADR-013-person-user-auth-identity.md)

## Separation of concerns

Three distinct concepts — never collapsed into one table ([ADR-013](../decisions/ADR-013-person-user-auth-identity.md)):

| Concept                     | Meaning                                             | Exists without login?  |
| --------------------------- | --------------------------------------------------- | ---------------------- |
| **Person**                  | Real-world individual in domain data                | Yes                    |
| **User**                    | Tenant-scoped product principal (roles, membership) | No — requires a Person |
| **Authentication Identity** | External IdP subject (Cognito/OIDC) bound to a User | N/A — attaches to User |

```
Person 1──* User 1──* AuthenticationIdentity
              │
              └──* UserRoleAssignment / UserTenantAccess
```

## Person registry (foundation)

Tenant-scoped APIs under `api/v1/tenants/:tenantId/persons`:

- CRUD + archive
- Merge + duplicate candidates
- Identifiers, contacts, addresses (schema)
- Sensitive identifiers via separate encrypted store ([ADR-018](../decisions/ADR-018-sensitive-data-encryption.md))

Person may exist for HR/workforce records with no User account.

## Users and invitations

Under `api/v1/tenants/:tenantId/users` and `api/v1/auth/invitations/accept`:

- Invite → accept → activate lifecycle
- Enable / disable without deleting Person history
- Tenant access and role assignments are User-scoped

Offboarding: disable User and/or unlink Authentication Identity; retain Person for historical integrity.

## Auth resolution

`AuthContextService` resolves a request into `ForgePrincipal` (`@forge/tenant-context`):

- `authenticationIdentityId`, `userId`, `personId`
- `tenantId`, `organizationIds`
- `permissions`, `activeProducts`, `activeModules`
- `isPlatformAdmin`, correlation/request ids

`GET /api/v1/auth/me` returns the current principal summary for clients.

## Organizations

Organizations are tenant-scoped entities (`api/v1/tenants/:tenantId/organizations`) with typed catalog (`organization_types` seed). Memberships link Users/Persons into org hierarchies for future org-scoped authorization.

## Design consequences

- SSO rebinding updates Authentication Identity, not Person rows.
- Multiple tenant memberships are modeled via User + `user_tenant_access`, not duplicate Person masters per product.
- Sensitive PII stays off the main Person DTO paths (see [sensitive-data.md](../security/sensitive-data.md)).
