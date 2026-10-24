import { beforeEach, describe, expect, it } from "vitest";
import { clearFormRegistryForTests, getForm, listForms, registerForm } from "./FxFormRegistry";
import { RMS_FX_FORMS_FLAG } from "./forms-flags";

describe("FxFormRegistry", () => {
  beforeEach(() => clearFormRegistryForTests());

  it("registers forms", () => {
    registerForm({
      id: "demo",
      title: "Demo",
      featureFlag: RMS_FX_FORMS_FLAG,
    });
    expect(listForms()).toHaveLength(1);
    expect(getForm("demo")?.title).toBe("Demo");
  });

  it("rejects duplicates", () => {
    registerForm({ id: "demo", title: "Demo", featureFlag: RMS_FX_FORMS_FLAG });
    expect(() =>
      registerForm({ id: "demo", title: "Demo", featureFlag: RMS_FX_FORMS_FLAG }),
    ).toThrow(/already registered/);
  });
});
