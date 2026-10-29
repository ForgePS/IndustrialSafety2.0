import { Inject, Injectable } from "@nestjs/common";
import {
  nerisFieldConditions,
  nerisFields,
  nerisModules,
  tenantNerisFieldOverlays,
  tenantNerisValueOverlays,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import {
  evaluateSpecialtyWorkflows,
  mapModuleToSpecialtySection,
  type EvaluatedSpecialtyWorkflowGroup,
} from "@forge/neris";
import { asc, eq } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { NerisConditionEngine } from "../neris/neris-condition-engine.service.js";
import { NerisConfigurationOverlayService } from "../neris/neris-configuration-overlay.service.js";
import { NerisSchemaRegistryService } from "../neris/neris-schema-registry.service.js";

export const DEFAULT_INCIDENT_SECTIONS = [
  "OVERVIEW",
  "DISPATCH",
  "LOCATION",
  "UNITS_PERSONNEL",
  "CLASSIFICATION",
  "NARRATIVE",
  "ATTACHMENTS",
  "REVIEW",
] as const;

export type FormDescriptorComposeInput = {
  schemaVersionId?: string;
  /** Flat fieldKey → value for live condition + specialty evaluation. */
  fieldValuesByKey?: Record<string, unknown>;
  classificationSignals?: string[];
  notApplicableSectionKeys?: string[];
  forcedActiveSectionKeys?: string[];
  specialtyWorkflowsEnabled?: boolean;
};

@Injectable()
export class IncidentFormDescriptorService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly registry: NerisSchemaRegistryService,
    private readonly conditions: NerisConditionEngine,
    private readonly configuration: NerisConfigurationOverlayService,
  ) {}

  async compose(tenantId: string, input: FormDescriptorComposeInput = {}) {
    const published = input.schemaVersionId
      ? { id: input.schemaVersionId }
      : await this.registry.getPublishedVersion();
    if (!published) {
      return {
        schemaVersionId: null,
        operatingMode: "MANUAL_ONLY",
        sections: [...DEFAULT_INCIDENT_SECTIONS],
        navigationSections: [...DEFAULT_INCIDENT_SECTIONS],
        specialtyWorkflows: [] as EvaluatedSpecialtyWorkflowGroup[],
        modules: [],
      };
    }

    const versionId = published.id;
    const config = await this.configuration.getConfiguration(tenantId);
    const effectiveVersionId = config?.schemaVersionId ?? versionId;

    const modules = await this.db
      .select()
      .from(nerisModules)
      .where(eq(nerisModules.schemaVersionId, effectiveVersionId))
      .orderBy(asc(nerisModules.ordinal));

    const fields = await this.db
      .select()
      .from(nerisFields)
      .where(eq(nerisFields.schemaVersionId, effectiveVersionId))
      .orderBy(asc(nerisFields.ordinal));

    const fieldOverlays = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(tenantNerisFieldOverlays)
        .where(eq(tenantNerisFieldOverlays.tenantId, tenantId)),
    );
    const valueOverlays = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(tenantNerisValueOverlays)
        .where(eq(tenantNerisValueOverlays.tenantId, tenantId)),
    );

    const conditionRows = await this.db
      .select({
        fieldId: nerisFieldConditions.fieldId,
        ruleJson: nerisFieldConditions.ruleJson,
      })
      .from(nerisFieldConditions)
      .innerJoin(nerisFields, eq(nerisFieldConditions.fieldId, nerisFields.id))
      .where(eq(nerisFields.schemaVersionId, effectiveVersionId));

    const overlayByField = new Map(fieldOverlays.map((o) => [o.fieldId, o]));
    const overlayByValue = new Map(valueOverlays.map((o) => [o.valueOptionId, o]));
    const conditionByField = new Map(conditionRows.map((r) => [r.fieldId, r.ruleJson]));

    const fieldValuesByKey = input.fieldValuesByKey ?? {};
    // Condition engine expects a flat field → value context.
    const context = fieldValuesByKey as Record<string, never>;

    const specialty = evaluateSpecialtyWorkflows({
      availableModuleKeys: modules.map((m) => m.moduleKey),
      classificationSignals: input.classificationSignals ?? [],
      fieldValuesByKey,
      notApplicableSectionKeys: input.notApplicableSectionKeys ?? [],
      forcedActiveSectionKeys: input.forcedActiveSectionKeys ?? [],
      specialtyWorkflowsEnabled: input.specialtyWorkflowsEnabled ?? false,
    });

    const activeSpecialtyKeys = new Set(
      specialty.groups
        .filter(
          (g) => g.state === "REQUIRED" || g.state === "ACTIVE" || g.state === "NOT_APPLICABLE",
        )
        .map((g) => g.sectionKey),
    );

    const moduleDescriptors = modules.map((mod) => {
      const specialtySection = mapModuleToSpecialtySection(mod.moduleKey);
      const sectionKey = specialtySection ?? this.mapModuleToCoreSection(mod.moduleKey);
      const specialtyGroup = specialty.groups.find((g) => g.sectionKey === specialtySection);
      // Specialty modules render only when their workflow group is activated.
      const moduleVisible = !specialtySection || activeSpecialtyKeys.has(specialtySection);

      return {
        moduleKey: mod.moduleKey,
        name: mod.name,
        area: mod.area,
        sectionKey,
        specialtyGroupId: specialtyGroup?.id ?? null,
        visible: moduleVisible,
        fields: fields
          .filter((f) => f.moduleId === mod.id)
          .map((field) => {
            const overlay = overlayByField.get(field.id);
            const rule = conditionByField.get(field.id);
            const visible = this.conditions.isVisible(rule as never, context);
            return {
              fieldId: field.id,
              fieldKey: field.fieldKey,
              definition: field.definition,
              dataType: field.dataType,
              required: field.officialRequired,
              displayLabel: overlay?.displayLabel ?? field.definition,
              helpText: overlay?.helpText,
              localAlias: overlay?.localAlias,
              displayOrder: overlay?.displayOrder ?? field.ordinal,
              visible,
              valueSetLocation: field.valueSetLocation,
              valueOverlays: field.valueSetLocation ? [...overlayByValue.values()] : [],
            };
          })
          .filter((f) => f.visible),
      };
    });

    const visibleModules = moduleDescriptors.filter((m) => m.visible);
    const specialtyWithCompletion = specialty.groups.map((group) => {
      const sectionFields = visibleModules
        .filter((m) => m.sectionKey === group.sectionKey)
        .flatMap((m) => m.fields);
      const requiredFields = sectionFields.filter((f) => f.required);
      const filledRequired = requiredFields.filter((f) => {
        const value = fieldValuesByKey[f.fieldKey];
        return value !== null && value !== undefined && value !== "";
      });
      const filledAny = sectionFields.filter((f) => {
        const value = fieldValuesByKey[f.fieldKey];
        return value !== null && value !== undefined && value !== "";
      });
      const completionPercent =
        sectionFields.length === 0
          ? 0
          : Math.round((filledAny.length / sectionFields.length) * 100);
      return {
        ...group,
        fieldCount: sectionFields.length,
        requiredFieldCount: requiredFields.length,
        filledRequiredFieldCount: filledRequired.length,
        completionPercent,
        hasBlockingGaps:
          requiredFields.length > filledRequired.length && group.state === "REQUIRED",
      };
    });

    return {
      schemaVersionId: effectiveVersionId,
      operatingMode: config?.operatingMode ?? "MANUAL_ONLY",
      sections: specialty.navigationSectionKeys,
      navigationSections: specialty.navigationSectionKeys,
      specialtyWorkflows: specialtyWithCompletion,
      availableSpecialtySections: specialty.groups
        .filter((g) => g.state === "OPTIONAL")
        .map((g) => ({
          sectionKey: g.sectionKey,
          label: g.label,
          summary: g.plainLanguageSummary,
        })),
      modules: visibleModules,
    };
  }

  async buildSchemaSnapshot(schemaVersionId: string) {
    const modules = await this.registry.listModules({ schemaVersionId, pageSize: 500 });
    const fields = await this.registry.listFields({ schemaVersionId, pageSize: 5000 });
    return {
      schemaVersionId,
      modules: modules.items,
      fields: fields.items,
      capturedAt: new Date().toISOString(),
    };
  }

  async buildConfigurationSnapshot(tenantId: string) {
    const config = await this.configuration.getConfiguration(tenantId);
    const fieldOverlays = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(tenantNerisFieldOverlays)
        .where(eq(tenantNerisFieldOverlays.tenantId, tenantId)),
    );
    const valueOverlays = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(tenantNerisValueOverlays)
        .where(eq(tenantNerisValueOverlays.tenantId, tenantId)),
    );
    return {
      configuration: config,
      fieldOverlays,
      valueOverlays,
      capturedAt: new Date().toISOString(),
    };
  }

  private mapModuleToCoreSection(moduleKey: string): string {
    const key = moduleKey.toUpperCase();
    if (key.includes("DISPATCH")) return "DISPATCH";
    if (key.includes("LOCATION") || key.includes("ADDRESS") || key.includes("PARCEL")) {
      return "LOCATION";
    }
    if (key.includes("UNIT") || key.includes("PERSONNEL") || key.includes("CREW")) {
      return "UNITS_PERSONNEL";
    }
    if (key.includes("CLASS") || key.includes("TYPE") || key === "MOD_INCIDENT") {
      return "CLASSIFICATION";
    }
    if (key.includes("NARRATIVE")) return "NARRATIVE";
    if (key.includes("REVIEW")) return "REVIEW";
    if (key.includes("WEATHER")) return "DISPATCH";
    // Unmapped non-specialty modules stay off the dump bucket — attach to classification.
    return "CLASSIFICATION";
  }
}
