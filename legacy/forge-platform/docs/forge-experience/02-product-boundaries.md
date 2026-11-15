# FX Product Boundaries

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED

## Ownership rule

Forge Experience owns shared experience.  
Products own domain logic.

Nothing inside a product should recreate functionality already owned by Forge Experience.

## Forge Experience owns

- Design system
- Component library
- Navigation framework
- Dashboard framework
- Workspace framework
- My Work framework
- Search framework
- Reporting framework
- Notification framework
- Timeline framework
- Record framework
- Forms framework
- Mobile framework
- Tablet framework
- Offline UX
- Accessibility
- Branding
- User experience standards
- Application shell
- Theme engine
- Cross-product interaction patterns

## Forge Experience does not own

| Area                       | Owner                                |
| -------------------------- | ------------------------------------ |
| Business rules             | Product                              |
| Database design            | Platform / product data owners       |
| Cloud infrastructure       | Platform                             |
| Authentication             | Platform                             |
| Permissions                | Platform / product policy            |
| Tenant logic               | Platform                             |
| Backend APIs               | Platform / product services          |
| Industry regulations       | Product + compliance                 |
| Operational policies       | Customer / product configuration     |
| Product-specific workflows | Product (using FX workflow patterns) |

## Product extension model

```text
Forge Experience
└── Product Extensions
        ├── Forge RMS
        ├── Forge Academy
        └── Forge Industrial Safety
```

### Allowed product contributions

- Domain record types (Personnel, Student, Occupancy, Inspection, Incident, Hydrant, Apparatus, Equipment, LOTO Procedure, Permit, …)
- Domain dashboards composed from FX dashboard primitives
- Domain workspace layouts using FX workspace framework
- Domain terminology layered on FX components
- Product-specific empty states, help content, and guided tasks that still use FX patterns

### Forbidden product behaviors

- Forking a parallel component library
- Inventing alternate navigation metaphors for the same roles
- Building form engines that bypass the FX forms framework
- Creating one-off record shells that ignore the FX record framework
- Shipping inaccessible custom controls when an FX equivalent exists

## Boundary disputes

When a capability is shared by two or more products, default ownership is **FX**.  
When a capability encodes a single product’s regulations or business rules, ownership remains **product**, expressed through FX extension points.
