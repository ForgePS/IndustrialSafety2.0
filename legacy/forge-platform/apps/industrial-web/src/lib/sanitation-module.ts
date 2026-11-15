/**
 * Grain Facility Sanitation module — client types, defaults, and helpers.
 */

export const SANITATION_TABS = [
  { id: "dashboard" as const, label: "Dashboard" },
  { id: "analytics" as const, label: "Analytics" },
  { id: "heatmap" as const, label: "Heat Map" },
  { id: "inspections" as const, label: "Inspections" },
  { id: "start" as const, label: "Start Inspection" },
  { id: "preop" as const, label: "Pre-Op" },
  { id: "run" as const, label: "Checklist" },
  { id: "mss" as const, label: "Master Schedule" },
  { id: "cleaning" as const, label: "Cleaning Tasks" },
  { id: "dust" as const, label: "Dust Housekeeping" },
  { id: "environmental" as const, label: "Environmental" },
  { id: "spills" as const, label: "Spills" },
  { id: "zones" as const, label: "Areas & Locations" },
  { id: "pest" as const, label: "Pest Control" },
  { id: "chemicals" as const, label: "Chemicals" },
  { id: "compressed-air" as const, label: "Compressed Air" },
  { id: "findings" as const, label: "Findings" },
  { id: "verification" as const, label: "Verification" },
  { id: "concerns" as const, label: "Concerns" },
  { id: "reports" as const, label: "Reports" },
  { id: "regulatory" as const, label: "Regulatory" },
  { id: "profile" as const, label: "Facility Profile" },
  { id: "templates" as const, label: "Templates" },
  { id: "settings" as const, label: "Settings" },
] as const;

export type SanitationTabId = (typeof SANITATION_TABS)[number]["id"];

/** Settings stays available so Admin / Creator can re-enable other tabs. */
export const SANITATION_ALWAYS_ON_TAB_IDS = [
  "settings",
] as const satisfies readonly SanitationTabId[];

export const SANITATION_TOGGLEABLE_TABS = SANITATION_TABS.filter(
  (tab) => !(SANITATION_ALWAYS_ON_TAB_IDS as readonly string[]).includes(tab.id),
);

export function filterSanitationTabs(disabledTabs: readonly string[] | null | undefined) {
  const disabled = new Set(
    (disabledTabs ?? []).filter(
      (id) => !(SANITATION_ALWAYS_ON_TAB_IDS as readonly string[]).includes(id),
    ),
  );
  return SANITATION_TABS.filter((tab) => !disabled.has(tab.id));
}

export const FACILITY_TYPES = [
  "Grain Elevator",
  "Rice Mill",
  "Flour Mill",
  "Feed Mill",
  "Dry Corn Mill",
  "Soybean Processing",
  "Grain Storage",
  "Grain Warehouse",
  "Packaging Facility",
  "Bulk Loadout Facility",
  "Receiving Facility",
  "Seed Facility",
  "Ingredient Facility",
  "Animal Food Facility",
  "Human Food Facility",
  "Other",
] as const;

export const COMPLIANCE_FRAMEWORKS = [
  "OSHA 29 CFR 1910.272",
  "OSHA 29 CFR 1910.22",
  "FDA 21 CFR Part 117",
  "FDA 21 CFR Part 507",
  "NFPA 660",
  "Company GMP Program",
  "Company Sanitation Program",
  "Customer-specific requirements",
  "SQF requirements",
  "BRCGS requirements",
  "HACCP-related sanitation controls",
  "Internal corporate standards",
  "State requirements",
  "Custom regulatory framework",
] as const;

export const MSS_FREQUENCIES = [
  "EACH_SHIFT",
  "DAILY",
  "EVERY_X_HOURS",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
  "SEASONAL",
  "AFTER_PRODUCTION",
  "BEFORE_PRODUCTION",
  "AFTER_MAINTENANCE",
  "AFTER_PRODUCT_CHANGE",
  "AFTER_SPILL",
  "AFTER_CONTAMINATION",
  "CONDITION_BASED",
  "CUSTOM",
] as const;

export const CLEANING_STATUSES = [
  "SCHEDULED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "AWAITING_VERIFICATION",
  "VERIFIED",
  "CLOSED",
  "OVERDUE",
  "FAILED_VERIFICATION",
  "RECLEAN_REQUIRED",
  "ON_HOLD",
  "UNABLE_TO_COMPLETE",
  "CANCELLED",
] as const;

export const FINDING_SEVERITIES = ["CRITICAL", "MAJOR", "MINOR", "OBSERVATION"] as const;

export const CONCERN_TYPES = [
  "DUST",
  "GRAIN_SPILL",
  "PEST",
  "CHEMICAL",
  "TRASH",
  "EQUIPMENT",
  "WATER",
  "DRAIN",
  "FOOD_CONTAMINATION",
  "FOREIGN_MATERIAL",
  "EMPLOYEE_GMP",
  "GROUNDS",
  "OTHER",
] as const;

export const DEFAULT_ZONE_DEFS = [
  {
    code: "Z1",
    name: "Zone 1 — Direct product/food-contact surfaces",
    isFoodContact: true,
    sortOrder: 10,
  },
  {
    code: "Z2",
    name: "Zone 2 — Adjacent to product-contact surfaces",
    isFoodContact: false,
    sortOrder: 20,
  },
  {
    code: "Z3",
    name: "Zone 3 — Processing non-product-contact",
    isFoodContact: false,
    sortOrder: 30,
  },
  {
    code: "Z4",
    name: "Zone 4 — Warehouses, grounds, exterior",
    isFoodContact: false,
    sortOrder: 40,
  },
] as const;

export type SanitationQuestion = {
  id: string;
  label: string;
  description?: string;
  responseType?: string;
  riskLevel?: string;
  regulationRef?: string;
  photoRequired?: boolean;
  autoFail?: boolean;
  measurementRequired?: boolean;
};

export type SanitationTemplateSection = {
  id: string;
  title: string;
  questions: SanitationQuestion[];
};

export type SanitationTemplateDef = {
  code: string;
  name: string;
  category: string;
  description?: string;
  sections: SanitationTemplateSection[];
};

/** Builtin templates shipped with the Sanitation module (spec §61). */
export const BUILTIN_SANITATION_TEMPLATES: SanitationTemplateDef[] = [
  {
    code: "SAN-DAILY",
    name: "Commercial Grain Storage & Milling Inspection",
    category: "GENERAL",
    description:
      "Advanced housekeeping, cleanliness & pest prevention checklist. Focus: combustible dust controls, milling sanitation, pest perimeter, and silo topside evaluation. Excludes confined space / permits.",
    sections: [
      {
        id: "housekeeping-dust",
        title: "1. Housekeeping & Fugitive Combustible Dust Controls",
        questions: [
          {
            id: "hk-dust-accumulations",
            label: "Priority Housekeeping Area Dust Accumulations",
            description:
              "Verify dust accumulations do not exceed 1/8 inch (3.2 mm) on floor surfaces, elevated ledges, structural beams, conduits, light fixtures, and equipment tops within 35 feet of elevator legs, grinders, and mixers.",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(i)(2)",
            autoFail: true,
            photoRequired: true,
            measurementRequired: true,
          },
          {
            id: "hk-compressed-air",
            label: "Compressed Air 'Blow Down' Operations",
            description:
              "Ensure compressed air utility lines for cleaning are only operated when all machinery in the immediate area is completely de-energized, un-isolated ignition sources are eliminated, and grain transport is halted.",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(i)(3)",
            autoFail: true,
            photoRequired: true,
          },
          {
            id: "hk-ignition-class-ii",
            label: "Ignition Source Control & Class II Electrical Systems",
            description:
              "Check that all light enclosures, switches, junction boxes, and motors in high-dust zones are completely dust-tight, undamaged, and meet Class II, Division 1 or 2 hazardous location requirements.",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.307",
            autoFail: true,
            photoRequired: true,
          },
          {
            id: "hk-dust-collection",
            label: "Dust Collection System Operational Performance",
            description:
              "Examine vacuum hoods, ducts, baghouses, and cyclones. Check for suction drop, blockages, or tears in fabric filters. Ensure collected fine dust is discharged safely outside or to code-compliant bins.",
            riskLevel: "MAJOR",
            regulationRef: "OSHA 1910.272(m) & NFPA 61",
            photoRequired: true,
          },
          {
            id: "hk-spilled-grain",
            label: "Spilled Grain Removal Immediate Action Protocol",
            description:
              "Inspect boot pits, dump pits, tunnel floors, and load-out bays. Whole grain or product spillages must be swept and removed immediately to avoid biological decomposition or insect harborages.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(a)",
            photoRequired: true,
          },
        ],
      },
      {
        id: "milling-sanitation",
        title: "2. Milling Equipment & Processing Line Mechanical Sanitation",
        questions: [
          {
            id: "mill-boot-cleanouts",
            label: "Elevator Leg Boot Cleanouts & Internal Accumulations",
            description:
              "Inspect leg boot access panel points. Verify specialized internal sweepers or manuals remove static grain heels daily to prevent product fermentation, mold cakes, or localized insect reproduction.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.40 & OSHA 1910.272",
            photoRequired: true,
          },
          {
            id: "mill-magnets",
            label: "Magnetic Separators & Metal Scalper Maintenance",
            description:
              "Examine all plate or grate magnets positioned before mill rolls, hammermills, and flakers. Clean off accumulated tramp metal, wires, and magnetic fines to prevent sparks or product contamination.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.80(c)",
            photoRequired: true,
          },
          {
            id: "mill-chambers",
            label: "Milling Chambers, Roll Stands, & Sifter Cleanliness",
            description:
              "Open de-energized processing lines to inspect roll housings, sifter screens, and purifier decks. Look for 'dead spots' where flour or meal consolidates, goes rancid, or harbors live beetle larvae.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(d)",
            photoRequired: true,
          },
          {
            id: "mill-bearings",
            label: "Bearing Temperature & Belt Alignment Switch Tests",
            description:
              "Verify external surfaces of bearings on legs, head pulleys, and high-speed grinders are clean of insulation dust coats. Check automated sensor logs for alignment and overheat warnings.",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(q)",
            photoRequired: true,
          },
        ],
      },
      {
        id: "pest-perimeter",
        title: "3. Facility Sanitary Design, Pest Prevention & Perimeter Control",
        questions: [
          {
            id: "pest-structural",
            label: "Structural Sealing & Exclusion Infrastructure",
            description:
              "Check exterior walls, foundations, eaves, and roofs for holes, cracks, or gaps. Ensure all open vents are covered with 1/4-inch mesh wire screen. Dock doors must have functional weather seals.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(c)",
            photoRequired: true,
          },
          {
            id: "pest-monitoring",
            label: "Pest Monitoring Stations & Device Mapping",
            description:
              "Verify all exterior bait stations and interior multi-catch mechanical rodent traps are intact, mapped, sequentially numbered, and serviced on schedule. Check for signs of active boring beetles.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(c)",
            photoRequired: true,
          },
          {
            id: "pest-vegetation",
            label: "Sanitary Perimeter Vegetation & Buffer Zone",
            description:
              "Ensure a clean 10-to-15-foot gravel or concrete barrier is clear of high weeds, brush, or debris immediately adjacent to storage silos and milling foundations to discourage nesting pests.",
            riskLevel: "MINOR",
            regulationRef: "FDA 21 CFR 117.20(a)",
            photoRequired: true,
          },
          {
            id: "pest-waste",
            label: "Waste Disposal, Dumpster Siting, & Screenings Handling",
            description:
              "Confirm trash dumpsters and screenings bins are tightly closed, leak-free, and located at least 50-100 feet from primary intake and loadout openings to control vectors and flies.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(a)",
            photoRequired: true,
          },
        ],
      },
      {
        id: "silo-topside",
        title: "4. Storage Silo Interiors (Topside Evaluation) & Product Protection",
        questions: [
          {
            id: "silo-roof",
            label: "Silo Roof Vents, Hatches, & Weatherproof Seals",
            description:
              "From the topside catwalk, verify roof inspection hatches close tightly and gaskets prevent rain or snow ingress. Check that exhaust vent screens are free of matted dust blocks.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.20(b)",
            photoRequired: true,
          },
          {
            id: "silo-condensation",
            label: "Upper Wall Condensation & 'Hang-up' Checks",
            description:
              "Peer through top inspection ports using explosion-proof lighting. Look for internal wall sweating, overhead mold crusts, or grain bridges ('hang-ups') that cross-contaminate flows.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.80(c)",
            photoRequired: true,
          },
          {
            id: "silo-aeration",
            label: "Aeration Fan Intakes & Plenum Chamber Sanitation",
            description:
              "Examine ground-level aeration fan housings. Remove any trash, bird droppings, or rodent nests near intakes so ambient air pulled through the grain core stays sanitary and unpolluted.",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(d)",
            photoRequired: true,
          },
        ],
      },
    ],
  },
  {
    code: "SAN-DUST",
    name: "Grain Dust Housekeeping Inspection",
    category: "DUST",
    sections: [
      {
        id: "surfaces",
        title: "Dust Accumulation Surfaces",
        questions: [
          {
            id: "d1",
            label: "Floors — fugitive grain dust controlled?",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(j)",
            measurementRequired: true,
          },
          {
            id: "d2",
            label: "Beams, rafters, ledges free of heavy accumulation?",
            riskLevel: "MAJOR",
            photoRequired: true,
          },
          {
            id: "d3",
            label: "Motors, bearings, and cable trays free of dust?",
            riskLevel: "MAJOR",
          },
          {
            id: "d4",
            label: "Conveyors and transfer points sealed / no dust leaks?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "d5",
            label: "Dust collectors operating and free of abnormal buildup?",
            riskLevel: "MAJOR",
          },
        ],
      },
    ],
  },
  {
    code: "SAN-ELEV-PRIORITY",
    name: "Grain Elevator Priority Area Dust Inspection",
    category: "DUST",
    description: "OSHA priority housekeeping areas — 1/8-inch action level where applicable.",
    sections: [
      {
        id: "priority",
        title: "Priority Housekeeping Areas",
        questions: [
          {
            id: "p1",
            label: "Floor areas within 35 ft of inside bucket elevators ≤ 1/8 in dust?",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(j)",
            measurementRequired: true,
            autoFail: true,
          },
          {
            id: "p2",
            label: "Floors of enclosed grinding equipment areas ≤ 1/8 in dust?",
            riskLevel: "CRITICAL",
            measurementRequired: true,
            autoFail: true,
          },
          {
            id: "p3",
            label: "Floors of enclosed indoor grain dryer areas ≤ 1/8 in dust?",
            riskLevel: "CRITICAL",
            measurementRequired: true,
            autoFail: true,
          },
        ],
      },
    ],
  },
  {
    code: "SAN-RICE",
    name: "Rice Mill Sanitation Inspection",
    category: "GENERAL",
    sections: [
      {
        id: "rice",
        title: "Rice Mill Sanitation",
        questions: [
          {
            id: "r1",
            label: "Milling equipment free of residue and foreign material?",
            riskLevel: "MAJOR",
          },
          { id: "r2", label: "Packaging area sanitary and pest-free?", riskLevel: "MAJOR" },
          {
            id: "r3",
            label: "Allergen / product changeover controls followed?",
            riskLevel: "CRITICAL",
          },
        ],
      },
    ],
  },
  {
    code: "SAN-GMP",
    name: "Processing Area GMP Inspection",
    category: "GMP",
    sections: [
      {
        id: "gmp",
        title: "Employee GMP",
        questions: [
          {
            id: "g1",
            label: "Appropriate clothing and hygiene practices observed?",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          {
            id: "g2",
            label: "No jewelry / personal items in production areas?",
            riskLevel: "MINOR",
          },
          { id: "g3", label: "Handwashing stations stocked and used?", riskLevel: "MAJOR" },
          { id: "g4", label: "No food/drink/tobacco in restricted areas?", riskLevel: "MAJOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-WAREHOUSE",
    name: "Warehouse Sanitation Inspection",
    category: "STORAGE",
    sections: [
      {
        id: "wh",
        title: "Warehouse",
        questions: [
          { id: "w1", label: "Storage areas clean and organized?", riskLevel: "MINOR" },
          {
            id: "w2",
            label: "Product off floor / away from walls as required?",
            riskLevel: "MAJOR",
          },
          {
            id: "w3",
            label: "No pest evidence in storage?",
            riskLevel: "CRITICAL",
            photoRequired: true,
          },
        ],
      },
    ],
  },
  {
    code: "SAN-GROUNDS",
    name: "Exterior Grounds Inspection",
    category: "GROUNDS",
    sections: [
      {
        id: "grounds",
        title: "Plant Grounds",
        questions: [
          {
            id: "gr1",
            label: "Grass/weeds controlled; no pest harborage?",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          { id: "gr2", label: "Standing water and drainage acceptable?", riskLevel: "MAJOR" },
          { id: "gr3", label: "Waste / scrap / litter controlled?", riskLevel: "MINOR" },
          { id: "gr4", label: "Outside storage neat and protected?", riskLevel: "MINOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-PEST",
    name: "Pest Control Inspection",
    category: "PEST",
    sections: [
      {
        id: "pest",
        title: "Pest Activity",
        questions: [
          {
            id: "pe1",
            label: "No rodent activity or droppings?",
            riskLevel: "CRITICAL",
            regulationRef: "FDA 21 CFR Part 117",
            photoRequired: true,
          },
          { id: "pe2", label: "No insect or bird evidence in food areas?", riskLevel: "CRITICAL" },
          { id: "pe3", label: "Entry points sealed; screens/doors intact?", riskLevel: "MAJOR" },
          { id: "pe4", label: "Pest devices inspected and serviceable?", riskLevel: "MINOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-EQUIP",
    name: "Equipment Sanitation Inspection",
    category: "EQUIPMENT",
    sections: [
      {
        id: "eq",
        title: "Equipment Sanitation",
        questions: [
          { id: "eq1", label: "Food-contact surfaces clean and undamaged?", riskLevel: "CRITICAL" },
          { id: "eq2", label: "No corrosion, damage, or foreign material?", riskLevel: "MAJOR" },
          {
            id: "eq3",
            label: "Guards, covers, and panels properly installed?",
            riskLevel: "MAJOR",
          },
        ],
      },
    ],
  },
  {
    code: "SAN-PREOP",
    name: "Pre-Operational Inspection",
    category: "PREOP",
    sections: [
      {
        id: "preop",
        title: "Pre-Op Release",
        questions: [
          {
            id: "po1",
            label: "Equipment clean — no previous product residue?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "po2",
            label: "No chemical residue on food-contact surfaces?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "po3",
            label: "No pest evidence or foreign material?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          { id: "po4", label: "Tools, rags, and maintenance debris removed?", riskLevel: "MAJOR" },
          {
            id: "po5",
            label: "Area acceptable for production release?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
        ],
      },
    ],
  },
  {
    code: "SAN-POST-MAINT",
    name: "Post-Maintenance Sanitation Release",
    category: "PREOP",
    sections: [
      {
        id: "postm",
        title: "Post-Maintenance",
        questions: [
          {
            id: "pm1",
            label: "Tools, hardware, and metal debris removed?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "pm2",
            label: "No grease, lubricant, welding, or grinding residue?",
            riskLevel: "CRITICAL",
          },
          { id: "pm3", label: "Guards replaced; area cleanliness verified?", riskLevel: "MAJOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-CHEM",
    name: "Chemical Storage Inspection",
    category: "CHEMICAL",
    sections: [
      {
        id: "chem",
        title: "Chemical Sanitation Controls",
        questions: [
          {
            id: "c1",
            label: "Chemicals properly labeled with SDS available?",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          { id: "c2", label: "Approved chemicals only; segregation correct?", riskLevel: "MAJOR" },
          {
            id: "c3",
            label: "Secondary containers labeled; no damaged containers?",
            riskLevel: "MINOR",
          },
          { id: "c4", label: "Concentrations correct where checked?", riskLevel: "MAJOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-WASTE",
    name: "Waste & Disposal Inspection",
    category: "WASTE",
    sections: [
      {
        id: "waste",
        title: "Waste",
        questions: [
          { id: "wa1", label: "Trash and product waste controlled?", riskLevel: "MINOR" },
          {
            id: "wa2",
            label: "Dumpsters / disposal areas clean; lids closed?",
            riskLevel: "MAJOR",
          },
          { id: "wa3", label: "No overflowing containers or pest attraction?", riskLevel: "MAJOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-RESTROOM",
    name: "Restroom / Employee Facility Inspection",
    category: "SANITARY",
    sections: [
      {
        id: "rest",
        title: "Sanitary Facilities",
        questions: [
          {
            id: "re1",
            label: "Restrooms clean; soap and towels available?",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          { id: "re2", label: "Handwashing, plumbing, and drainage adequate?", riskLevel: "MAJOR" },
          { id: "re3", label: "Sewage and wastewater controlled?", riskLevel: "CRITICAL" },
        ],
      },
    ],
  },
  {
    code: "SAN-MSS-VERIFY",
    name: "Master Sanitation Verification",
    category: "VERIFICATION",
    sections: [
      {
        id: "mssv",
        title: "MSS Verification",
        questions: [
          { id: "mv1", label: "Scheduled MSS tasks completed on time?", riskLevel: "MAJOR" },
          {
            id: "mv2",
            label: "Cleaning documentation complete with signatures?",
            riskLevel: "MINOR",
          },
          {
            id: "mv3",
            label: "Verification performed independent of cleaner where required?",
            riskLevel: "MAJOR",
          },
        ],
      },
    ],
  },
  {
    code: "SAN-SPILL-VERIFY",
    name: "Grain Spill Cleanup Verification",
    category: "SPILL",
    sections: [
      {
        id: "spillv",
        title: "Spill Cleanup",
        questions: [
          { id: "sv1", label: "Spill fully removed; area dry and safe?", riskLevel: "MAJOR" },
          {
            id: "sv2",
            label: "Root cause addressed or maintenance requested?",
            riskLevel: "MAJOR",
          },
          { id: "sv3", label: "No residual slip or dust hazard?", riskLevel: "CRITICAL" },
        ],
      },
    ],
  },
  {
    code: "SAN-MONTHLY-AUDIT",
    name: "Monthly Comprehensive Sanitation Audit",
    category: "AUDIT",
    sections: [
      {
        id: "audit",
        title: "Monthly Audit",
        questions: [
          { id: "a1", label: "Overall facility sanitation acceptable?", riskLevel: "MAJOR" },
          { id: "a2", label: "Open critical findings closed or escalated?", riskLevel: "CRITICAL" },
          { id: "a3", label: "MSS completion ≥ target?", riskLevel: "MAJOR" },
          { id: "a4", label: "Pest, chemical, and dust programs current?", riskLevel: "MAJOR" },
        ],
      },
    ],
  },
  {
    code: "SAN-EMISSION",
    name: "Dust Emission Source Inspection",
    category: "DUST",
    sections: [
      {
        id: "emission",
        title: "Emission Sources",
        questions: [
          {
            id: "em1",
            label: "Spouting / bucket elevator casing sealed (no holes)?",
            riskLevel: "CRITICAL",
            photoRequired: true,
          },
          {
            id: "em2",
            label: "Conveyor transfer points, seals, and gaskets intact?",
            riskLevel: "MAJOR",
          },
          {
            id: "em3",
            label: "Dust hoods, flanges, and inspection doors secure?",
            riskLevel: "MAJOR",
          },
          {
            id: "em4",
            label: "No active dust or grain leakage requiring maintenance?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
        ],
      },
    ],
  },
  {
    code: "SAN-BIN-SILO",
    name: "Bin / Silo Sanitation Inspection",
    category: "STORAGE",
    description:
      "ENTRY INTO BINS, SILOS OR CONFINED SPACES MUST FOLLOW THE FACILITY'S APPLICABLE ENTRY PROCEDURES.",
    sections: [
      {
        id: "binsilo",
        title: "Bin / Silo (authorized methods only)",
        questions: [
          {
            id: "bs1",
            label: "Inspection method documented (external / camera / opening / authorized entry)?",
            riskLevel: "CRITICAL",
          },
          {
            id: "bs2",
            label: "No bridging, mold, or excessive moisture observed?",
            riskLevel: "MAJOR",
          },
          {
            id: "bs3",
            label: "No pest evidence or foreign material?",
            riskLevel: "CRITICAL",
            photoRequired: true,
          },
          {
            id: "bs4",
            label: "Confined space / LOTO permits followed where entry occurred?",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
        ],
      },
    ],
  },
];

export type InspectionAnswer = "PASS" | "FAIL" | "NA" | "YES" | "NO" | "";

export function statusBadgeClass(status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  if (["PASS", "VERIFIED", "CLOSED", "APPROVED", "COMPLETED", "GOOD"].includes(s))
    return "bg-label-success";
  if (["CRITICAL", "CRITICAL_FAIL", "FAIL", "FAILED_VERIFICATION", "DENIED"].includes(s))
    return "bg-label-danger";
  if (["MAJOR", "OVERDUE", "RECLEAN_REQUIRED", "AWAITING_VERIFICATION", "CONDITIONAL"].includes(s))
    return "bg-label-warning";
  if (["IN_PROGRESS", "ASSIGNED", "REQUESTED", "OPEN", "ACTIVE"].includes(s))
    return "bg-label-primary";
  return "bg-label-secondary";
}

export function severityBadgeClass(severity: string | null | undefined): string {
  const s = String(severity ?? "").toUpperCase();
  if (s === "CRITICAL") return "bg-label-danger";
  if (s === "MAJOR") return "bg-label-warning";
  if (s === "MINOR") return "bg-label-info";
  return "bg-label-secondary";
}

/** OSHA 1/8 inch ≈ 3.2 mm */
export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function exceedsDustActionLevel(depthInches: number, thresholdInches = 0.125): boolean {
  return depthInches > thresholdInches;
}

export function defaultInspectionTitle(
  templateName: string,
  context?: string | { siteName?: string; divisionName?: string; departmentName?: string },
): string {
  const when = new Date().toLocaleString();
  const parts = [when];
  if (templateName.trim()) parts.push(templateName.trim());
  if (typeof context === "string") {
    if (context.trim()) parts.push(context.trim());
  } else if (context) {
    const division = context.divisionName?.trim();
    const department = context.departmentName?.trim();
    if (division) parts.push(division);
    if (department) parts.push(department);
  }
  return parts.join(" — ");
}

/** Static regulatory references for grain facility sanitation programs. */
export const REGULATORY_LIBRARY_STATIC = [
  {
    code: "OSHA-1910.272",
    citation: "OSHA 29 CFR 1910.272",
    title: "Grain handling facilities",
    topic: "Dust housekeeping, priority areas, ignition control",
  },
  {
    code: "OSHA-1910.22",
    citation: "OSHA 29 CFR 1910.22",
    title: "Walking-working surfaces",
    topic: "Housekeeping, spills, clear aisles",
  },
  {
    code: "FDA-117",
    citation: "FDA 21 CFR Part 117",
    title:
      "Current good manufacturing practice, hazard analysis, and risk-based preventive controls for human food",
    topic: "Sanitation, pest control, environmental monitoring",
  },
  {
    code: "FDA-507",
    citation: "FDA 21 CFR Part 507",
    title:
      "Current good manufacturing practice, hazard analysis, and risk-based preventive controls for food for animals",
    topic: "Animal food sanitation and pest control",
  },
  {
    code: "NFPA-660",
    citation: "NFPA 660",
    title: "Standard for Combustible Dusts and Particulate Solids",
    topic: "Combustible dust fire and explosion prevention",
  },
  {
    code: "OSHA-1910.94",
    citation: "OSHA 29 CFR 1910.94",
    title: "Ventilation",
    topic: "Dust collection and exhaust ventilation",
  },
  {
    code: "OSHA-1910.147",
    citation: "OSHA 29 CFR 1910.147",
    title: "The control of hazardous energy (lockout/tagout)",
    topic: "LOTO before cleaning energized equipment",
  },
  {
    code: "FDA-110",
    citation: "FDA 21 CFR Part 110 (historical)",
    title: "Current good manufacturing practice in manufacturing, packing, or holding human food",
    topic: "Legacy GMP references still cited in some programs",
  },
] as const;

export type RegulatoryLibraryEntry = (typeof REGULATORY_LIBRARY_STATIC)[number];

export const SANITATION_DRAFT_PREFIX = "forge.sanitation.draft.";

export const SPILL_STATUS_ACTIONS = [
  "REPORTED",
  "CLEANUP_IN_PROGRESS",
  "CLEANED",
  "VERIFIED",
  "CLOSED",
] as const;

export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const PRINT_POPUP_BLOCKED_MESSAGE =
  "Your browser blocked the print window. Allow pop-ups for this site and try again.";

/**
 * Open the print tab right away, while the click still counts as a user action.
 * Browsers block tabs opened after an await, and "noopener" makes window.open return
 * null, which left an empty white tab with nothing written into it.
 */
export function openPrintWindow(): Window | null {
  if (typeof window === "undefined") return null;
  const w = window.open("", "_blank");
  if (!w) return null;
  try {
    w.opener = null;
    w.document.title = "Preparing report…";
    w.document.body.innerHTML =
      '<p style="font-family:system-ui,sans-serif;padding:24px;color:#555">Loading report…</p>';
  } catch {
    // Still usable; the report is written below.
  }
  return w;
}

/** Write report HTML into a print tab, then open the print dialog once images load. */
export function openPrintHtml(html: string, target?: Window | null): void {
  if (typeof window === "undefined") return;
  const w = target ?? openPrintWindow();
  if (!w || w.closed) throw new Error(PRINT_POPUP_BLOCKED_MESSAGE);
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Photos are inline data URLs; printing before they decode leaves blank boxes.
  const images = Array.from(w.document.images);
  const loaded = images.map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
  );
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 5000));
  void Promise.race([Promise.all(loaded), timeout]).then(() => {
    try {
      w.focus();
      w.print();
    } catch {
      // Print may be blocked; the tab still shows the report and its own Print button.
    }
  });
}

export function sanitationStatusDotColor(status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  if (["GOOD", "PASS", "CLEAN", "OK", "ACCEPTABLE"].includes(s)) return "#28c76f";
  if (["FAIR", "CONDITIONAL", "WATCH", "ATTENTION"].includes(s)) return "#ff9f43";
  if (["POOR", "FAIL", "CRITICAL", "UNACCEPTABLE", "BAD"].includes(s)) return "#ea5455";
  return "#82868b";
}

export function preopDisposition(complianceStatus: string | null | undefined): string | null {
  const s = String(complianceStatus ?? "").toUpperCase();
  if (!s) return null;
  if (s === "PASS" || (s.includes("PASS") && !s.includes("FAIL"))) return "RELEASED_FOR_PRODUCTION";
  if (s.includes("FAIL")) return "FAILED_PRODUCTION_HOLD";
  return null;
}

/**
 * Answers without their photos. Photos upload one at a time, so autosave, Complete and
 * the device draft carry only the small answer data (the server keeps stored photos).
 */
export function stripResponsePhotos<T extends Record<string, unknown>>(
  responses: Record<string, T>,
): Record<string, Omit<T, "photos">> {
  const out: Record<string, Omit<T, "photos">> = {};
  for (const [key, entry] of Object.entries(responses)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const { photos: _photos, ...rest } = entry;
      out[key] = rest;
    } else {
      out[key] = entry;
    }
  }
  return out;
}

export type SanitationAutosaveState = {
  state: "idle" | "saving" | "saved" | "error" | "offline";
  at?: string;
};

/** Status line shown next to Save / Complete. */
export function sanitationAutosaveLabel(
  autosave: SanitationAutosaveState,
  photosWaiting: number,
): string {
  const photos =
    photosWaiting > 0
      ? ` · ${photosWaiting} photo${photosWaiting === 1 ? "" : "s"} waiting to upload`
      : "";
  switch (autosave.state) {
    case "saving":
      return `Saving…${photos}`;
    case "saved": {
      const at = autosave.at
        ? new Date(autosave.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "";
      return `All changes saved${at ? ` at ${at}` : ""}${photos}`;
    }
    case "error":
      return `Not saved yet. Retrying…${photos}`;
    case "offline":
      return `Offline. Saved on this device${photos}`;
    default:
      return photos ? photos.slice(3) : "";
  }
}

export function saveSanitationDraft(
  inspectionId: string,
  responses: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${SANITATION_DRAFT_PREFIX}${inspectionId}`,
      JSON.stringify({ responses, savedAt: new Date().toISOString() }),
    );
  } catch {
    // ignore quota
  }
}

export function loadSanitationDraft(
  inspectionId: string,
): { responses: Record<string, unknown>; savedAt?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${SANITATION_DRAFT_PREFIX}${inspectionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { responses?: Record<string, unknown>; savedAt?: string };
    if (!parsed?.responses || typeof parsed.responses !== "object") return null;
    const out: { responses: Record<string, unknown>; savedAt?: string } = {
      responses: parsed.responses,
    };
    if (parsed.savedAt) out.savedAt = parsed.savedAt;
    return out;
  } catch {
    return null;
  }
}

export function clearSanitationDraft(inspectionId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${SANITATION_DRAFT_PREFIX}${inspectionId}`);
}

const ANSWERED_RESULTS = new Set(["PASS", "FAIL", "NA", "YES", "NO"]);

/** True when a checklist answer is Yes, No or N/A. */
export function isSanitationAnswered(result: unknown): boolean {
  return ANSWERED_RESULTS.has(String(result ?? "").toUpperCase());
}

/** Questions with no Yes/No/N/A answer, in checklist order. */
export function unansweredSanitationQuestions<Q extends { id: string }>(
  questions: Q[],
  responses: Record<string, { result?: unknown } | undefined>,
): Q[] {
  return questions.filter((q) => !isSanitationAnswered(responses[q.id]?.result));
}
