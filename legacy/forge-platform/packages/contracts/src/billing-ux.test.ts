import { describe, expect, it } from "vitest";
import {
  createBillingContractInputSchema,
  patchBillingContractInputSchema,
} from "./billing-domain.js";

describe("billing UX contracts schemas", () => {
  it("accepts pricing override and module pricing on create", () => {
    const parsed = createBillingContractInputSchema.parse({
      name: "Acme Enterprise",
      pricingJson: {
        overrideAmountCents: 9900,
        modules: [{ moduleCode: "LOTO", amountCents: 1500 }],
      },
    });
    expect(parsed.pricingJson?.overrideAmountCents).toBe(9900);
    expect(parsed.pricingJson?.modules?.[0]?.moduleCode).toBe("LOTO");
  });

  it("allows partial contract patch", () => {
    const parsed = patchBillingContractInputSchema.parse({
      renewalOn: "2027-01-01",
      notes: "Renewed",
    });
    expect(parsed.renewalOn).toBe("2027-01-01");
    expect(parsed.notes).toBe("Renewed");
  });
});
