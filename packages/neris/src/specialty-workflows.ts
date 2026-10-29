/**
 * NERIS Phase 3 specialty workflow engine.
 *
 * Declares user-facing workflow groups and maps official NERIS modules into
 * them. Activation is rule-driven (classification signals + module presence +
 * filled field keys) — not a hard-coded switch per incident type.
 *
 * Does not replace the incident state machine. Specialty work stays inside
 * editable incident statuses.
 */

export type SpecialtyWorkflowGroupId =
  | "FIRE"
  | "STRUCTURE"
  | "WILDLAND"
  | "HAZMAT"
  | "RESCUE"
  | "EXPLOSION"
  | "EXPOSURES"
  | "CIVILIAN_CASUALTIES"
  | "FIRE_SERVICE_CASUALTIES"
  | "ALARM_DETECTION"
  | "FIRE_PROTECTION"
  | "EMERGING_HAZARDS"
  | "RISK_REDUCTION"
  | "INCIDENT_ANALYSIS";

export type SpecialtySectionState =
  "HIDDEN" | "OPTIONAL" | "REQUIRED" | "ACTIVE" | "NOT_APPLICABLE";

export type SpecialtyActivationRule =
  | { type: "always" }
  | { type: "modulePresent" }
  | { type: "classificationSignals"; signals: string[] }
  | { type: "fieldKeySignals"; signals: string[] }
  | { type: "anyOf"; rules: SpecialtyActivationRule[] }
  | { type: "allOf"; rules: SpecialtyActivationRule[] };

export interface SpecialtyWorkflowGroupDefinition {
  id: SpecialtyWorkflowGroupId;
  /** Section key used in RMS navigation and form descriptor. */
  sectionKey: string;
  label: string;
  plainLanguageSummary: string;
  moduleKeys: readonly string[];
  activation: SpecialtyActivationRule;
  /** When active, section cannot be dismissed as N/A. */
  requiredWhenActive: boolean;
  allowNotApplicable: boolean;
  repeatableHints: readonly string[];
}

/** Core shell sections preserved from Phase 2 (always available). */
export const CORE_INCIDENT_SECTION_KEYS = [
  "OVERVIEW",
  "DISPATCH",
  "LOCATION",
  "UNITS_PERSONNEL",
  "CLASSIFICATION",
  "NARRATIVE",
  "ATTACHMENTS",
  "REVIEW",
] as const;

export const SPECIALTY_WORKFLOW_GROUPS: readonly SpecialtyWorkflowGroupDefinition[] = [
  {
    id: "FIRE",
    sectionKey: "FIRE",
    label: "Fire",
    plainLanguageSummary: "Fire discovery, origin, spread, extinguishment, and cause.",
    moduleKeys: ["mod_fire", "mod_transportation_fire"],
    // Activation uses classification / field signals only. Module presence alone
    // yields OPTIONAL (available) without forcing the section into the required path.
    activation: {
      type: "classificationSignals",
      signals: ["FIRE", "STRUCTURE_FIRE", "OUTDOOR_FIRE", "VEHICLE_FIRE", "BRUSH", "WILDLAND"],
    },
    requiredWhenActive: true,
    allowNotApplicable: false,
    repeatableHints: [],
  },
  {
    id: "STRUCTURE",
    sectionKey: "STRUCTURE",
    label: "Structure",
    plainLanguageSummary: "Building construction, occupancy, damage, and protection systems.",
    moduleKeys: ["mod_structure_fire", "mod_dins_structure", "mod_structure_inspection"],
    activation: {
      type: "anyOf",
      rules: [
        {
          type: "classificationSignals",
          signals: ["STRUCTURE", "BUILDING", "RESIDENTIAL", "COMMERCIAL", "STRUCTURE_FIRE"],
        },
        { type: "fieldKeySignals", signals: ["structure", "building", "stories", "sprinkler"] },
      ],
    },
    requiredWhenActive: true,
    allowNotApplicable: false,
    repeatableHints: [],
  },
  {
    id: "WILDLAND",
    sectionKey: "WILDLAND",
    label: "Wildland",
    plainLanguageSummary: "Vegetation fire behavior, fuels, weather, and containment.",
    moduleKeys: ["mod_outdoor_fire"],
    activation: {
      type: "classificationSignals",
      signals: ["WILDLAND", "VEGETATION", "BRUSH", "GRASS", "FOREST", "OUTDOOR_FIRE"],
    },
    requiredWhenActive: true,
    allowNotApplicable: false,
    repeatableHints: [],
  },
  {
    id: "HAZMAT",
    sectionKey: "HAZMAT",
    label: "Hazmat",
    plainLanguageSummary: "Hazardous materials identification, release, and protective actions.",
    moduleKeys: ["mod_hazard", "mod_hazsit"],
    activation: {
      type: "anyOf",
      rules: [
        {
          type: "classificationSignals",
          signals: ["HAZMAT", "HAZ", "CHEMICAL", "SPILL", "RELEASE"],
        },
        { type: "fieldKeySignals", signals: ["hazsit", "chemical", "un_number", "placard"] },
      ],
    },
    requiredWhenActive: true,
    allowNotApplicable: false,
    repeatableHints: ["substance", "container"],
  },
  {
    id: "RESCUE",
    sectionKey: "RESCUE",
    label: "Rescue",
    plainLanguageSummary: "Technical and non-fire rescue operations and outcomes.",
    moduleKeys: ["mod_rescue_ff", "mod_rescue_nonff"],
    activation: {
      type: "anyOf",
      rules: [
        {
          type: "classificationSignals",
          signals: ["RESCUE", "EXTRICATION", "ENTRAPMENT", "WATER_RESCUE", "CONFINED"],
        },
        { type: "fieldKeySignals", signals: ["rescue", "extrication", "entrapment"] },
      ],
    },
    requiredWhenActive: true,
    allowNotApplicable: false,
    repeatableHints: ["victim", "rescue"],
  },
  {
    id: "EXPLOSION",
    sectionKey: "EXPLOSION",
    label: "Explosion",
    plainLanguageSummary: "Explosion source, blast effects, investigation, and scene security.",
    moduleKeys: [],
    activation: {
      type: "classificationSignals",
      signals: ["EXPLOSION", "BLAST", "DETONATION", "BOMB"],
    },
    requiredWhenActive: true,
    allowNotApplicable: false,
    repeatableHints: [],
  },
  {
    id: "EXPOSURES",
    sectionKey: "EXPOSURES",
    label: "Exposures",
    plainLanguageSummary: "Exposure properties linked to the primary incident.",
    moduleKeys: ["mod_exposure"],
    activation: {
      type: "anyOf",
      rules: [
        { type: "fieldKeySignals", signals: ["exposure"] },
        { type: "classificationSignals", signals: ["EXPOSURE"] },
      ],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: ["exposure"],
  },
  {
    id: "CIVILIAN_CASUALTIES",
    sectionKey: "CIVILIAN_CASUALTIES",
    label: "Civilian Casualties",
    plainLanguageSummary: "Civilian injuries and fatalities (no ePCR clinical data).",
    moduleKeys: ["mod_casualty_nonff"],
    activation: {
      type: "anyOf",
      rules: [
        { type: "fieldKeySignals", signals: ["casualty_nonff", "civilian", "patient"] },
        { type: "classificationSignals", signals: ["CASUALTY", "INJURY", "FATALITY"] },
      ],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: ["casualty", "civilian"],
  },
  {
    id: "FIRE_SERVICE_CASUALTIES",
    sectionKey: "FIRE_SERVICE_CASUALTIES",
    label: "Fire Service Casualties",
    plainLanguageSummary: "Firefighter injuries, exposures, and health/safety review.",
    moduleKeys: ["mod_casualty_ff", "mod_personnel_injury", "mod_personnel_spec"],
    activation: {
      type: "fieldKeySignals",
      signals: ["casualty_ff", "mayday", "ff_injury", "personnel_injury"],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: ["casualty_ff", "personnel_injury"],
  },
  {
    id: "ALARM_DETECTION",
    sectionKey: "ALARM_DETECTION",
    label: "Alarm & Detection",
    plainLanguageSummary: "Alarm activation, detection devices, and false-alarm handling.",
    moduleKeys: ["mod_risk_reduction"],
    activation: {
      type: "anyOf",
      rules: [
        {
          type: "fieldKeySignals",
          signals: ["smoke_alarm", "fire_alarm", "detection", "alarm"],
        },
        { type: "classificationSignals", signals: ["ALARM", "FALSE_ALARM", "DETECTION"] },
      ],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: ["alarm", "detection"],
  },
  {
    id: "FIRE_PROTECTION",
    sectionKey: "FIRE_PROTECTION",
    label: "Fire Protection Systems",
    plainLanguageSummary: "Sprinklers, standpipes, pumps, and special suppression systems.",
    moduleKeys: ["mod_structure_fire"],
    activation: {
      type: "anyOf",
      rules: [
        {
          type: "fieldKeySignals",
          signals: ["sprinkler", "standpipe", "suppression", "fire_pump", "foam"],
        },
        { type: "classificationSignals", signals: ["STRUCTURE_FIRE"] },
      ],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: ["protection_system"],
  },
  {
    id: "EMERGING_HAZARDS",
    sectionKey: "EMERGING_HAZARDS",
    label: "Emerging Hazards",
    plainLanguageSummary: "Battery, ESS, EV, solar, and other emerging hazard modules.",
    moduleKeys: ["mod_emerging_hazard", "mod_battery_incident", "mod_consumer_products"],
    activation: {
      type: "classificationSignals",
      signals: ["BATTERY", "LITHIUM", "ESS", "EV", "SOLAR", "HYDROGEN", "EMERGING"],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: [],
  },
  {
    id: "RISK_REDUCTION",
    sectionKey: "RISK_REDUCTION",
    label: "Community Risk Reduction",
    plainLanguageSummary: "Public education, home visits, and CRR program activity.",
    moduleKeys: [
      "mod_core_CRR",
      "mod_community_event",
      "mod_home_visit",
      "mod_commercial_inspection",
      "mod_outdoor_inspection",
      "mod_hydrant_inspection",
      "mod_parcel_data_collection",
    ],
    activation: {
      type: "classificationSignals",
      signals: ["CRR", "PUBLIC_ED", "HOME_VISIT", "INSPECTION", "SMOKE_ALARM_INSTALL"],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: [],
  },
  {
    id: "INCIDENT_ANALYSIS",
    sectionKey: "INCIDENT_ANALYSIS",
    label: "Incident Analysis",
    plainLanguageSummary: "After-action factors, lessons learned, and follow-up tasks.",
    moduleKeys: ["mod_tactic_timestamps"],
    activation: {
      type: "classificationSignals",
      signals: ["ANALYSIS", "AAR", "AFTER_ACTION"],
    },
    requiredWhenActive: false,
    allowNotApplicable: true,
    repeatableHints: [],
  },
] as const;

export interface SpecialtyWorkflowEvaluationInput {
  /** Official module keys present in the published schema version. */
  availableModuleKeys: readonly string[];
  /** Primary / secondary classification codes and free-text type labels. */
  classificationSignals: readonly string[];
  /** Flat map of fieldKey → value (text/number/boolean/json). */
  fieldValuesByKey: Record<string, unknown>;
  /** Section keys marked not applicable by an authorized user. */
  notApplicableSectionKeys?: readonly string[];
  /** Section keys manually opened via “Add section” (optional activation). */
  forcedActiveSectionKeys?: readonly string[];
  /** When false, specialty groups stay hidden (feature flag off). */
  specialtyWorkflowsEnabled?: boolean;
}

export interface EvaluatedSpecialtyWorkflowGroup {
  id: SpecialtyWorkflowGroupId;
  sectionKey: string;
  label: string;
  plainLanguageSummary: string;
  state: SpecialtySectionState;
  required: boolean;
  allowNotApplicable: boolean;
  activationReasons: string[];
  moduleKeys: string[];
  presentModuleKeys: string[];
  repeatableHints: string[];
}

export interface SpecialtyWorkflowEvaluationResult {
  groups: EvaluatedSpecialtyWorkflowGroup[];
  /** Navigation order: core + visible specialty + narrative/attachments/review already in core. */
  navigationSectionKeys: string[];
  hiddenSectionKeys: string[];
}

function normalizeSignal(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function collectValueSignals(fieldValuesByKey: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(fieldValuesByKey)) {
    out.push(normalizeSignal(key));
    if (value == null || value === "") continue;
    if (typeof value === "object") {
      out.push(normalizeSignal(JSON.stringify(value)));
    } else {
      out.push(normalizeSignal(value));
    }
  }
  return out;
}

function ruleMatches(
  rule: SpecialtyActivationRule,
  ctx: {
    presentModules: Set<string>;
    moduleKeys: readonly string[];
    classification: string[];
    fieldSignals: string[];
  },
): { matched: boolean; reasons: string[] } {
  switch (rule.type) {
    case "always":
      return { matched: true, reasons: ["Always available"] };
    case "modulePresent": {
      const present = ruleMatchesModulePresent(ctx.moduleKeys, ctx.presentModules);
      return present;
    }
    case "classificationSignals": {
      const hits = rule.signals.filter((signal) =>
        ctx.classification.some((c) => c.includes(normalizeSignal(signal))),
      );
      return {
        matched: hits.length > 0,
        reasons: hits.map((h) => `Classification matched “${h}”`),
      };
    }
    case "fieldKeySignals": {
      const hits = rule.signals.filter((signal) =>
        ctx.fieldSignals.some((f) => f.includes(normalizeSignal(signal))),
      );
      return {
        matched: hits.length > 0,
        reasons: hits.map((h) => `Incident data matched “${h}”`),
      };
    }
    case "anyOf": {
      const parts = rule.rules.map((child) => ruleMatches(child, ctx));
      const matched = parts.some((p) => p.matched);
      return {
        matched,
        reasons: parts.flatMap((p) => p.reasons),
      };
    }
    case "allOf": {
      const parts = rule.rules.map((child) => ruleMatches(child, ctx));
      const matched = parts.every((p) => p.matched);
      return {
        matched,
        reasons: matched ? parts.flatMap((p) => p.reasons) : [],
      };
    }
    default:
      return { matched: false, reasons: [] };
  }
}

function ruleMatchesModulePresent(
  moduleKeys: readonly string[],
  presentModules: Set<string>,
): { matched: boolean; reasons: string[] } {
  const present = moduleKeys.filter((k) => presentModules.has(k));
  return {
    matched: present.length > 0,
    reasons: present.map((k) => `Schema module available (${k})`),
  };
}

/**
 * Maps an official NERIS module key to a specialty section, or null for core/unmapped.
 */
export function mapModuleToSpecialtySection(moduleKey: string): string | null {
  const key = moduleKey.toLowerCase();
  for (const group of SPECIALTY_WORKFLOW_GROUPS) {
    if (group.moduleKeys.some((m) => m.toLowerCase() === key)) {
      return group.sectionKey;
    }
  }
  // Heuristic fallbacks for modules not listed explicitly.
  if (key.includes("structure_fire") || key.includes("dins_structure")) return "STRUCTURE";
  if (key.includes("outdoor_fire")) return "WILDLAND";
  if (key.includes("fire") && !key.includes("alarm")) return "FIRE";
  if (key.includes("haz")) return "HAZMAT";
  if (key.includes("rescue")) return "RESCUE";
  if (key.includes("exposure")) return "EXPOSURES";
  if (key.includes("casualty_ff") || key.includes("personnel_injury")) {
    return "FIRE_SERVICE_CASUALTIES";
  }
  if (key.includes("casualty")) return "CIVILIAN_CASUALTIES";
  if (key.includes("emerging") || key.includes("battery") || key.includes("consumer")) {
    return "EMERGING_HAZARDS";
  }
  if (
    key.includes("crr") ||
    key.includes("home_visit") ||
    key.includes("community") ||
    key.includes("inspection")
  ) {
    return "RISK_REDUCTION";
  }
  if (key.includes("tactic") || key.includes("analysis")) return "INCIDENT_ANALYSIS";
  return null;
}

export function evaluateSpecialtyWorkflows(
  input: SpecialtyWorkflowEvaluationInput,
): SpecialtyWorkflowEvaluationResult {
  if (input.specialtyWorkflowsEnabled === false) {
    return {
      groups: [],
      navigationSectionKeys: [...CORE_INCIDENT_SECTION_KEYS],
      hiddenSectionKeys: SPECIALTY_WORKFLOW_GROUPS.map((g) => g.sectionKey),
    };
  }

  const presentModules = new Set(input.availableModuleKeys.map((k) => k.toLowerCase()));
  const classification = input.classificationSignals.map(normalizeSignal).filter(Boolean);
  const fieldSignals = collectValueSignals(input.fieldValuesByKey);
  const notApplicable = new Set((input.notApplicableSectionKeys ?? []).map((k) => k.toUpperCase()));
  const forcedActive = new Set((input.forcedActiveSectionKeys ?? []).map((k) => k.toUpperCase()));

  const groups: EvaluatedSpecialtyWorkflowGroup[] = SPECIALTY_WORKFLOW_GROUPS.map((def) => {
    const presentModuleKeys = def.moduleKeys.filter((k) => presentModules.has(k.toLowerCase()));
    const match = ruleMatches(def.activation, {
      presentModules,
      moduleKeys: def.moduleKeys,
      classification,
      fieldSignals,
    });
    const reasons = [...match.reasons];

    let state: SpecialtySectionState = "HIDDEN";
    if (notApplicable.has(def.sectionKey)) {
      state = "NOT_APPLICABLE";
    } else if (match.matched || forcedActive.has(def.sectionKey)) {
      state = def.requiredWhenActive && match.matched ? "REQUIRED" : "ACTIVE";
      if (forcedActive.has(def.sectionKey) && !match.matched) {
        reasons.push("Manually added by user");
      }
    } else if (presentModuleKeys.length > 0) {
      // Module exists in schema but not yet activated by classification —
      // keep optional so users can open when needed without dumping all fields.
      state = "OPTIONAL";
    }

    return {
      id: def.id,
      sectionKey: def.sectionKey,
      label: def.label,
      plainLanguageSummary: def.plainLanguageSummary,
      state,
      required: state === "REQUIRED",
      allowNotApplicable: def.allowNotApplicable && state !== "REQUIRED",
      activationReasons:
        state === "HIDDEN"
          ? []
          : reasons.length > 0
            ? reasons
            : ["Available for optional documentation"],
      moduleKeys: [...def.moduleKeys],
      presentModuleKeys,
      repeatableHints: [...def.repeatableHints],
    };
  });

  // Nav shows activated specialty sections only. OPTIONAL groups remain in
  // `groups` for an "Add section" picker without dumping every NERIS module.
  const visibleSpecialty = groups
    .filter((g) => g.state === "REQUIRED" || g.state === "ACTIVE" || g.state === "NOT_APPLICABLE")
    .map((g) => g.sectionKey);

  // Recommended navigation order from Phase 3 directive.
  const navigationSectionKeys = [
    "OVERVIEW",
    "DISPATCH",
    "LOCATION",
    "UNITS_PERSONNEL",
    "CLASSIFICATION",
    ...[
      "FIRE",
      "STRUCTURE",
      "WILDLAND",
      "HAZMAT",
      "RESCUE",
      "EXPLOSION",
      "EXPOSURES",
      "CIVILIAN_CASUALTIES",
      "FIRE_SERVICE_CASUALTIES",
      "ALARM_DETECTION",
      "FIRE_PROTECTION",
      "EMERGING_HAZARDS",
      "RISK_REDUCTION",
      "INCIDENT_ANALYSIS",
    ].filter((k) => visibleSpecialty.includes(k)),
    "NARRATIVE",
    "ATTACHMENTS",
    "REVIEW",
  ];

  return {
    groups,
    navigationSectionKeys,
    hiddenSectionKeys: groups.filter((g) => g.state === "HIDDEN").map((g) => g.sectionKey),
  };
}
