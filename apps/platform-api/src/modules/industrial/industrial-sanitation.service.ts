import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  createId,
  industrialCorrectiveActions,
  industrialSanitationChemicals,
  industrialSanitationCleaningTasks,
  industrialSanitationCompressedAirRequests,
  industrialSanitationConcernReports,
  industrialSanitationDustMeasurements,
  industrialSanitationEnvironmentalSamples,
  industrialSanitationFacilityProfiles,
  industrialSanitationFindings,
  industrialSanitationInspections,
  industrialSanitationLocations,
  industrialSanitationMasterSchedule,
  industrialSanitationPestDevices,
  industrialSanitationPestFindings,
  industrialSanitationSequenceCounters,
  industrialSanitationSpills,
  industrialSanitationTemplates,
  industrialSanitationUiSettings,
  industrialSanitationVerifications,
  industrialSanitationZones,
  industrialSites,
  industrialDepartments,
  industrialPersonnel,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  buildSanitationAuditPackageHtml,
  buildSanitationInspectionPrintableHtml,
  escapeSanitationHtml,
} from "./sanitation-print.js";
import {
  buildSanitationInspectionPdf,
  decodeImageDataUrl,
  isValidTimeZone,
  sanitationPdfFilename,
  type SanitationPdfQuestion,
} from "./sanitation-pdf.js";

type ListQuery = Record<string, string | undefined>;

type TemplateQuestion = {
  id: string;
  label: string;
  description?: string;
  responseType: string;
  riskLevel: string;
  regulationRef?: string;
  photoRequired?: boolean;
  autoFail?: boolean;
  measurementRequired?: boolean;
};

type TemplateSection = {
  id: string;
  title: string;
  questions: TemplateQuestion[];
};

type DefaultTemplate = {
  code: string;
  name: string;
  category: string;
  description?: string;
  sections: TemplateSection[];
};

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
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
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "OSHA 1910.272(m) & NFPA 61",
            photoRequired: true,
          },
          {
            id: "hk-spilled-grain",
            label: "Spilled Grain Removal Immediate Action Protocol",
            description:
              "Inspect boot pits, dump pits, tunnel floors, and load-out bays. Whole grain or product spillages must be swept and removed immediately to avoid biological decomposition or insect harborages.",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.40 & OSHA 1910.272",
            photoRequired: true,
          },
          {
            id: "mill-magnets",
            label: "Magnetic Separators & Metal Scalper Maintenance",
            description:
              "Examine all plate or grate magnets positioned before mill rolls, hammermills, and flakers. Clean off accumulated tramp metal, wires, and magnetic fines to prevent sparks or product contamination.",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.80(c)",
            photoRequired: true,
          },
          {
            id: "mill-chambers",
            label: "Milling Chambers, Roll Stands, & Sifter Cleanliness",
            description:
              "Open de-energized processing lines to inspect roll housings, sifter screens, and purifier decks. Look for 'dead spots' where flour or meal consolidates, goes rancid, or harbors live beetle larvae.",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(d)",
            photoRequired: true,
          },
          {
            id: "mill-bearings",
            label: "Bearing Temperature & Belt Alignment Switch Tests",
            description:
              "Verify external surfaces of bearings on legs, head pulleys, and high-speed grinders are clean of insulation dust coats. Check automated sensor logs for alignment and overheat warnings.",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(c)",
            photoRequired: true,
          },
          {
            id: "pest-monitoring",
            label: "Pest Monitoring Stations & Device Mapping",
            description:
              "Verify all exterior bait stations and interior multi-catch mechanical rodent traps are intact, mapped, sequentially numbered, and serviced on schedule. Check for signs of active boring beetles.",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.35(c)",
            photoRequired: true,
          },
          {
            id: "pest-vegetation",
            label: "Sanitary Perimeter Vegetation & Buffer Zone",
            description:
              "Ensure a clean 10-to-15-foot gravel or concrete barrier is clear of high weeds, brush, or debris immediately adjacent to storage silos and milling foundations to discourage nesting pests.",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
            regulationRef: "FDA 21 CFR 117.20(a)",
            photoRequired: true,
          },
          {
            id: "pest-waste",
            label: "Waste Disposal, Dumpster Siting, & Screenings Handling",
            description:
              "Confirm trash dumpsters and screenings bins are tightly closed, leak-free, and located at least 50-100 feet from primary intake and loadout openings to control vectors and flies.",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.20(b)",
            photoRequired: true,
          },
          {
            id: "silo-condensation",
            label: "Upper Wall Condensation & 'Hang-up' Checks",
            description:
              "Peer through top inspection ports using explosion-proof lighting. Look for internal wall sweating, overhead mold crusts, or grain bridges ('hang-ups') that cross-contaminate flows.",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR 117.80(c)",
            photoRequired: true,
          },
          {
            id: "silo-aeration",
            label: "Aeration Fan Intakes & Plenum Chamber Sanitation",
            description:
              "Examine ground-level aeration fan housings. Remove any trash, bird droppings, or rodent nests near intakes so ambient air pulled through the grain core stays sanitary and unpolluted.",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(j)",
          },
          {
            id: "d2",
            label: "Beams, rafters, ledges free of heavy accumulation?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            photoRequired: true,
          },
          {
            id: "d3",
            label: "Motors, bearings, and cable trays free of dust?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "d4",
            label: "Conveyors and transfer points sealed / no dust leaks?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "d5",
            label: "Dust collectors operating and free of abnormal buildup?",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            regulationRef: "OSHA 29 CFR 1910.272(j)",
            autoFail: true,
          },
          {
            id: "p2",
            label: "Floors of enclosed grinding equipment areas ≤ 1/8 in dust?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "p3",
            label: "Floors of enclosed indoor grain dryer areas ≤ 1/8 in dust?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "r2",
            label: "Packaging area sanitary and pest-free?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "r3",
            label: "Allergen / product changeover controls followed?",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          {
            id: "g2",
            label: "No jewelry / personal items in production areas?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
          {
            id: "g3",
            label: "Handwashing stations stocked and used?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "g4",
            label: "No food/drink/tobacco in restricted areas?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
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
          {
            id: "w1",
            label: "Storage areas clean and organized?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
          {
            id: "w2",
            label: "Product off floor / away from walls as required?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "w3",
            label: "No pest evidence in storage?",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          {
            id: "gr2",
            label: "Standing water and drainage acceptable?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "gr3",
            label: "Waste / scrap / litter controlled?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
          {
            id: "gr4",
            label: "Outside storage neat and protected?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            regulationRef: "FDA 21 CFR Part 117",
            photoRequired: true,
          },
          {
            id: "pe2",
            label: "No insect or bird evidence in food areas?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
          {
            id: "pe3",
            label: "Entry points sealed; screens/doors intact?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "pe4",
            label: "Pest devices inspected and serviceable?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
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
          {
            id: "eq1",
            label: "Food-contact surfaces clean and undamaged?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
          {
            id: "eq2",
            label: "No corrosion, damage, or foreign material?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "eq3",
            label: "Guards, covers, and panels properly installed?",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "po2",
            label: "No chemical residue on food-contact surfaces?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "po3",
            label: "No pest evidence or foreign material?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "po4",
            label: "Tools, rags, and maintenance debris removed?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "po5",
            label: "Area acceptable for production release?",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
          {
            id: "pm2",
            label: "No grease, lubricant, welding, or grinding residue?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
          {
            id: "pm3",
            label: "Guards replaced; area cleanliness verified?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          {
            id: "c2",
            label: "Approved chemicals only; segregation correct?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "c3",
            label: "Secondary containers labeled; no damaged containers?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
          {
            id: "c4",
            label: "Concentrations correct where checked?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
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
          {
            id: "wa1",
            label: "Trash and product waste controlled?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
          {
            id: "wa2",
            label: "Dumpsters / disposal areas clean; lids closed?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "wa3",
            label: "No overflowing containers or pest attraction?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
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
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
            regulationRef: "FDA 21 CFR Part 117",
          },
          {
            id: "re2",
            label: "Handwashing, plumbing, and drainage adequate?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "re3",
            label: "Sewage and wastewater controlled?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
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
          {
            id: "mv1",
            label: "Scheduled MSS tasks completed on time?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "mv2",
            label: "Cleaning documentation complete with signatures?",
            responseType: "PASS_FAIL",
            riskLevel: "MINOR",
          },
          {
            id: "mv3",
            label: "Verification performed independent of cleaner where required?",
            responseType: "PASS_FAIL",
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
          {
            id: "sv1",
            label: "Spill fully removed; area dry and safe?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "sv2",
            label: "Root cause addressed or maintenance requested?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "sv3",
            label: "No residual slip or dust hazard?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
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
          {
            id: "a1",
            label: "Overall facility sanitation acceptable?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "a2",
            label: "Open critical findings closed or escalated?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
          {
            id: "a3",
            label: "MSS completion ≥ target?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "a4",
            label: "Pest, chemical, and dust programs current?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            photoRequired: true,
          },
          {
            id: "em2",
            label: "Conveyor transfer points, seals, and gaskets intact?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "em3",
            label: "Dust hoods, flanges, and inspection doors secure?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "em4",
            label: "No active dust or grain leakage requiring maintenance?",
            responseType: "PASS_FAIL",
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
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
          },
          {
            id: "bs2",
            label: "No bridging, mold, or excessive moisture observed?",
            responseType: "PASS_FAIL",
            riskLevel: "MAJOR",
          },
          {
            id: "bs3",
            label: "No pest evidence or foreign material?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            photoRequired: true,
          },
          {
            id: "bs4",
            label: "Confined space / LOTO permits followed where entry occurred?",
            responseType: "PASS_FAIL",
            riskLevel: "CRITICAL",
            autoFail: true,
          },
        ],
      },
    ],
  },
];

const CONCERN_TYPES = new Set([
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
]);

const CLEANING_STATUSES = new Set([
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
]);

/** Accept any UUID-shaped id (incl. Forge UUIDv7 and import deterministicTargetId hashes). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asOptionalUuid(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!UUID_RE.test(raw)) throw new ForgeError("VALIDATION_FAILED", "Invalid UUID");
  return raw;
}

function asRequiredUuid(value: unknown, field: string): string {
  const id = asOptionalUuid(value);
  if (!id) throw new ForgeError("VALIDATION_FAILED", `${field} is required`);
  return id;
}

function asRequiredString(value: unknown, field: string, max = 500): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new ForgeError("VALIDATION_FAILED", `${field} is required`);
  if (raw.length > max) throw new ForgeError("VALIDATION_FAILED", `${field} is too long`);
  return raw;
}

function asOptionalString(value: unknown, max = 500): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > max) throw new ForgeError("VALIDATION_FAILED", "Value is too long");
  return raw;
}

function asBool(value: unknown, fallback = false): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(raw)) return true;
  if (["0", "false", "no", "n"].includes(raw)) return false;
  return fallback;
}

function asOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new ForgeError("VALIDATION_FAILED", "Invalid date");
  return d;
}

function asJsonArray(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return [];
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const MAX_REPORT_RECIPIENTS = 25;
/** Resend caps a message at 40 MB after base64 encoding. */
const MAX_REPORT_PDF_BYTES = 25 * 1024 * 1024;
const REPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ReportPersonnel = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  email: string | null;
  companyEmail: string | null;
};

function personnelReportEmail(person: ReportPersonnel): string | null {
  for (const candidate of [person.companyEmail, person.email]) {
    const email = candidate?.trim() ?? "";
    if (REPORT_EMAIL_RE.test(email)) return email;
  }
  return null;
}

function personnelReportName(person: ReportPersonnel): string {
  const first = person.preferredName?.trim() || person.firstName?.trim() || "";
  const full = [first, person.lastName?.trim() ?? ""].filter(Boolean).join(" ");
  return full || person.displayName?.trim() || "Unnamed";
}

function mmToInches(mm: number): number {
  return mm / 25.4;
}

function toDustInches(depth: number, unit: string): number {
  const u = unit.toUpperCase();
  if (u === "MM" || u === "MILLIMETERS") return mmToInches(depth);
  return depth;
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function randomQrToken(): string {
  return randomBytes(24).toString("base64url");
}

function escapeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function avgScore(scores: Array<number | null | undefined>): number | null {
  const vals = scores.filter((s): s is number => s != null && Number.isFinite(s));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function isPreopInspection(inspectionType: string | null | undefined, templateCategory?: string | null): boolean {
  const type = String(inspectionType ?? "").toUpperCase();
  const cat = String(templateCategory ?? "").toUpperCase();
  return type.includes("PREOP") || cat.includes("PREOP") || type.includes("PRE-OP") || cat.includes("PRE-OP");
}

function locationSanitationStatus(input: {
  criticalCount: number;
  majorCount: number;
  findingCount: number;
  dustAlertCount: number;
  pestCount: number;
}): "GOOD" | "ATTENTION" | "MAJOR" | "CRITICAL" {
  if (input.criticalCount > 0) return "CRITICAL";
  if (input.majorCount > 0 || input.dustAlertCount > 0) return "MAJOR";
  if (input.findingCount > 0 || input.pestCount > 0) return "ATTENTION";
  return "GOOD";
}

const STATIC_REGULATORY_REFS = [
  "OSHA 29 CFR 1910.272(j)",
  "OSHA 29 CFR 1910.272",
  "OSHA 29 CFR 1910.22",
  "FDA 21 CFR 117",
  "FDA FSMA Preventive Controls",
  "NFPA 61",
  "NFPA 652",
] as const;

async function countRecurringFindings(
  tx: DatabaseTransaction,
  tenantId: string,
  locationId: string | null | undefined,
  category: string | null | undefined,
  excludeFindingId?: string | null,
): Promise<number> {
  if (!locationId || !category) return 0;
  const since = daysAgo(90);
  const [row] = await tx
    .select({ c: count() })
    .from(industrialSanitationFindings)
    .where(
      and(
        eq(industrialSanitationFindings.tenantId, tenantId),
        isNull(industrialSanitationFindings.archivedAt),
        eq(industrialSanitationFindings.locationId, locationId),
        eq(industrialSanitationFindings.category, category),
        gte(industrialSanitationFindings.createdAt, since),
        excludeFindingId
          ? sql`${industrialSanitationFindings.id} <> ${excludeFindingId}`
          : undefined,
      ),
    );
  return Number(row?.c ?? 0);
}

function bumpDueDate(from: Date, frequency: string): Date {
  const next = new Date(from);
  const f = frequency.toUpperCase();
  if (f === "HOURLY") next.setHours(next.getHours() + 1);
  else if (f === "SHIFT") next.setHours(next.getHours() + 8);
  else if (f === "DAILY") next.setDate(next.getDate() + 1);
  else if (f === "WEEKLY") next.setDate(next.getDate() + 7);
  else if (f === "BIWEEKLY") next.setDate(next.getDate() + 14);
  else if (f === "MONTHLY") next.setMonth(next.getMonth() + 1);
  else if (f === "QUARTERLY") next.setMonth(next.getMonth() + 3);
  else if (f === "SEMIANNUAL" || f === "SEMI_ANNUAL") next.setMonth(next.getMonth() + 6);
  else if (f === "ANNUAL" || f === "YEARLY") next.setFullYear(next.getFullYear() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

function iso(d: Date | null | undefined): string | null {
  return d?.toISOString() ?? null;
}

function mapProfile(row: typeof industrialSanitationFacilityProfiles.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    facilityTypes: row.facilityTypes,
    complianceFrameworks: row.complianceFrameworks,
    dustActionThresholdInches: row.dustActionThresholdInches,
    dustMeasurementUnit: row.dustMeasurementUnit,
    priorityHousekeepingEnabled: row.priorityHousekeepingEnabled,
    independentVerificationRequired: row.independentVerificationRequired,
    settings: row.settings,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapZone(row: typeof industrialSanitationZones.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    code: row.code,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    isFoodContact: row.isFoodContact,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapLocation(
  row: typeof industrialSanitationLocations.$inferSelect,
  dept?: {
    name?: string | null;
    divisionName?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
  } | null,
) {
  return {
    id: row.id,
    siteId: row.siteId,
    zoneId: row.zoneId,
    departmentId: row.departmentId,
    departmentName: dept?.name ?? null,
    departmentDivisionName: dept?.divisionName ?? null,
    departmentContactName: dept?.contactName ?? null,
    departmentContactEmail: dept?.contactEmail ?? null,
    building: row.building,
    area: row.area,
    name: row.name,
    locationType: row.locationType,
    isPriorityHousekeeping: row.isPriorityHousekeeping,
    priorityReason: row.priorityReason,
    qrToken: row.qrToken,
    mapX: row.mapX,
    mapY: row.mapY,
    status: row.status,
    metadata: row.metadata,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function loadDepartmentForLocation(
  tx: DatabaseTransaction,
  tenantId: string,
  departmentId: string | null | undefined,
) {
  if (!departmentId) return null;
  const [dept] = await tx
    .select({
      name: industrialDepartments.name,
      divisionName: industrialDepartments.divisionName,
      contactName: industrialDepartments.contactName,
      contactEmail: industrialDepartments.contactEmail,
    })
    .from(industrialDepartments)
    .where(
      and(
        eq(industrialDepartments.id, departmentId),
        eq(industrialDepartments.tenantId, tenantId),
        isNull(industrialDepartments.archivedAt),
      ),
    )
    .limit(1);
  return dept ?? null;
}

function mapTemplate(row: typeof industrialSanitationTemplates.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ownershipScope: row.ownershipScope,
    code: row.code,
    name: row.name,
    category: row.category,
    description: row.description,
    versionNumber: row.versionNumber,
    facilityApplicability: row.facilityApplicability,
    templateJson: row.templateJson,
    scoringConfig: row.scoringConfig,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapInspection(row: typeof industrialSanitationInspections.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    departmentId: row.departmentId,
    locationId: row.locationId,
    zoneId: row.zoneId,
    equipmentId: row.equipmentId,
    templateId: row.templateId,
    templateVersion: row.templateVersion,
    inspectionNumber: row.inspectionNumber,
    inspectionType: row.inspectionType,
    title: row.title,
    status: row.status,
    complianceStatus: row.complianceStatus,
    scorePercent: row.scorePercent,
    severityMax: row.severityMax,
    inspectorPersonnelId: row.inspectorPersonnelId,
    inspectorUserId: row.inspectorUserId,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    shift: row.shift,
    productLine: row.productLine,
    productionOrder: row.productionOrder,
    responsesJson: row.responsesJson,
    summaryJson: row.summaryJson,
    signaturesJson: row.signaturesJson,
    offlineClientId: row.offlineClientId,
    parentInspectionId: row.parentInspectionId,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapFinding(row: typeof industrialSanitationFindings.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    inspectionId: row.inspectionId,
    locationId: row.locationId,
    zoneId: row.zoneId,
    equipmentId: row.equipmentId,
    findingNumber: row.findingNumber,
    category: row.category,
    subcategory: row.subcategory,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    questionKey: row.questionKey,
    regulationRefs: row.regulationRefs,
    photosJson: row.photosJson,
    isRecurring: row.isRecurring,
    recurrenceCount: row.recurrenceCount,
    stopWork: row.stopWork,
    productHold: row.productHold,
    correctiveActionId: row.correctiveActionId,
    reportedByUserId: row.reportedByUserId,
    closedAt: iso(row.closedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapDust(row: typeof industrialSanitationDustMeasurements.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    inspectionId: row.inspectionId,
    findingId: row.findingId,
    locationId: row.locationId,
    measurementNumber: row.measurementNumber,
    surface: row.surface,
    measurementPoint: row.measurementPoint,
    dustDepth: row.dustDepth,
    unit: row.unit,
    dustDepthInches: row.dustDepthInches,
    measurementMethod: row.measurementMethod,
    exceedsActionLevel: row.exceedsActionLevel,
    actionThresholdInches: row.actionThresholdInches,
    isPriorityArea: row.isPriorityArea,
    measuredAt: iso(row.measuredAt),
    photosJson: row.photosJson,
    comments: row.comments,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapMss(row: typeof industrialSanitationMasterSchedule.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    departmentId: row.departmentId,
    locationId: row.locationId,
    zoneId: row.zoneId,
    equipmentId: row.equipmentId,
    title: row.title,
    cleaningTask: row.cleaningTask,
    cleaningProcedure: row.cleaningProcedure,
    frequency: row.frequency,
    frequencyCustom: row.frequencyCustom,
    cleaningMethod: row.cleaningMethod,
    assignedDepartmentId: row.assignedDepartmentId,
    assignedPersonnelId: row.assignedPersonnelId,
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    requiredShutdown: row.requiredShutdown,
    lotoRequired: row.lotoRequired,
    confinedSpaceRequired: row.confinedSpaceRequired,
    ppeRequired: row.ppeRequired,
    chemicalsRequired: row.chemicalsRequired,
    toolsRequired: row.toolsRequired,
    foodContactSurface: row.foodContactSurface,
    allergenConcern: row.allergenConcern,
    dustHazard: row.dustHazard,
    verificationRequired: row.verificationRequired,
    verificationMethod: row.verificationMethod,
    nextDueAt: iso(row.nextDueAt),
    lastCompletedAt: iso(row.lastCompletedAt),
    status: row.status,
    revisionNumber: row.revisionNumber,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapCleaningTask(row: typeof industrialSanitationCleaningTasks.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    masterScheduleId: row.masterScheduleId,
    locationId: row.locationId,
    zoneId: row.zoneId,
    equipmentId: row.equipmentId,
    taskNumber: row.taskNumber,
    title: row.title,
    status: row.status,
    dueAt: iso(row.dueAt),
    assignedPersonnelId: row.assignedPersonnelId,
    assignedUserId: row.assignedUserId,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    chemicalsUsed: row.chemicalsUsed,
    equipmentUsed: row.equipmentUsed,
    beforePhotosJson: row.beforePhotosJson,
    afterPhotosJson: row.afterPhotosJson,
    issuesFound: row.issuesFound,
    notes: row.notes,
    cleanerSignatureJson: row.cleanerSignatureJson,
    verificationRequired: row.verificationRequired,
    lotoRequired: row.lotoRequired,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapVerification(row: typeof industrialSanitationVerifications.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    cleaningTaskId: row.cleaningTaskId,
    inspectionId: row.inspectionId,
    findingId: row.findingId,
    method: row.method,
    result: row.result,
    verifiedByUserId: row.verifiedByUserId,
    verifiedByPersonnelId: row.verifiedByPersonnelId,
    verifiedAt: iso(row.verifiedAt),
    notes: row.notes,
    photosJson: row.photosJson,
    resultData: row.resultData,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapSpill(row: typeof industrialSanitationSpills.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    locationId: row.locationId,
    spillNumber: row.spillNumber,
    building: row.building,
    area: row.area,
    exactLocation: row.exactLocation,
    product: row.product,
    estimatedQuantity: row.estimatedQuantity,
    cause: row.cause,
    equipmentInvolved: row.equipmentInvolved,
    slipFallHazard: row.slipFallHazard,
    dustHazard: row.dustHazard,
    contaminationConcern: row.contaminationConcern,
    pestConcern: row.pestConcern,
    productionImpact: row.productionImpact,
    status: row.status,
    photosJson: row.photosJson,
    actionsJson: row.actionsJson,
    reportedByUserId: row.reportedByUserId,
    reportedAt: iso(row.reportedAt),
    cleanedAt: iso(row.cleanedAt),
    verifiedAt: iso(row.verifiedAt),
    correctiveActionId: row.correctiveActionId,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapPestDevice(row: typeof industrialSanitationPestDevices.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    locationId: row.locationId,
    zoneId: row.zoneId,
    deviceNumber: row.deviceNumber,
    qrToken: row.qrToken,
    deviceType: row.deviceType,
    pestType: row.pestType,
    building: row.building,
    area: row.area,
    mapX: row.mapX,
    mapY: row.mapY,
    serviceFrequency: row.serviceFrequency,
    vendor: row.vendor,
    lastInspectedAt: iso(row.lastInspectedAt),
    nextInspectionAt: iso(row.nextInspectionAt),
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapPestFinding(row: typeof industrialSanitationPestFindings.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    deviceId: row.deviceId,
    locationId: row.locationId,
    inspectionId: row.inspectionId,
    pestSpecies: row.pestSpecies,
    pestCategory: row.pestCategory,
    numberObserved: row.numberObserved,
    activityLevel: row.activityLevel,
    evidence: row.evidence,
    droppings: row.droppings,
    nesting: row.nesting,
    entryPoint: row.entryPoint,
    productExposure: row.productExposure,
    photosJson: row.photosJson,
    status: row.status,
    observedAt: iso(row.observedAt),
    reportedByUserId: row.reportedByUserId,
    correctiveActionId: row.correctiveActionId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapChemical(row: typeof industrialSanitationChemicals.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    manufacturer: row.manufacturer,
    sdsDocumentId: row.sdsDocumentId,
    intendedUse: row.intendedUse,
    approvedAreas: row.approvedAreas,
    restrictedAreas: row.restrictedAreas,
    concentration: row.concentration,
    applicationMethod: row.applicationMethod,
    contactTime: row.contactTime,
    ppeRequired: row.ppeRequired,
    foodContactApproved: row.foodContactApproved,
    storageLocation: row.storageLocation,
    expirationDate: iso(row.expirationDate),
    lotNumber: row.lotNumber,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapEnvSample(row: typeof industrialSanitationEnvironmentalSamples.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    locationId: row.locationId,
    zoneId: row.zoneId,
    sampleNumber: row.sampleNumber,
    samplePoint: row.samplePoint,
    sampleType: row.sampleType,
    testName: row.testName,
    collectedAt: iso(row.collectedAt),
    collectedByUserId: row.collectedByUserId,
    laboratory: row.laboratory,
    lotBatch: row.lotBatch,
    result: row.result,
    resultUnits: row.resultUnits,
    detectionLimit: row.detectionLimit,
    passFail: row.passFail,
    attachmentsJson: row.attachmentsJson,
    correctiveActionId: row.correctiveActionId,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapCompressedAir(row: typeof industrialSanitationCompressedAirRequests.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    locationId: row.locationId,
    requestNumber: row.requestNumber,
    areaIdentified: row.areaIdentified,
    cleaningReason: row.cleaningReason,
    equipmentStatusConfirmed: row.equipmentStatusConfirmed,
    ignitionSourcesAddressed: row.ignitionSourcesAddressed,
    otherIgnitionControlled: row.otherIgnitionControlled,
    ppeConfirmed: row.ppeConfirmed,
    areaBarricaded: row.areaBarricaded,
    dustCollectionReviewed: row.dustCollectionReviewed,
    status: row.status,
    requestedByUserId: row.requestedByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: iso(row.approvedAt),
    completedAt: iso(row.completedAt),
    verifiedAt: iso(row.verifiedAt),
    denialReason: row.denialReason,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapConcern(row: typeof industrialSanitationConcernReports.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    locationId: row.locationId,
    concernType: row.concernType,
    description: row.description,
    photosJson: row.photosJson,
    status: row.status,
    routedDepartmentId: row.routedDepartmentId,
    findingId: row.findingId,
    reportedByUserId: row.reportedByUserId,
    reportedAt: iso(row.reportedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function severityRank(s: string): number {
  const u = s.toUpperCase();
  if (u === "CRITICAL") return 3;
  if (u === "MAJOR") return 2;
  if (u === "MINOR") return 1;
  return 0;
}

function maxSeverity(a: string | null, b: string): string {
  if (!a) return b;
  return severityRank(b) > severityRank(a) ? b : a;
}

@Injectable()
export class IndustrialSanitationService {
  private readonly logger = new Logger(IndustrialSanitationService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  private async nextNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    key: string,
    prefix: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const [existing] = await tx
      .select()
      .from(industrialSanitationSequenceCounters)
      .where(
        and(
          eq(industrialSanitationSequenceCounters.tenantId, tenantId),
          eq(industrialSanitationSequenceCounters.sequenceKey, key),
          eq(industrialSanitationSequenceCounters.year, year),
        ),
      )
      .limit(1);

    let nextVal: number;
    if (existing) {
      nextVal = existing.lastValue + 1;
      await tx
        .update(industrialSanitationSequenceCounters)
        .set({ lastValue: nextVal, updatedAt: new Date() })
        .where(eq(industrialSanitationSequenceCounters.id, existing.id));
    } else {
      nextVal = 1;
      await tx.insert(industrialSanitationSequenceCounters).values({
        id: createId(),
        tenantId,
        sequenceKey: key,
        year,
        lastValue: nextVal,
        updatedAt: new Date(),
      });
    }
    return `${prefix}-${year}-${String(nextVal).padStart(6, "0")}`;
  }

  private async createCorrectiveAction(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      siteId: string | null;
      parentEntityType: string;
      parentEntityId: string;
      title: string;
      description?: string | null;
      finding?: string | null;
      priority?: string | null;
      sourcePayload?: Record<string, unknown>;
    },
  ): Promise<string> {
    const caId = createId();
    const now = new Date();
    await tx.insert(industrialCorrectiveActions).values({
      id: caId,
      tenantId: input.tenantId,
      siteId: input.siteId,
      parentEntityType: input.parentEntityType,
      parentEntityId: input.parentEntityId,
      title: input.title.slice(0, 500),
      description: input.description ?? null,
      finding: input.finding ?? null,
      requiredAction: "Correct the finding and close out with evidence.",
      priority: input.priority ?? null,
      status: "OPEN",
      sourceSystem: "FORGE",
      sourcePayload: input.sourcePayload ?? {},
      createdAt: now,
      updatedAt: now,
    } as never);
    return caId;
  }

  // ── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const sevenDaysAgo = daysAgo(7);
    const thirtyDaysAgo = daysAgo(30);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const siteFilter = siteId
        ? eq(industrialSanitationInspections.siteId, siteId)
        : undefined;

      const [todayInspections] = await tx
        .select({ c: count() })
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            gte(industrialSanitationInspections.startedAt, todayStart),
            lte(industrialSanitationInspections.startedAt, todayEnd),
            siteFilter,
          ),
        );

      const [inspectionsPassed] = await tx
        .select({ c: count() })
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            eq(industrialSanitationInspections.complianceStatus, "PASS"),
            gte(industrialSanitationInspections.completedAt, todayStart),
            siteFilter,
          ),
        );

      const [inspectionsFailed] = await tx
        .select({ c: count() })
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            inArray(industrialSanitationInspections.complianceStatus, [
              "FAIL",
              "CRITICAL_FAIL",
            ]),
            gte(industrialSanitationInspections.completedAt, todayStart),
            siteFilter,
          ),
        );

      const findingSite = siteId ? eq(industrialSanitationFindings.siteId, siteId) : undefined;
      const [openCriticalFindings] = await tx
        .select({ c: count() })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.status, "OPEN"),
            eq(industrialSanitationFindings.severity, "CRITICAL"),
            findingSite,
          ),
        );

      const [overdueCorrectiveActions] = await tx
        .select({ c: count() })
        .from(industrialCorrectiveActions)
        .where(
          and(
            eq(industrialCorrectiveActions.tenantId, tenantId),
            isNull(industrialCorrectiveActions.archivedAt),
            eq(industrialCorrectiveActions.status, "OPEN"),
            sql`${industrialCorrectiveActions.parentEntityType} like 'SANITATION_%'`,
            siteId ? eq(industrialCorrectiveActions.siteId, siteId) : undefined,
          ),
        );

      const [overdueCleaningTasks] = await tx
        .select({ c: count() })
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
            inArray(industrialSanitationCleaningTasks.status, [
              "SCHEDULED",
              "ASSIGNED",
              "IN_PROGRESS",
              "OVERDUE",
              "RECLEAN_REQUIRED",
            ]),
            lte(industrialSanitationCleaningTasks.dueAt, now),
            siteId ? eq(industrialSanitationCleaningTasks.siteId, siteId) : undefined,
          ),
        );

      const [dustHousekeepingAlerts] = await tx
        .select({ c: count() })
        .from(industrialSanitationDustMeasurements)
        .where(
          and(
            eq(industrialSanitationDustMeasurements.tenantId, tenantId),
            isNull(industrialSanitationDustMeasurements.archivedAt),
            eq(industrialSanitationDustMeasurements.exceedsActionLevel, true),
            gte(industrialSanitationDustMeasurements.measuredAt, sevenDaysAgo),
            siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
          ),
        );

      const [pestFindings] = await tx
        .select({ c: count() })
        .from(industrialSanitationPestFindings)
        .where(
          and(
            eq(industrialSanitationPestFindings.tenantId, tenantId),
            isNull(industrialSanitationPestFindings.archivedAt),
            eq(industrialSanitationPestFindings.status, "OPEN"),
            siteId ? eq(industrialSanitationPestFindings.siteId, siteId) : undefined,
          ),
        );

      const [mssActive] = await tx
        .select({ c: count() })
        .from(industrialSanitationMasterSchedule)
        .where(
          and(
            eq(industrialSanitationMasterSchedule.tenantId, tenantId),
            isNull(industrialSanitationMasterSchedule.archivedAt),
            eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
            siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
          ),
        );

      const [mssOnTime] = await tx
        .select({ c: count() })
        .from(industrialSanitationMasterSchedule)
        .where(
          and(
            eq(industrialSanitationMasterSchedule.tenantId, tenantId),
            isNull(industrialSanitationMasterSchedule.archivedAt),
            eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
            or(
              isNull(industrialSanitationMasterSchedule.nextDueAt),
              gte(industrialSanitationMasterSchedule.nextDueAt, now),
            ),
            siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
          ),
        );

      const mssCompletionPercent =
        (mssActive?.c ?? 0) === 0
          ? 100
          : Math.round(((mssOnTime?.c ?? 0) / (mssActive?.c ?? 1)) * 1000) / 10;

      const scoreRows = await tx
        .select({ score: industrialSanitationInspections.scorePercent })
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            eq(industrialSanitationInspections.status, "COMPLETED"),
            gte(industrialSanitationInspections.completedAt, thirtyDaysAgo),
            siteFilter,
          ),
        );
      const scores = scoreRows
        .map((r) => r.score)
        .filter((s): s is number => s != null && Number.isFinite(s));
      const sanitationCompliancePercent =
        scores.length === 0
          ? null
          : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

      const recentInspections = await tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            siteFilter,
          ),
        )
        .orderBy(desc(industrialSanitationInspections.createdAt))
        .limit(10);

      const openFindings = await tx
        .select()
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.status, "OPEN"),
            inArray(industrialSanitationFindings.severity, ["CRITICAL", "MAJOR"]),
            findingSite,
          ),
        )
        .orderBy(desc(industrialSanitationFindings.createdAt))
        .limit(20);

      const todayCleaningSchedule = await tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
            gte(industrialSanitationCleaningTasks.dueAt, todayStart),
            lte(industrialSanitationCleaningTasks.dueAt, todayEnd),
            siteId ? eq(industrialSanitationCleaningTasks.siteId, siteId) : undefined,
          ),
        )
        .orderBy(industrialSanitationCleaningTasks.dueAt)
        .limit(50);

      const prevWeekStart = daysAgo(14);
      const prevWeekEnd = daysAgo(7);
      const prevMonthStart = daysAgo(60);
      const prevMonthEnd = daysAgo(30);

      const prevWeekScores = await tx
        .select({ score: industrialSanitationInspections.scorePercent })
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            eq(industrialSanitationInspections.status, "COMPLETED"),
            gte(industrialSanitationInspections.completedAt, prevWeekStart),
            lte(industrialSanitationInspections.completedAt, prevWeekEnd),
            siteFilter,
          ),
        );
      const prevMonthScores = await tx
        .select({ score: industrialSanitationInspections.scorePercent })
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            eq(industrialSanitationInspections.status, "COMPLETED"),
            gte(industrialSanitationInspections.completedAt, prevMonthStart),
            lte(industrialSanitationInspections.completedAt, prevMonthEnd),
            siteFilter,
          ),
        );

      const recurringRows = await tx
        .select()
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.isRecurring, true),
            findingSite,
          ),
        )
        .orderBy(desc(industrialSanitationFindings.recurrenceCount))
        .limit(5);

      const openFindingsForAreas = await tx
        .select({
          locationId: industrialSanitationFindings.locationId,
          locationName: industrialSanitationLocations.name,
          severity: industrialSanitationFindings.severity,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .leftJoin(
          industrialSanitationLocations,
          eq(industrialSanitationLocations.id, industrialSanitationFindings.locationId),
        )
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.status, "OPEN"),
            findingSite,
          ),
        )
        .groupBy(
          industrialSanitationFindings.locationId,
          industrialSanitationLocations.name,
          industrialSanitationFindings.severity,
        );

      const areaAgg = new Map<
        string,
        { locationId: string | null; locationName: string; findingCount: number; criticalCount: number }
      >();
      for (const row of openFindingsForAreas) {
        const key = row.locationId ?? "none";
        const cur = areaAgg.get(key) ?? {
          locationId: row.locationId,
          locationName: row.locationName ?? "Unassigned",
          findingCount: 0,
          criticalCount: 0,
        };
        cur.findingCount += Number(row.c ?? 0);
        if (String(row.severity).toUpperCase() === "CRITICAL") {
          cur.criticalCount += Number(row.c ?? 0);
        }
        areaAgg.set(key, cur);
      }
      const worstAreas = [...areaAgg.values()]
        .sort((a, b) => b.criticalCount - a.criticalCount || b.findingCount - a.findingCount)
        .slice(0, 5);

      const openCas = await tx
        .select({
          dueDate: industrialCorrectiveActions.dueDate,
          createdAt: industrialCorrectiveActions.createdAt,
        })
        .from(industrialCorrectiveActions)
        .where(
          and(
            eq(industrialCorrectiveActions.tenantId, tenantId),
            isNull(industrialCorrectiveActions.archivedAt),
            eq(industrialCorrectiveActions.status, "OPEN"),
            sql`${industrialCorrectiveActions.parentEntityType} like 'SANITATION_%'`,
            siteId ? eq(industrialCorrectiveActions.siteId, siteId) : undefined,
          ),
        );
      const correctiveActionAging = [
        { label: "0-7 days", bucket: "d0_7", count: 0 },
        { label: "8-14 days", bucket: "d8_14", count: 0 },
        { label: "15-30 days", bucket: "d15_30", count: 0 },
        { label: "31-60 days", bucket: "d31_60", count: 0 },
        { label: "60+ days", bucket: "d60plus", count: 0 },
      ];
      for (const ca of openCas) {
        const anchor = ca.dueDate ? new Date(String(ca.dueDate)) : ca.createdAt;
        const ageDays = Math.max(
          0,
          Math.floor((now.getTime() - new Date(anchor).getTime()) / (24 * 60 * 60 * 1000)),
        );
        if (ageDays <= 7) correctiveActionAging[0]!.count += 1;
        else if (ageDays <= 14) correctiveActionAging[1]!.count += 1;
        else if (ageDays <= 30) correctiveActionAging[2]!.count += 1;
        else if (ageDays <= 60) correctiveActionAging[3]!.count += 1;
        else correctiveActionAging[4]!.count += 1;
      }

      let multiSiteComparison: Array<{
        siteId: string;
        siteName: string;
        score: number | null;
        critical: number;
        overdue: number;
        mssCompletion: number;
      }> = [];
      if (!siteId) {
        const sites = await tx
          .select({ id: industrialSites.id, name: industrialSites.name })
          .from(industrialSites)
          .where(
            and(eq(industrialSites.tenantId, tenantId), isNull(industrialSites.archivedAt)),
          )
          .limit(50);
        for (const site of sites) {
          const siteScores = await tx
            .select({ score: industrialSanitationInspections.scorePercent })
            .from(industrialSanitationInspections)
            .where(
              and(
                eq(industrialSanitationInspections.tenantId, tenantId),
                isNull(industrialSanitationInspections.archivedAt),
                eq(industrialSanitationInspections.status, "COMPLETED"),
                eq(industrialSanitationInspections.siteId, site.id),
                gte(industrialSanitationInspections.completedAt, thirtyDaysAgo),
              ),
            );
          const [crit] = await tx
            .select({ c: count() })
            .from(industrialSanitationFindings)
            .where(
              and(
                eq(industrialSanitationFindings.tenantId, tenantId),
                isNull(industrialSanitationFindings.archivedAt),
                eq(industrialSanitationFindings.status, "OPEN"),
                eq(industrialSanitationFindings.severity, "CRITICAL"),
                eq(industrialSanitationFindings.siteId, site.id),
              ),
            );
          const [overdue] = await tx
            .select({ c: count() })
            .from(industrialSanitationCleaningTasks)
            .where(
              and(
                eq(industrialSanitationCleaningTasks.tenantId, tenantId),
                isNull(industrialSanitationCleaningTasks.archivedAt),
                inArray(industrialSanitationCleaningTasks.status, [
                  "SCHEDULED",
                  "ASSIGNED",
                  "IN_PROGRESS",
                  "OVERDUE",
                  "RECLEAN_REQUIRED",
                ]),
                lte(industrialSanitationCleaningTasks.dueAt, now),
                eq(industrialSanitationCleaningTasks.siteId, site.id),
              ),
            );
          const [mssA] = await tx
            .select({ c: count() })
            .from(industrialSanitationMasterSchedule)
            .where(
              and(
                eq(industrialSanitationMasterSchedule.tenantId, tenantId),
                isNull(industrialSanitationMasterSchedule.archivedAt),
                eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
                eq(industrialSanitationMasterSchedule.siteId, site.id),
              ),
            );
          const [mssO] = await tx
            .select({ c: count() })
            .from(industrialSanitationMasterSchedule)
            .where(
              and(
                eq(industrialSanitationMasterSchedule.tenantId, tenantId),
                isNull(industrialSanitationMasterSchedule.archivedAt),
                eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
                or(
                  isNull(industrialSanitationMasterSchedule.nextDueAt),
                  gte(industrialSanitationMasterSchedule.nextDueAt, now),
                ),
                eq(industrialSanitationMasterSchedule.siteId, site.id),
              ),
            );
          const mssPct =
            (mssA?.c ?? 0) === 0
              ? 100
              : Math.round(((mssO?.c ?? 0) / (mssA?.c ?? 1)) * 1000) / 10;
          multiSiteComparison.push({
            siteId: site.id,
            siteName: site.name,
            score: avgScore(siteScores.map((r) => r.score)),
            critical: Number(crit?.c ?? 0),
            overdue: Number(overdue?.c ?? 0),
            mssCompletion: mssPct,
          });
        }
      }

      const heatLocations = await tx
        .select({
          id: industrialSanitationLocations.id,
        })
        .from(industrialSanitationLocations)
        .where(
          and(
            eq(industrialSanitationLocations.tenantId, tenantId),
            isNull(industrialSanitationLocations.archivedAt),
            siteId ? eq(industrialSanitationLocations.siteId, siteId) : undefined,
          ),
        )
        .limit(500);

      const openFindingsByLoc = await tx
        .select({
          locationId: industrialSanitationFindings.locationId,
          severity: industrialSanitationFindings.severity,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.status, "OPEN"),
            findingSite,
          ),
        )
        .groupBy(industrialSanitationFindings.locationId, industrialSanitationFindings.severity);

      const dustByLoc = await tx
        .select({
          locationId: industrialSanitationDustMeasurements.locationId,
          c: count(),
        })
        .from(industrialSanitationDustMeasurements)
        .where(
          and(
            eq(industrialSanitationDustMeasurements.tenantId, tenantId),
            isNull(industrialSanitationDustMeasurements.archivedAt),
            eq(industrialSanitationDustMeasurements.exceedsActionLevel, true),
            gte(industrialSanitationDustMeasurements.measuredAt, sevenDaysAgo),
            siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
          ),
        )
        .groupBy(industrialSanitationDustMeasurements.locationId);

      const pestByLoc = await tx
        .select({
          locationId: industrialSanitationPestFindings.locationId,
          c: count(),
        })
        .from(industrialSanitationPestFindings)
        .where(
          and(
            eq(industrialSanitationPestFindings.tenantId, tenantId),
            isNull(industrialSanitationPestFindings.archivedAt),
            eq(industrialSanitationPestFindings.status, "OPEN"),
            siteId ? eq(industrialSanitationPestFindings.siteId, siteId) : undefined,
          ),
        )
        .groupBy(industrialSanitationPestFindings.locationId);

      const findingStats = new Map<string, { findingCount: number; criticalCount: number; majorCount: number }>();
      for (const row of openFindingsByLoc) {
        if (!row.locationId) continue;
        const cur = findingStats.get(row.locationId) ?? {
          findingCount: 0,
          criticalCount: 0,
          majorCount: 0,
        };
        const n = Number(row.c ?? 0);
        cur.findingCount += n;
        if (String(row.severity).toUpperCase() === "CRITICAL") cur.criticalCount += n;
        if (String(row.severity).toUpperCase() === "MAJOR") cur.majorCount += n;
        findingStats.set(row.locationId, cur);
      }
      const dustMap = new Map(
        dustByLoc.filter((r) => r.locationId).map((r) => [r.locationId as string, Number(r.c ?? 0)]),
      );
      const pestMap = new Map(
        pestByLoc.filter((r) => r.locationId).map((r) => [r.locationId as string, Number(r.c ?? 0)]),
      );

      const heatMapSummary = { GOOD: 0, ATTENTION: 0, MAJOR: 0, CRITICAL: 0, total: heatLocations.length };
      for (const loc of heatLocations) {
        const stats = findingStats.get(loc.id) ?? {
          findingCount: 0,
          criticalCount: 0,
          majorCount: 0,
        };
        const status = locationSanitationStatus({
          ...stats,
          dustAlertCount: dustMap.get(loc.id) ?? 0,
          pestCount: pestMap.get(loc.id) ?? 0,
        });
        heatMapSummary[status] += 1;
      }

      return {
        todayInspections: todayInspections?.c ?? 0,
        inspectionsPassed: inspectionsPassed?.c ?? 0,
        inspectionsFailed: inspectionsFailed?.c ?? 0,
        openCriticalFindings: openCriticalFindings?.c ?? 0,
        overdueCorrectiveActions: overdueCorrectiveActions?.c ?? 0,
        overdueCleaningTasks: overdueCleaningTasks?.c ?? 0,
        dustHousekeepingAlerts: dustHousekeepingAlerts?.c ?? 0,
        pestFindings: pestFindings?.c ?? 0,
        mssCompletionPercent,
        sanitationCompliancePercent,
        facilityScorecard: {
          current: sanitationCompliancePercent,
          prevWeek: avgScore(prevWeekScores.map((r) => r.score)),
          prevMonth: avgScore(prevMonthScores.map((r) => r.score)),
        },
        recurringFindings: recurringRows.map(mapFinding),
        worstAreas,
        correctiveActionAging,
        multiSiteComparison,
        heatMapSummary,
        recentInspections: recentInspections.map(mapInspection),
        openFindings: openFindings.map(mapFinding),
        todayCleaningSchedule: todayCleaningSchedule.map(mapCleaningTask),
      };
    });
  }

  // ── Profiles ─────────────────────────────────────────────────────────────

  async listProfiles(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationFacilityProfiles)
        .where(
          and(
            eq(industrialSanitationFacilityProfiles.tenantId, tenantId),
            isNull(industrialSanitationFacilityProfiles.archivedAt),
            siteId ? eq(industrialSanitationFacilityProfiles.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationFacilityProfiles.updatedAt)),
    );
    return { items: rows.map(mapProfile) };
  }

  async upsertProfile(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const siteId = asRequiredUuid(body.siteId, "siteId");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationFacilityProfiles)
        .where(
          and(
            eq(industrialSanitationFacilityProfiles.tenantId, tenantId),
            eq(industrialSanitationFacilityProfiles.siteId, siteId),
            isNull(industrialSanitationFacilityProfiles.archivedAt),
          ),
        )
        .limit(1);

      if (existing) {
        const patch: Partial<typeof industrialSanitationFacilityProfiles.$inferInsert> = {
          updatedAt: now,
          updatedByUserId: principal.userId ?? null,
        };
        if (body.facilityTypes != null) patch.facilityTypes = asJsonArray(body.facilityTypes);
        if (body.complianceFrameworks != null) {
          patch.complianceFrameworks = asJsonArray(body.complianceFrameworks);
        }
        if (body.dustActionThresholdInches != null) {
          patch.dustActionThresholdInches = Number(body.dustActionThresholdInches);
        }
        if (body.dustMeasurementUnit != null) {
          patch.dustMeasurementUnit = asRequiredString(body.dustMeasurementUnit, "dustMeasurementUnit", 16);
        }
        if (body.priorityHousekeepingEnabled != null) {
          patch.priorityHousekeepingEnabled = asBool(body.priorityHousekeepingEnabled);
        }
        if (body.independentVerificationRequired != null) {
          patch.independentVerificationRequired = asBool(body.independentVerificationRequired);
        }
        if (body.settings != null) {
          const previous =
            existing.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings)
              ? (existing.settings as Record<string, unknown>)
              : {};
          patch.settings = { ...previous, ...asJsonObject(body.settings) };
        }
        if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);

        const [row] = await tx
          .update(industrialSanitationFacilityProfiles)
          .set(patch)
          .where(eq(industrialSanitationFacilityProfiles.id, existing.id))
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update profile");
        return mapProfile(row);
      }

      const id = createId();
      const [row] = await tx
        .insert(industrialSanitationFacilityProfiles)
        .values({
          id,
          tenantId,
          siteId,
          facilityTypes: asJsonArray(body.facilityTypes),
          complianceFrameworks: asJsonArray(body.complianceFrameworks),
          dustActionThresholdInches:
            body.dustActionThresholdInches != null
              ? Number(body.dustActionThresholdInches)
              : 0.125,
          dustMeasurementUnit: asOptionalString(body.dustMeasurementUnit, 16) ?? "INCHES",
          priorityHousekeepingEnabled: asBool(body.priorityHousekeepingEnabled, false),
          independentVerificationRequired: asBool(body.independentVerificationRequired, true),
          settings: asJsonObject(body.settings),
          status: asOptionalString(body.status, 64) ?? "ACTIVE",
          createdByUserId: principal.userId ?? null,
          updatedByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create profile");
      return mapProfile(row);
    });
  }

  // ── Zones ────────────────────────────────────────────────────────────────

  async listZones(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationZones)
        .where(
          and(
            eq(industrialSanitationZones.tenantId, tenantId),
            isNull(industrialSanitationZones.archivedAt),
            siteId ? eq(industrialSanitationZones.siteId, siteId) : undefined,
          ),
        )
        .orderBy(industrialSanitationZones.sortOrder, industrialSanitationZones.name),
    );
    return { items: rows.map(mapZone) };
  }

  async createZone(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const id = createId();
    const [row] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .insert(industrialSanitationZones)
        .values({
          id,
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          code: asOptionalString(body.code, 64),
          name: asRequiredString(body.name, "name", 300),
          description: asOptionalString(body.description, 4000),
          sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
          isFoodContact: asBool(body.isFoodContact),
          status: asOptionalString(body.status, 64) ?? "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create zone");
    return mapZone(row);
  }

  async updateZone(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const zoneId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationZones)
        .where(
          and(
            eq(industrialSanitationZones.id, zoneId),
            eq(industrialSanitationZones.tenantId, tenantId),
            isNull(industrialSanitationZones.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Zone not found");

      const patch: Partial<typeof industrialSanitationZones.$inferInsert> = { updatedAt: now };
      if (body.siteId !== undefined) patch.siteId = asOptionalUuid(body.siteId);
      if (body.code !== undefined) patch.code = asOptionalString(body.code, 64);
      if (body.name != null) patch.name = asRequiredString(body.name, "name", 300);
      if (body.description !== undefined) patch.description = asOptionalString(body.description, 4000);
      if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
        patch.sortOrder = Number(body.sortOrder);
      }
      if (body.isFoodContact != null) patch.isFoodContact = asBool(body.isFoodContact);
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);

      const [row] = await tx
        .update(industrialSanitationZones)
        .set(patch)
        .where(eq(industrialSanitationZones.id, zoneId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update zone");
      return mapZone(row);
    });
  }

  async archiveZone(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const zoneId = asRequiredUuid(id, "id");
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialSanitationZones.id })
        .from(industrialSanitationZones)
        .where(
          and(
            eq(industrialSanitationZones.id, zoneId),
            eq(industrialSanitationZones.tenantId, tenantId),
            isNull(industrialSanitationZones.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Zone not found");
      await tx
        .update(industrialSanitationZones)
        .set({ archivedAt: now, updatedAt: now, status: "ARCHIVED" })
        .where(eq(industrialSanitationZones.id, zoneId));
    });
    return { id: zoneId, archived: true };
  }

  // ── Locations ────────────────────────────────────────────────────────────

  async listLocations(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const zoneId = asOptionalUuid(query.zoneId);
    const departmentId = asOptionalUuid(query.departmentId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select({
          location: industrialSanitationLocations,
          departmentName: industrialDepartments.name,
          departmentDivisionName: industrialDepartments.divisionName,
          departmentContactName: industrialDepartments.contactName,
          departmentContactEmail: industrialDepartments.contactEmail,
        })
        .from(industrialSanitationLocations)
        .leftJoin(
          industrialDepartments,
          and(
            eq(industrialDepartments.id, industrialSanitationLocations.departmentId),
            eq(industrialDepartments.tenantId, tenantId),
            isNull(industrialDepartments.archivedAt),
          ),
        )
        .where(
          and(
            eq(industrialSanitationLocations.tenantId, tenantId),
            isNull(industrialSanitationLocations.archivedAt),
            siteId ? eq(industrialSanitationLocations.siteId, siteId) : undefined,
            zoneId ? eq(industrialSanitationLocations.zoneId, zoneId) : undefined,
            departmentId
              ? eq(industrialSanitationLocations.departmentId, departmentId)
              : undefined,
          ),
        )
        .orderBy(industrialSanitationLocations.name),
    );
    return {
      items: rows.map((r) =>
        mapLocation(r.location, {
          name: r.departmentName,
          divisionName: r.departmentDivisionName,
          contactName: r.departmentContactName,
          contactEmail: r.departmentContactEmail,
        }),
      ),
    };
  }

  async createLocation(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const id = createId();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(industrialSanitationLocations)
        .values({
          id,
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          zoneId: asOptionalUuid(body.zoneId),
          departmentId: asOptionalUuid(body.departmentId),
          building: asOptionalString(body.building, 200),
          area: asOptionalString(body.area, 300),
          name: asRequiredString(body.name, "name", 500),
          locationType: asOptionalString(body.locationType, 64) ?? "AREA",
          isPriorityHousekeeping: asBool(body.isPriorityHousekeeping),
          priorityReason: asOptionalString(body.priorityReason, 200),
          qrToken: asOptionalString(body.qrToken, 120),
          mapX: body.mapX != null && Number.isFinite(Number(body.mapX)) ? Number(body.mapX) : null,
          mapY: body.mapY != null && Number.isFinite(Number(body.mapY)) ? Number(body.mapY) : null,
          status: asOptionalString(body.status, 64) ?? "ACTIVE",
          metadata: asJsonObject(body.metadata),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create location");
      const dept = await loadDepartmentForLocation(tx, tenantId, row.departmentId);
      return mapLocation(row, dept);
    });
  }

  async updateLocation(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const locationId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationLocations)
        .where(
          and(
            eq(industrialSanitationLocations.id, locationId),
            eq(industrialSanitationLocations.tenantId, tenantId),
            isNull(industrialSanitationLocations.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Location not found");

      const patch: Partial<typeof industrialSanitationLocations.$inferInsert> = { updatedAt: now };
      if (body.siteId !== undefined) patch.siteId = asOptionalUuid(body.siteId);
      if (body.zoneId !== undefined) patch.zoneId = asOptionalUuid(body.zoneId);
      if (body.departmentId !== undefined) patch.departmentId = asOptionalUuid(body.departmentId);
      if (body.building !== undefined) patch.building = asOptionalString(body.building, 200);
      if (body.area !== undefined) patch.area = asOptionalString(body.area, 300);
      if (body.name != null) patch.name = asRequiredString(body.name, "name", 500);
      if (body.locationType != null) {
        patch.locationType = asRequiredString(body.locationType, "locationType", 64);
      }
      if (body.isPriorityHousekeeping != null) {
        patch.isPriorityHousekeeping = asBool(body.isPriorityHousekeeping);
      }
      if (body.priorityReason !== undefined) {
        patch.priorityReason = asOptionalString(body.priorityReason, 200);
      }
      if (body.qrToken !== undefined) patch.qrToken = asOptionalString(body.qrToken, 120);
      if (body.mapX !== undefined) {
        patch.mapX = body.mapX != null && Number.isFinite(Number(body.mapX)) ? Number(body.mapX) : null;
      }
      if (body.mapY !== undefined) {
        patch.mapY = body.mapY != null && Number.isFinite(Number(body.mapY)) ? Number(body.mapY) : null;
      }
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);
      if (body.metadata != null) patch.metadata = asJsonObject(body.metadata);

      const [row] = await tx
        .update(industrialSanitationLocations)
        .set(patch)
        .where(eq(industrialSanitationLocations.id, locationId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update location");
      const dept = await loadDepartmentForLocation(tx, tenantId, row.departmentId);
      return mapLocation(row, dept);
    });
  }

  async archiveLocation(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const locationId = asRequiredUuid(id, "id");
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialSanitationLocations.id })
        .from(industrialSanitationLocations)
        .where(
          and(
            eq(industrialSanitationLocations.id, locationId),
            eq(industrialSanitationLocations.tenantId, tenantId),
            isNull(industrialSanitationLocations.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Location not found");
      await tx
        .update(industrialSanitationLocations)
        .set({ archivedAt: now, updatedAt: now, status: "ARCHIVED" })
        .where(eq(industrialSanitationLocations.id, locationId));
    });
    return { id: locationId, archived: true };
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const category = asOptionalString(query.category, 120);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationTemplates)
        .where(
          and(
            isNull(industrialSanitationTemplates.archivedAt),
            or(
              isNull(industrialSanitationTemplates.tenantId),
              eq(industrialSanitationTemplates.tenantId, tenantId),
            ),
            category ? eq(industrialSanitationTemplates.category, category) : undefined,
          ),
        )
        .orderBy(industrialSanitationTemplates.category, industrialSanitationTemplates.name),
    );
    return { items: rows.map(mapTemplate) };
  }

  async ensureBuiltinTemplates(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(industrialSanitationTemplates)
        .where(
          and(
            isNull(industrialSanitationTemplates.archivedAt),
            or(
              isNull(industrialSanitationTemplates.tenantId),
              eq(industrialSanitationTemplates.tenantId, tenantId),
            ),
          ),
        );
      const byCode = new Map(
        existing
          .filter((r) => r.code && r.tenantId === tenantId)
          .map((r) => [r.code as string, r]),
      );
      let seeded = 0;
      let updated = 0;
      for (const t of DEFAULT_TEMPLATES) {
        const row = byCode.get(t.code);
        if (!row) {
          await tx.insert(industrialSanitationTemplates).values({
            id: createId(),
            tenantId,
            ownershipScope: "TENANT",
            code: t.code,
            name: t.name,
            category: t.category,
            description: t.description ?? null,
            versionNumber: 1,
            facilityApplicability: [],
            templateJson: { sections: t.sections },
            scoringConfig: {
              pass: 100,
              minor: -2,
              major: -10,
              critical: "FAIL",
            },
            status: "ACTIVE",
            createdByUserId: principal.userId ?? null,
            createdAt: now,
            updatedAt: now,
          });
          seeded += 1;
          continue;
        }
        // Refresh tenant builtin content when definition changes.
        const nextJson = JSON.stringify({ sections: t.sections });
        const prevJson = JSON.stringify(row.templateJson ?? {});
        const sameContent =
          row.name === t.name &&
          row.category === t.category &&
          (row.description ?? null) === (t.description ?? null) &&
          prevJson === nextJson;
        if (sameContent) continue;
        await tx
          .update(industrialSanitationTemplates)
          .set({
            name: t.name,
            category: t.category,
            description: t.description ?? null,
            templateJson: { sections: t.sections },
            versionNumber: Number(row.versionNumber ?? 1) + 1,
            updatedAt: now,
          })
          .where(eq(industrialSanitationTemplates.id, row.id));
        updated += 1;
      }
      if (seeded || updated) {
        this.logger.log(
          `Builtin sanitation templates: seeded=${seeded} updated=${updated}`,
        );
      }

      const all = await tx
        .select()
        .from(industrialSanitationTemplates)
        .where(
          and(
            isNull(industrialSanitationTemplates.archivedAt),
            or(
              isNull(industrialSanitationTemplates.tenantId),
              eq(industrialSanitationTemplates.tenantId, tenantId),
            ),
          ),
        )
        .orderBy(industrialSanitationTemplates.category, industrialSanitationTemplates.name);
      return { seeded, updated, items: all.map(mapTemplate) };
    });
  }

  async createTemplate(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const [row] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .insert(industrialSanitationTemplates)
        .values({
          id: createId(),
          tenantId,
          ownershipScope: "TENANT",
          code: asOptionalString(body.code, 120),
          name: asRequiredString(body.name, "name", 300),
          category: asOptionalString(body.category, 120) ?? "GENERAL",
          description: asOptionalString(body.description, 4000),
          versionNumber:
            body.versionNumber != null && Number.isFinite(Number(body.versionNumber))
              ? Number(body.versionNumber)
              : 1,
          facilityApplicability: asJsonArray(body.facilityApplicability),
          templateJson: asJsonObject(body.templateJson ?? { sections: body.sections ?? [] }),
          scoringConfig: asJsonObject(body.scoringConfig),
          status: asOptionalString(body.status, 64) ?? "ACTIVE",
          createdByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create template");
    return mapTemplate(row);
  }

  async updateTemplate(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const templateId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationTemplates)
        .where(
          and(
            eq(industrialSanitationTemplates.id, templateId),
            eq(industrialSanitationTemplates.tenantId, tenantId),
            eq(industrialSanitationTemplates.ownershipScope, "TENANT"),
            isNull(industrialSanitationTemplates.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Tenant template not found");

      const patch: Partial<typeof industrialSanitationTemplates.$inferInsert> = {
        updatedAt: now,
      };
      if (body.name != null) patch.name = asRequiredString(body.name, "name", 300);
      if (body.code !== undefined) patch.code = asOptionalString(body.code, 120);
      if (body.category != null) patch.category = asRequiredString(body.category, "category", 120);
      if (body.description !== undefined) {
        patch.description = asOptionalString(body.description, 4000);
      }
      if (body.templateJson != null) patch.templateJson = asJsonObject(body.templateJson);
      if (body.scoringConfig != null) patch.scoringConfig = asJsonObject(body.scoringConfig);
      if (body.facilityApplicability != null) {
        patch.facilityApplicability = asJsonArray(body.facilityApplicability);
      }
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);
      if (body.versionNumber != null && Number.isFinite(Number(body.versionNumber))) {
        patch.versionNumber = Number(body.versionNumber);
      }

      const [row] = await tx
        .update(industrialSanitationTemplates)
        .set(patch)
        .where(eq(industrialSanitationTemplates.id, templateId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update template");
      return mapTemplate(row);
    });
  }

  async archiveTemplate(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const templateId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationTemplates)
        .where(
          and(
            eq(industrialSanitationTemplates.id, templateId),
            eq(industrialSanitationTemplates.tenantId, tenantId),
            eq(industrialSanitationTemplates.ownershipScope, "TENANT"),
            isNull(industrialSanitationTemplates.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Tenant template not found");
      const [row] = await tx
        .update(industrialSanitationTemplates)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(eq(industrialSanitationTemplates.id, templateId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to archive template");
      return mapTemplate(row);
    });
  }

  // ── Inspections ──────────────────────────────────────────────────────────

  async listInspections(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const departmentId = asOptionalUuid(query.departmentId);
    const type = asOptionalString(query.type ?? query.inspectionType, 120);

    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
            status ? eq(industrialSanitationInspections.status, status) : undefined,
            siteId ? eq(industrialSanitationInspections.siteId, siteId) : undefined,
            departmentId
              ? eq(industrialSanitationInspections.departmentId, departmentId)
              : undefined,
            type ? eq(industrialSanitationInspections.inspectionType, type) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationInspections.createdAt))
        .limit(200),
    );
    return { items: rows.map(mapInspection) };
  }

  async getInspection(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const inspectionId = asRequiredUuid(id, "id");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.id, inspectionId),
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Inspection not found");

      const findings = await tx
        .select()
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            eq(industrialSanitationFindings.inspectionId, inspectionId),
            isNull(industrialSanitationFindings.archivedAt),
          ),
        )
        .orderBy(desc(industrialSanitationFindings.createdAt));

      return { ...mapInspection(row), findings: findings.map(mapFinding) };
    });
  }

  async startInspection(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const siteId = asRequiredUuid(body.siteId, "siteId");
    const templateId = asRequiredUuid(body.templateId, "templateId");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const offlineClientId = asOptionalString(body.offlineClientId, 120);
      if (offlineClientId) {
        const [dup] = await tx
          .select()
          .from(industrialSanitationInspections)
          .where(
            and(
              eq(industrialSanitationInspections.tenantId, tenantId),
              eq(industrialSanitationInspections.offlineClientId, offlineClientId),
            ),
          )
          .limit(1);
        if (dup) return mapInspection(dup);
      }

      const [template] = await tx
        .select()
        .from(industrialSanitationTemplates)
        .where(
          and(
            eq(industrialSanitationTemplates.id, templateId),
            isNull(industrialSanitationTemplates.archivedAt),
            or(
              isNull(industrialSanitationTemplates.tenantId),
              eq(industrialSanitationTemplates.tenantId, tenantId),
            ),
          ),
        )
        .limit(1);
      if (!template) throw new ForgeError("NOT_FOUND", "Template not found");

      const inspectionNumber = await this.nextNumber(tx, tenantId, "INSPECTION", "SAN");
      const title =
        asOptionalString(body.title, 500) ??
        `${template.name} — ${now.toISOString()}`;

      const [row] = await tx
        .insert(industrialSanitationInspections)
        .values({
          id: createId(),
          tenantId,
          siteId,
          departmentId: asOptionalUuid(body.departmentId),
          locationId: asOptionalUuid(body.locationId),
          zoneId: asOptionalUuid(body.zoneId),
          templateId: template.id,
          templateVersion: template.versionNumber,
          inspectionNumber,
          inspectionType:
            asOptionalString(body.inspectionType, 120) ?? template.category ?? "GENERAL",
          title,
          status: "IN_PROGRESS",
          inspectorUserId: principal.userId ?? null,
          startedAt: now,
          responsesJson: {},
          summaryJson: {},
          signaturesJson: [],
          offlineClientId,
          createdByUserId: principal.userId ?? null,
          updatedByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to start inspection");
      return mapInspection(row);
    });
  }

  async saveInspectionResponses(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const inspectionId = asRequiredUuid(id, "id");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.id, inspectionId),
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Inspection not found");
      if (existing.status === "COMPLETED") {
        throw new ForgeError("VALIDATION_FAILED", "Inspection is already completed");
      }

      const patch: Partial<typeof industrialSanitationInspections.$inferInsert> = {
        responsesJson: asJsonObject(body.responsesJson ?? body.responses),
        updatedAt: now,
        updatedByUserId: principal.userId ?? null,
      };
      if (body.summaryJson != null) patch.summaryJson = asJsonObject(body.summaryJson);

      const [row] = await tx
        .update(industrialSanitationInspections)
        .set(patch)
        .where(eq(industrialSanitationInspections.id, inspectionId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to save responses");
      return mapInspection(row);
    });
  }

  async completeInspection(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const inspectionId = asRequiredUuid(id, "id");
    const now = new Date();

    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.id, inspectionId),
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Inspection not found");
      if (existing.status === "COMPLETED") {
        throw new ForgeError("VALIDATION_FAILED", "Inspection is already completed");
      }

      const responses =
        body.responsesJson != null || body.responses != null
          ? asJsonObject(body.responsesJson ?? body.responses)
          : asJsonObject(existing.responsesJson);

      let templateQuestions: TemplateQuestion[] = [];
      let templateCategory: string | null = null;
      if (existing.templateId) {
        const [template] = await tx
          .select()
          .from(industrialSanitationTemplates)
          .where(eq(industrialSanitationTemplates.id, existing.templateId))
          .limit(1);
        templateCategory = template?.category ?? null;
        const tj = asJsonObject(template?.templateJson);
        const sections = Array.isArray(tj.sections) ? (tj.sections as TemplateSection[]) : [];
        templateQuestions = sections.flatMap((s) => s.questions ?? []);
      }
      const qById = new Map(templateQuestions.map((q) => [q.id, q]));
      const preop = isPreopInspection(existing.inspectionType, templateCategory);

      let score = 100;
      let severityMax: string | null = null;
      let criticalFail = false;
      const failItems: Array<{
        questionKey: string;
        label: string;
        severity: string;
        regulationRefs: unknown[];
        notes?: string;
        photos?: unknown[];
      }> = [];

      for (const [key, raw] of Object.entries(responses)) {
        const resp =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : { result: raw };
        const result = String(resp.result ?? resp.answer ?? resp.status ?? "")
          .trim()
          .toUpperCase();
        if (!result || result === "PASS" || result === "YES" || result === "NA" || result === "N/A") {
          continue;
        }
        if (result !== "FAIL" && result !== "NO" && result !== "MINOR" && result !== "MAJOR" && result !== "CRITICAL") {
          continue;
        }

        const q = qById.get(key);
        let severity = String(resp.severity ?? q?.riskLevel ?? "MINOR").toUpperCase();
        if (result === "MINOR" || result === "MAJOR" || result === "CRITICAL") severity = result;
        if (q?.autoFail) severity = "CRITICAL";

        if (severity === "CRITICAL") {
          criticalFail = true;
          score = 0;
        } else if (severity === "MAJOR") {
          score -= 10;
        } else {
          score -= 2;
        }
        severityMax = maxSeverity(severityMax, severity);
        const notes = asOptionalString(resp.notes ?? resp.comments, 4000);
        const photos = Array.isArray(resp.photos)
          ? resp.photos
          : resp.photoDataUrl
            ? [{ dataUrl: resp.photoDataUrl }]
            : [];
        failItems.push({
          questionKey: key,
          label: String(resp.label ?? q?.label ?? key),
          severity,
          regulationRefs: q?.regulationRef ? [q.regulationRef] : asJsonArray(resp.regulationRefs),
          ...(notes ? { notes } : {}),
          ...(photos.length ? { photos } : {}),
        });
      }

      if (!criticalFail) score = Math.max(0, Math.min(100, score));
      let complianceStatus = criticalFail
        ? "CRITICAL_FAIL"
        : score >= 80 && failItems.every((f) => f.severity !== "MAJOR")
          ? "PASS"
          : failItems.length
            ? "FAIL"
            : "PASS";
      if (preop) {
        complianceStatus =
          criticalFail || failItems.length > 0
            ? "FAILED_PRODUCTION_HOLD"
            : "RELEASED_FOR_PRODUCTION";
      }

      const findingCategory = existing.inspectionType || "GENERAL";
      const createdFindings = [];
      for (const item of failItems) {
        const findingId = createId();
        const findingNumber = await this.nextNumber(tx, tenantId, "FINDING", "FND");
        const priorCount = await countRecurringFindings(
          tx,
          tenantId,
          existing.locationId,
          findingCategory,
        );
        const isRecurring = priorCount >= 2;
        const recurrenceCount = priorCount;
        let correctiveActionId: string | null = null;
        if (item.severity === "CRITICAL" || item.severity === "MAJOR") {
          correctiveActionId = await this.createCorrectiveAction(tx, {
            tenantId,
            siteId: existing.siteId,
            parentEntityType: "SANITATION_FINDING",
            parentEntityId: findingId,
            title: `Sanitation finding: ${item.label}`,
            description: item.notes ?? item.label,
            finding: item.label,
            priority: item.severity,
            sourcePayload: {
              inspectionId,
              questionKey: item.questionKey,
            },
          });
        }

        const stopWork = item.severity === "CRITICAL" && preop;
        const productHold = item.severity === "CRITICAL" && preop;

        const [finding] = await tx
          .insert(industrialSanitationFindings)
          .values({
            id: findingId,
            tenantId,
            siteId: existing.siteId,
            inspectionId,
            locationId: existing.locationId,
            zoneId: existing.zoneId,
            findingNumber,
            category: findingCategory,
            title: item.label.slice(0, 500),
            description: item.notes ?? null,
            severity: item.severity,
            status: "OPEN",
            questionKey: item.questionKey.slice(0, 120),
            regulationRefs: item.regulationRefs,
            photosJson: item.photos ?? [],
            isRecurring,
            recurrenceCount,
            stopWork,
            productHold,
            correctiveActionId,
            reportedByUserId: principal.userId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (finding) createdFindings.push(mapFinding(finding));
      }

      const summaryJson =
        body.summaryJson != null
          ? asJsonObject(body.summaryJson)
          : asJsonObject(existing.summaryJson);

      const [row] = await tx
        .update(industrialSanitationInspections)
        .set({
          status: "COMPLETED",
          complianceStatus,
          scorePercent: score,
          severityMax,
          responsesJson: responses,
          summaryJson,
          signaturesJson:
            body.signaturesJson != null
              ? asJsonArray(body.signaturesJson)
              : existing.signaturesJson,
          notes: body.notes != null ? asOptionalString(body.notes, 4000) : existing.notes,
          completedAt: now,
          updatedAt: now,
          updatedByUserId: principal.userId ?? null,
        })
        .where(eq(industrialSanitationInspections.id, inspectionId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to complete inspection");
      return { ...mapInspection(row), findings: createdFindings };
    });

    void this.sendCompletedInspectionReportEmail(principal, result).catch((err) => {
      this.logger.warn(
        `Completed inspection report email failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return result;
  }

  private async resolveCompletedReportEmail(
    tenantId: string,
    siteId: string | null | undefined,
  ): Promise<string | null> {
    if (!siteId) return null;
    const [profile] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select({ settings: industrialSanitationFacilityProfiles.settings })
        .from(industrialSanitationFacilityProfiles)
        .where(
          and(
            eq(industrialSanitationFacilityProfiles.tenantId, tenantId),
            eq(industrialSanitationFacilityProfiles.siteId, siteId),
            isNull(industrialSanitationFacilityProfiles.archivedAt),
          ),
        )
        .limit(1),
    );
    const settings =
      profile?.settings && typeof profile.settings === "object" && !Array.isArray(profile.settings)
        ? (profile.settings as Record<string, unknown>)
        : {};
    const raw = String(settings.completedReportEmail ?? settings.completedReportsTo ?? "").trim();
    if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
    return raw;
  }

  private async sendCompletedInspectionReportEmail(
    principal: ForgePrincipal,
    completed: { id: string; siteId?: string | null; title?: string | null; inspectionNumber?: string | null },
  ) {
    const tenantId = this.tenant(principal);
    const to = await this.resolveCompletedReportEmail(tenantId, completed.siteId);
    if (!to) return;

    const printable = await this.getInspectionPrintable(principal, completed.id);
    const title =
      String(printable.title ?? completed.title ?? completed.inspectionNumber ?? "Sanitation inspection").trim() ||
      "Sanitation inspection";
    const subject = `Sanitation report completed: ${title}`;
    const textBody = [
      `A sanitation inspection was completed.`,
      `Title: ${title}`,
      `Inspection id: ${completed.id}`,
      `Open the HTML version of this email for the full report.`,
    ].join("\n");

    await this.notifications.sendTemplatedEmail({
      to,
      templateKey: "sanitation_inspection_completed",
      tenantId,
      vars: {
        subject,
        htmlBody: printable.html,
        textBody,
      },
    });
  }

  async deleteInspection(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const inspectionId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.id, inspectionId),
            eq(industrialSanitationInspections.tenantId, tenantId),
            isNull(industrialSanitationInspections.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Inspection not found");
      const status = String(existing.status ?? "").toUpperCase();
      if (status === "COMPLETED" || existing.completedAt) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Completed inspections cannot be deleted",
        );
      }
      const [row] = await tx
        .update(industrialSanitationInspections)
        .set({
          archivedAt: now,
          status: "DELETED",
          updatedAt: now,
          updatedByUserId: principal.userId ?? null,
        })
        .where(eq(industrialSanitationInspections.id, inspectionId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to delete inspection");
      return mapInspection(row);
    });
  }

  // ── Findings ─────────────────────────────────────────────────────────────

  async listFindings(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const severity = asOptionalString(query.severity, 32);
    const inspectionId = asOptionalUuid(query.inspectionId);

    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            status ? eq(industrialSanitationFindings.status, status) : undefined,
            siteId ? eq(industrialSanitationFindings.siteId, siteId) : undefined,
            severity ? eq(industrialSanitationFindings.severity, severity) : undefined,
            inspectionId
              ? eq(industrialSanitationFindings.inspectionId, inspectionId)
              : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationFindings.createdAt))
        .limit(200),
    );
    return { items: rows.map(mapFinding) };
  }

  async createFinding(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const findingId = createId();
      const findingNumber = await this.nextNumber(tx, tenantId, "FINDING", "FND");
      const severity = (asOptionalString(body.severity, 32) ?? "MINOR").toUpperCase();
      const locationId = asOptionalUuid(body.locationId);
      const category = asOptionalString(body.category, 120) ?? "GENERAL";
      const priorCount = await countRecurringFindings(tx, tenantId, locationId, category);
      const isRecurring = priorCount >= 2;
      const recurrenceCount = priorCount;
      let correctiveActionId: string | null = null;
      if (severity === "CRITICAL" || severity === "MAJOR") {
        correctiveActionId = await this.createCorrectiveAction(tx, {
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          parentEntityType: "SANITATION_FINDING",
          parentEntityId: findingId,
          title: `Sanitation finding: ${asRequiredString(body.title, "title", 500)}`,
          description: asOptionalString(body.description, 4000),
          finding: asRequiredString(body.title, "title", 500),
          priority: severity,
        });
      }

      const [row] = await tx
        .insert(industrialSanitationFindings)
        .values({
          id: findingId,
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          inspectionId: asOptionalUuid(body.inspectionId),
          locationId,
          zoneId: asOptionalUuid(body.zoneId),
          equipmentId: asOptionalUuid(body.equipmentId),
          findingNumber,
          category,
          subcategory: asOptionalString(body.subcategory, 120),
          title: asRequiredString(body.title, "title", 500),
          description: asOptionalString(body.description, 4000),
          severity,
          status: asOptionalString(body.status, 64) ?? "OPEN",
          questionKey: asOptionalString(body.questionKey, 120),
          regulationRefs: asJsonArray(body.regulationRefs),
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          isRecurring,
          recurrenceCount,
          stopWork: asBool(body.stopWork),
          productHold: asBool(body.productHold),
          correctiveActionId,
          reportedByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create finding");
      return mapFinding(row);
    });
  }

  async updateFindingStatus(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const findingId = asRequiredUuid(id, "id");
    const status = asRequiredString(body.status, "status", 64).toUpperCase();
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.id, findingId),
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Finding not found");

      const [row] = await tx
        .update(industrialSanitationFindings)
        .set({
          status,
          closedAt: ["CLOSED", "RESOLVED"].includes(status) ? now : existing.closedAt,
          updatedAt: now,
        })
        .where(eq(industrialSanitationFindings.id, findingId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update finding");
      return mapFinding(row);
    });
  }

  // ── Dust ─────────────────────────────────────────────────────────────────

  async listDustMeasurements(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const locationId = asOptionalUuid(query.locationId);
    const exceeds = query.exceedsActionLevel != null ? asBool(query.exceedsActionLevel) : null;

    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationDustMeasurements)
        .where(
          and(
            eq(industrialSanitationDustMeasurements.tenantId, tenantId),
            isNull(industrialSanitationDustMeasurements.archivedAt),
            siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
            locationId
              ? eq(industrialSanitationDustMeasurements.locationId, locationId)
              : undefined,
            exceeds != null
              ? eq(industrialSanitationDustMeasurements.exceedsActionLevel, exceeds)
              : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationDustMeasurements.measuredAt))
        .limit(200),
    );
    return { items: rows.map(mapDust) };
  }

  async recordDustMeasurement(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const depth = Number(body.dustDepth ?? body.depth);
    if (!Number.isFinite(depth) || depth < 0) {
      throw new ForgeError("VALIDATION_FAILED", "dustDepth is required");
    }
    const unit = (asOptionalString(body.unit, 16) ?? "INCHES").toUpperCase();
    const dustDepthInches = toDustInches(depth, unit);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const locationId = asOptionalUuid(body.locationId);
      let isPriorityArea = asBool(body.isPriorityArea);
      let location: typeof industrialSanitationLocations.$inferSelect | null = null;
      if (locationId) {
        const [loc] = await tx
          .select()
          .from(industrialSanitationLocations)
          .where(
            and(
              eq(industrialSanitationLocations.id, locationId),
              eq(industrialSanitationLocations.tenantId, tenantId),
              isNull(industrialSanitationLocations.archivedAt),
            ),
          )
          .limit(1);
        location = loc ?? null;
        if (location?.isPriorityHousekeeping) isPriorityArea = true;
      }

      const siteId = asOptionalUuid(body.siteId) ?? location?.siteId ?? null;
      let threshold = 0.125;
      if (siteId) {
        const [profile] = await tx
          .select()
          .from(industrialSanitationFacilityProfiles)
          .where(
            and(
              eq(industrialSanitationFacilityProfiles.tenantId, tenantId),
              eq(industrialSanitationFacilityProfiles.siteId, siteId),
              isNull(industrialSanitationFacilityProfiles.archivedAt),
            ),
          )
          .limit(1);
        if (profile?.dustActionThresholdInches != null) {
          threshold = profile.dustActionThresholdInches;
        }
      }

      const exceedsActionLevel = isPriorityArea && dustDepthInches > threshold;
      const measurementNumber = await this.nextNumber(tx, tenantId, "DUST", "DUST");
      const measurementId = createId();

      let findingId: string | null = null;
      let alert: string | null = null;
      if (exceedsActionLevel) {
        alert = "CRITICAL_DUST_HOUSEKEEPING_ALERT";
        findingId = createId();
        const findingNumber = await this.nextNumber(tx, tenantId, "FINDING", "FND");
        const caId = await this.createCorrectiveAction(tx, {
          tenantId,
          siteId,
          parentEntityType: "SANITATION_FINDING",
          parentEntityId: findingId,
          title: `Critical dust housekeeping: ${dustDepthInches.toFixed(3)} in`,
          description: `Dust depth ${dustDepthInches.toFixed(3)} inches exceeds action level ${threshold} inches in a priority housekeeping area.`,
          finding: "Dust exceeds OSHA priority housekeeping action level",
          priority: "CRITICAL",
          sourcePayload: { measurementId, dustDepthInches, threshold },
        });
        await tx.insert(industrialSanitationFindings).values({
          id: findingId,
          tenantId,
          siteId,
          locationId,
          findingNumber,
          category: "DUST",
          title: "Critical dust housekeeping exceedance",
          description: `Measured ${dustDepthInches.toFixed(3)} in (threshold ${threshold} in)`,
          severity: "CRITICAL",
          status: "OPEN",
          regulationRefs: ["OSHA 29 CFR 1910.272(j)"],
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          correctiveActionId: caId,
          reportedByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        });
        if (principal.userId) {
          try {
            await this.notifications.create(
              tenantId,
              {
                userId: principal.userId,
                type: "industrial.sanitation.dust_alert",
                title: "CRITICAL DUST HOUSEKEEPING ALERT",
                body: `Dust depth ${dustDepthInches.toFixed(3)} in exceeds ${threshold} in action level.`,
                priority: "CRITICAL",
                destination: "IN_APP",
                href: "/modules/sanitation",
                metadataJson: { measurementId, findingId, locationId, siteId },
              },
              principal,
            );
          } catch (err) {
            this.logger.warn(
              `Dust alert notification failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      const [row] = await tx
        .insert(industrialSanitationDustMeasurements)
        .values({
          id: measurementId,
          tenantId,
          siteId,
          inspectionId: asOptionalUuid(body.inspectionId),
          findingId,
          locationId,
          measurementNumber,
          surface: asOptionalString(body.surface, 200),
          measurementPoint: asOptionalString(body.measurementPoint, 300),
          dustDepth: depth,
          unit,
          dustDepthInches,
          measurementMethod: asOptionalString(body.measurementMethod, 120),
          exceedsActionLevel,
          actionThresholdInches: threshold,
          isPriorityArea,
          measuredAt: asOptionalDate(body.measuredAt) ?? now,
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          comments: asOptionalString(body.comments, 4000),
          remeasurementOfId: asOptionalUuid(body.remeasurementOfId),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to record dust measurement");
      return { ...mapDust(row), alert };
    });
  }

  // ── Master Sanitation Schedule ───────────────────────────────────────────

  async listMss(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const status = asOptionalString(query.status, 64);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationMasterSchedule)
        .where(
          and(
            eq(industrialSanitationMasterSchedule.tenantId, tenantId),
            isNull(industrialSanitationMasterSchedule.archivedAt),
            siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
            status ? eq(industrialSanitationMasterSchedule.status, status) : undefined,
          ),
        )
        .orderBy(industrialSanitationMasterSchedule.nextDueAt)
        .limit(500),
    );
    return { items: rows.map(mapMss) };
  }

  async createMss(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const [row] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .insert(industrialSanitationMasterSchedule)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          departmentId: asOptionalUuid(body.departmentId),
          locationId: asOptionalUuid(body.locationId),
          zoneId: asOptionalUuid(body.zoneId),
          equipmentId: asOptionalUuid(body.equipmentId),
          title: asRequiredString(body.title, "title", 500),
          cleaningTask: asRequiredString(
            body.cleaningTask ?? body.title,
            "cleaningTask",
            500,
          ),
          cleaningProcedure: asOptionalString(body.cleaningProcedure, 8000),
          frequency: asOptionalString(body.frequency, 64) ?? "DAILY",
          frequencyCustom: asOptionalString(body.frequencyCustom, 200),
          cleaningMethod: asOptionalString(body.cleaningMethod, 200),
          assignedDepartmentId: asOptionalUuid(body.assignedDepartmentId),
          assignedPersonnelId: asOptionalUuid(body.assignedPersonnelId),
          estimatedDurationMinutes:
            body.estimatedDurationMinutes != null &&
            Number.isFinite(Number(body.estimatedDurationMinutes))
              ? Number(body.estimatedDurationMinutes)
              : null,
          requiredShutdown: asBool(body.requiredShutdown),
          lotoRequired: asBool(body.lotoRequired),
          confinedSpaceRequired: asBool(body.confinedSpaceRequired),
          ppeRequired: asJsonArray(body.ppeRequired),
          chemicalsRequired: asJsonArray(body.chemicalsRequired),
          toolsRequired: asJsonArray(body.toolsRequired),
          foodContactSurface: asBool(body.foodContactSurface),
          allergenConcern: asBool(body.allergenConcern),
          dustHazard: asBool(body.dustHazard),
          verificationRequired: asBool(body.verificationRequired, true),
          verificationMethod: asOptionalString(body.verificationMethod, 120),
          nextDueAt: asOptionalDate(body.nextDueAt) ?? now,
          status: asOptionalString(body.status, 64) ?? "ACTIVE",
          createdByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create MSS entry");
    return mapMss(row);
  }

  async updateMss(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const mssId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationMasterSchedule)
        .where(
          and(
            eq(industrialSanitationMasterSchedule.id, mssId),
            eq(industrialSanitationMasterSchedule.tenantId, tenantId),
            isNull(industrialSanitationMasterSchedule.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "MSS entry not found");

      const patch: Partial<typeof industrialSanitationMasterSchedule.$inferInsert> = {
        updatedAt: now,
      };
      if (body.title != null) patch.title = asRequiredString(body.title, "title", 500);
      if (body.cleaningTask != null) {
        patch.cleaningTask = asRequiredString(body.cleaningTask, "cleaningTask", 500);
      }
      if (body.cleaningProcedure !== undefined) {
        patch.cleaningProcedure = asOptionalString(body.cleaningProcedure, 8000);
      }
      if (body.frequency != null) patch.frequency = asRequiredString(body.frequency, "frequency", 64);
      if (body.nextDueAt !== undefined) patch.nextDueAt = asOptionalDate(body.nextDueAt);
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);
      if (body.verificationRequired != null) {
        patch.verificationRequired = asBool(body.verificationRequired);
      }
      if (body.siteId !== undefined) patch.siteId = asOptionalUuid(body.siteId);
      if (body.locationId !== undefined) patch.locationId = asOptionalUuid(body.locationId);
      if (body.zoneId !== undefined) patch.zoneId = asOptionalUuid(body.zoneId);
      if (body.assignedPersonnelId !== undefined) {
        patch.assignedPersonnelId = asOptionalUuid(body.assignedPersonnelId);
      }

      const [row] = await tx
        .update(industrialSanitationMasterSchedule)
        .set(patch)
        .where(eq(industrialSanitationMasterSchedule.id, mssId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update MSS");
      return mapMss(row);
    });
  }

  async archiveMss(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const mssId = asRequiredUuid(id, "id");
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialSanitationMasterSchedule.id })
        .from(industrialSanitationMasterSchedule)
        .where(
          and(
            eq(industrialSanitationMasterSchedule.id, mssId),
            eq(industrialSanitationMasterSchedule.tenantId, tenantId),
            isNull(industrialSanitationMasterSchedule.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "MSS entry not found");
      await tx
        .update(industrialSanitationMasterSchedule)
        .set({ archivedAt: now, updatedAt: now, status: "ARCHIVED" })
        .where(eq(industrialSanitationMasterSchedule.id, mssId));
    });
    return { id: mssId, archived: true };
  }

  async generateCleaningTasksFromDue(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const due = await tx
        .select()
        .from(industrialSanitationMasterSchedule)
        .where(
          and(
            eq(industrialSanitationMasterSchedule.tenantId, tenantId),
            isNull(industrialSanitationMasterSchedule.archivedAt),
            eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
            lte(industrialSanitationMasterSchedule.nextDueAt, now),
          ),
        )
        .limit(200);

      const created = [];
      for (const mss of due) {
        const taskNumber = await this.nextNumber(tx, tenantId, "CLEANING", "CLN");
        const [task] = await tx
          .insert(industrialSanitationCleaningTasks)
          .values({
            id: createId(),
            tenantId,
            siteId: mss.siteId,
            masterScheduleId: mss.id,
            locationId: mss.locationId,
            zoneId: mss.zoneId,
            equipmentId: mss.equipmentId,
            taskNumber,
            title: mss.title,
            status: "SCHEDULED",
            dueAt: mss.nextDueAt ?? now,
            assignedPersonnelId: mss.assignedPersonnelId,
            verificationRequired: mss.verificationRequired,
            lotoRequired: mss.lotoRequired,
            createdByUserId: principal.userId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const nextDue = bumpDueDate(mss.nextDueAt ?? now, mss.frequency);
        await tx
          .update(industrialSanitationMasterSchedule)
          .set({ nextDueAt: nextDue, updatedAt: now })
          .where(eq(industrialSanitationMasterSchedule.id, mss.id));

        if (task) created.push(mapCleaningTask(task));
      }
      return { generated: created.length, items: created };
    });
  }

  // ── Cleaning tasks ───────────────────────────────────────────────────────

  async listCleaningTasks(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
            status ? eq(industrialSanitationCleaningTasks.status, status) : undefined,
            siteId ? eq(industrialSanitationCleaningTasks.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationCleaningTasks.dueAt))
        .limit(200),
    );
    return { items: rows.map(mapCleaningTask) };
  }

  async getCleaningTask(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const taskId = asRequiredUuid(id, "id");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.id, taskId),
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Cleaning task not found");
      return mapCleaningTask(row);
    });
  }

  async createCleaningTask(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const taskNumber = await this.nextNumber(tx, tenantId, "CLEANING", "CLN");
      const [row] = await tx
        .insert(industrialSanitationCleaningTasks)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          masterScheduleId: asOptionalUuid(body.masterScheduleId),
          locationId: asOptionalUuid(body.locationId),
          zoneId: asOptionalUuid(body.zoneId),
          equipmentId: asOptionalUuid(body.equipmentId),
          taskNumber,
          title: asRequiredString(body.title, "title", 500),
          status: asOptionalString(body.status, 64) ?? "SCHEDULED",
          dueAt: asOptionalDate(body.dueAt),
          assignedPersonnelId: asOptionalUuid(body.assignedPersonnelId),
          assignedUserId: asOptionalUuid(body.assignedUserId),
          verificationRequired: asBool(body.verificationRequired, true),
          lotoRequired: asBool(body.lotoRequired),
          createdByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create cleaning task");
      return mapCleaningTask(row);
    });
  }

  async updateCleaningTaskStatus(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const taskId = asRequiredUuid(id, "id");
    const status = asRequiredString(body.status, "status", 64).toUpperCase();
    if (!CLEANING_STATUSES.has(status)) {
      throw new ForgeError("VALIDATION_FAILED", `Invalid cleaning task status: ${status}`);
    }
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.id, taskId),
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Cleaning task not found");

      const patch: Partial<typeof industrialSanitationCleaningTasks.$inferInsert> = {
        status,
        updatedAt: now,
      };
      if (status === "IN_PROGRESS" && !existing.startedAt) patch.startedAt = now;
      if (status === "COMPLETED" || status === "AWAITING_VERIFICATION") {
        patch.completedAt = existing.completedAt ?? now;
      }
      if (body.assignedPersonnelId !== undefined) {
        patch.assignedPersonnelId = asOptionalUuid(body.assignedPersonnelId);
      }
      if (body.assignedUserId !== undefined) {
        patch.assignedUserId = asOptionalUuid(body.assignedUserId);
      }

      const [row] = await tx
        .update(industrialSanitationCleaningTasks)
        .set(patch)
        .where(eq(industrialSanitationCleaningTasks.id, taskId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update cleaning task");
      return mapCleaningTask(row);
    });
  }

  async completeCleaning(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const taskId = asRequiredUuid(id, "id");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.id, taskId),
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Cleaning task not found");

      const nextStatus = existing.verificationRequired
        ? "AWAITING_VERIFICATION"
        : "CLOSED";

      const [row] = await tx
        .update(industrialSanitationCleaningTasks)
        .set({
          status: nextStatus,
          completedAt: now,
          beforePhotosJson:
            body.beforePhotosJson != null
              ? asJsonArray(body.beforePhotosJson)
              : existing.beforePhotosJson,
          afterPhotosJson: asJsonArray(body.afterPhotosJson ?? body.photos ?? body.photosJson),
          chemicalsUsed: asJsonArray(body.chemicalsUsed ?? body.chemicals),
          cleanerSignatureJson:
            body.cleanerSignatureJson ?? body.signature ?? existing.cleanerSignatureJson,
          notes: body.notes != null ? asOptionalString(body.notes, 4000) : existing.notes,
          issuesFound:
            body.issuesFound != null
              ? asOptionalString(body.issuesFound, 4000)
              : existing.issuesFound,
          updatedAt: now,
        })
        .where(eq(industrialSanitationCleaningTasks.id, taskId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to complete cleaning");

      if (existing.masterScheduleId) {
        await tx
          .update(industrialSanitationMasterSchedule)
          .set({ lastCompletedAt: now, updatedAt: now })
          .where(eq(industrialSanitationMasterSchedule.id, existing.masterScheduleId));
      }
      return mapCleaningTask(row);
    });
  }

  // ── Verifications ────────────────────────────────────────────────────────

  async createVerification(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const cleaningTaskId = asRequiredUuid(body.cleaningTaskId, "cleaningTaskId");
    const result = asRequiredString(body.result, "result", 64).toUpperCase();
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [task] = await tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.id, cleaningTaskId),
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            isNull(industrialSanitationCleaningTasks.archivedAt),
          ),
        )
        .limit(1);
      if (!task) throw new ForgeError("NOT_FOUND", "Cleaning task not found");

      const verifiedByUserId =
        asOptionalUuid(body.verifiedByUserId) ?? principal.userId ?? null;

      if (task.siteId) {
        const [profile] = await tx
          .select()
          .from(industrialSanitationFacilityProfiles)
          .where(
            and(
              eq(industrialSanitationFacilityProfiles.tenantId, tenantId),
              eq(industrialSanitationFacilityProfiles.siteId, task.siteId),
              isNull(industrialSanitationFacilityProfiles.archivedAt),
            ),
          )
          .limit(1);
        if (
          profile?.independentVerificationRequired &&
          verifiedByUserId &&
          task.assignedUserId &&
          verifiedByUserId === task.assignedUserId
        ) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Independent verification required: verifier cannot be the assigned cleaner",
          );
        }
      }

      const [row] = await tx
        .insert(industrialSanitationVerifications)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId) ?? task.siteId,
          cleaningTaskId,
          inspectionId: asOptionalUuid(body.inspectionId),
          findingId: asOptionalUuid(body.findingId),
          method: asOptionalString(body.method, 64) ?? "VISUAL",
          result,
          verifiedByUserId,
          verifiedByPersonnelId: asOptionalUuid(body.verifiedByPersonnelId),
          verifiedAt: asOptionalDate(body.verifiedAt) ?? now,
          notes: asOptionalString(body.notes, 4000),
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          resultData: asJsonObject(body.resultData),
          signatureJson: body.signatureJson ?? body.signature ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create verification");

      if (result === "FAIL" || result === "RECLEAN_REQUIRED") {
        await tx
          .update(industrialSanitationCleaningTasks)
          .set({
            status: "RECLEAN_REQUIRED",
            updatedAt: now,
          })
          .where(eq(industrialSanitationCleaningTasks.id, cleaningTaskId));
      } else if (result === "PASS") {
        await tx
          .update(industrialSanitationCleaningTasks)
          .set({ status: "VERIFIED", updatedAt: now })
          .where(eq(industrialSanitationCleaningTasks.id, cleaningTaskId));
        await tx
          .update(industrialSanitationCleaningTasks)
          .set({ status: "CLOSED", updatedAt: now })
          .where(eq(industrialSanitationCleaningTasks.id, cleaningTaskId));
      }

      return mapVerification(row);
    });
  }

  // ── Spills ───────────────────────────────────────────────────────────────

  async listSpills(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationSpills)
        .where(
          and(
            eq(industrialSanitationSpills.tenantId, tenantId),
            isNull(industrialSanitationSpills.archivedAt),
            status ? eq(industrialSanitationSpills.status, status) : undefined,
            siteId ? eq(industrialSanitationSpills.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationSpills.reportedAt))
        .limit(200),
    );
    return { items: rows.map(mapSpill) };
  }

  async reportSpill(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const spillNumber = await this.nextNumber(tx, tenantId, "SPILL", "SPILL");
      const [row] = await tx
        .insert(industrialSanitationSpills)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          locationId: asOptionalUuid(body.locationId),
          spillNumber,
          building: asOptionalString(body.building, 200),
          area: asOptionalString(body.area, 300),
          exactLocation: asOptionalString(body.exactLocation, 500),
          product: asOptionalString(body.product, 300),
          estimatedQuantity: asOptionalString(body.estimatedQuantity, 120),
          cause: asOptionalString(body.cause, 4000),
          equipmentInvolved: asOptionalString(body.equipmentInvolved, 300),
          slipFallHazard: asBool(body.slipFallHazard),
          dustHazard: asBool(body.dustHazard),
          contaminationConcern: asBool(body.contaminationConcern),
          pestConcern: asBool(body.pestConcern),
          productionImpact: asOptionalString(body.productionImpact, 4000),
          status: "REPORTED",
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          actionsJson: asJsonArray(body.actionsJson ?? body.actions),
          reportedByUserId: principal.userId ?? null,
          reportedAt: now,
          notes: asOptionalString(body.notes, 4000),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to report spill");
      return mapSpill(row);
    });
  }

  async updateSpillStatus(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const spillId = asRequiredUuid(id, "id");
    const status = asRequiredString(body.status, "status", 64).toUpperCase();
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationSpills)
        .where(
          and(
            eq(industrialSanitationSpills.id, spillId),
            eq(industrialSanitationSpills.tenantId, tenantId),
            isNull(industrialSanitationSpills.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Spill not found");

      const patch: Partial<typeof industrialSanitationSpills.$inferInsert> = {
        status,
        updatedAt: now,
      };
      if (status === "CLEANED") patch.cleanedAt = now;
      if (status === "VERIFIED") patch.verifiedAt = now;
      if (body.notes !== undefined) patch.notes = asOptionalString(body.notes, 4000);
      if (body.actionsJson != null) patch.actionsJson = asJsonArray(body.actionsJson);

      const [row] = await tx
        .update(industrialSanitationSpills)
        .set(patch)
        .where(eq(industrialSanitationSpills.id, spillId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update spill");
      return mapSpill(row);
    });
  }

  // ── Pest ─────────────────────────────────────────────────────────────────

  async listPestDevices(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationPestDevices)
        .where(
          and(
            eq(industrialSanitationPestDevices.tenantId, tenantId),
            isNull(industrialSanitationPestDevices.archivedAt),
            siteId ? eq(industrialSanitationPestDevices.siteId, siteId) : undefined,
          ),
        )
        .orderBy(industrialSanitationPestDevices.deviceNumber)
        .limit(500),
    );
    return { items: rows.map(mapPestDevice) };
  }

  async createPestDevice(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const deviceNumber =
        asOptionalString(body.deviceNumber, 64) ??
        (await this.nextNumber(tx, tenantId, "PEST_DEVICE", "PD"));
      const [row] = await tx
        .insert(industrialSanitationPestDevices)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          locationId: asOptionalUuid(body.locationId),
          zoneId: asOptionalUuid(body.zoneId),
          deviceNumber,
          qrToken: asOptionalString(body.qrToken, 120),
          deviceType: asOptionalString(body.deviceType, 64) ?? "TRAP",
          pestType: asOptionalString(body.pestType, 64),
          building: asOptionalString(body.building, 200),
          area: asOptionalString(body.area, 300),
          mapX: body.mapX != null && Number.isFinite(Number(body.mapX)) ? Number(body.mapX) : null,
          mapY: body.mapY != null && Number.isFinite(Number(body.mapY)) ? Number(body.mapY) : null,
          serviceFrequency: asOptionalString(body.serviceFrequency, 64) ?? "WEEKLY",
          vendor: asOptionalString(body.vendor, 200),
          nextInspectionAt: asOptionalDate(body.nextInspectionAt),
          status: asOptionalString(body.status, 64) ?? "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create pest device");
      return mapPestDevice(row);
    });
  }

  async updatePestDevice(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const deviceId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationPestDevices)
        .where(
          and(
            eq(industrialSanitationPestDevices.id, deviceId),
            eq(industrialSanitationPestDevices.tenantId, tenantId),
            isNull(industrialSanitationPestDevices.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Pest device not found");

      const patch: Partial<typeof industrialSanitationPestDevices.$inferInsert> = {
        updatedAt: now,
      };
      if (body.deviceType != null) patch.deviceType = asRequiredString(body.deviceType, "deviceType", 64);
      if (body.pestType !== undefined) patch.pestType = asOptionalString(body.pestType, 64);
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);
      if (body.locationId !== undefined) patch.locationId = asOptionalUuid(body.locationId);
      if (body.vendor !== undefined) patch.vendor = asOptionalString(body.vendor, 200);
      if (body.serviceFrequency != null) {
        patch.serviceFrequency = asRequiredString(body.serviceFrequency, "serviceFrequency", 64);
      }
      if (body.lastInspectedAt !== undefined) {
        patch.lastInspectedAt = asOptionalDate(body.lastInspectedAt);
      }
      if (body.nextInspectionAt !== undefined) {
        patch.nextInspectionAt = asOptionalDate(body.nextInspectionAt);
      }

      const [row] = await tx
        .update(industrialSanitationPestDevices)
        .set(patch)
        .where(eq(industrialSanitationPestDevices.id, deviceId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update pest device");
      return mapPestDevice(row);
    });
  }

  async listPestFindings(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationPestFindings)
        .where(
          and(
            eq(industrialSanitationPestFindings.tenantId, tenantId),
            isNull(industrialSanitationPestFindings.archivedAt),
            status ? eq(industrialSanitationPestFindings.status, status) : undefined,
            siteId ? eq(industrialSanitationPestFindings.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationPestFindings.observedAt))
        .limit(200),
    );
    return { items: rows.map(mapPestFinding) };
  }

  async createPestFinding(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const [row] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .insert(industrialSanitationPestFindings)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          deviceId: asOptionalUuid(body.deviceId),
          locationId: asOptionalUuid(body.locationId),
          inspectionId: asOptionalUuid(body.inspectionId),
          pestSpecies: asOptionalString(body.pestSpecies, 120),
          pestCategory: asOptionalString(body.pestCategory, 64) ?? "OTHER",
          numberObserved:
            body.numberObserved != null && Number.isFinite(Number(body.numberObserved))
              ? Number(body.numberObserved)
              : null,
          activityLevel: asOptionalString(body.activityLevel, 64),
          evidence: asOptionalString(body.evidence, 4000),
          droppings: asBool(body.droppings),
          nesting: asBool(body.nesting),
          entryPoint: asOptionalString(body.entryPoint, 300),
          productExposure: asBool(body.productExposure),
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          status: asOptionalString(body.status, 64) ?? "OPEN",
          observedAt: asOptionalDate(body.observedAt) ?? now,
          reportedByUserId: principal.userId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create pest finding");
    return mapPestFinding(row);
  }

  // ── Chemicals ────────────────────────────────────────────────────────────

  async listChemicals(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationChemicals)
        .where(
          and(
            eq(industrialSanitationChemicals.tenantId, tenantId),
            isNull(industrialSanitationChemicals.archivedAt),
            siteId ? eq(industrialSanitationChemicals.siteId, siteId) : undefined,
          ),
        )
        .orderBy(industrialSanitationChemicals.name)
        .limit(500),
    );
    return { items: rows.map(mapChemical) };
  }

  async createChemical(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    const [row] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .insert(industrialSanitationChemicals)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          name: asRequiredString(body.name, "name", 300),
          manufacturer: asOptionalString(body.manufacturer, 200),
          sdsDocumentId: asOptionalUuid(body.sdsDocumentId),
          intendedUse: asOptionalString(body.intendedUse, 4000),
          approvedAreas: asJsonArray(body.approvedAreas),
          restrictedAreas: asJsonArray(body.restrictedAreas),
          concentration: asOptionalString(body.concentration, 120),
          applicationMethod: asOptionalString(body.applicationMethod, 200),
          contactTime: asOptionalString(body.contactTime, 120),
          ppeRequired: asJsonArray(body.ppeRequired),
          foodContactApproved: asBool(body.foodContactApproved),
          storageLocation: asOptionalString(body.storageLocation, 300),
          expirationDate: asOptionalDate(body.expirationDate),
          lotNumber: asOptionalString(body.lotNumber, 120),
          status: asOptionalString(body.status, 64) ?? "APPROVED",
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create chemical");
    return mapChemical(row);
  }

  async updateChemical(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const chemicalId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationChemicals)
        .where(
          and(
            eq(industrialSanitationChemicals.id, chemicalId),
            eq(industrialSanitationChemicals.tenantId, tenantId),
            isNull(industrialSanitationChemicals.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Chemical not found");

      const patch: Partial<typeof industrialSanitationChemicals.$inferInsert> = {
        updatedAt: now,
      };
      if (body.name != null) patch.name = asRequiredString(body.name, "name", 300);
      if (body.manufacturer !== undefined) {
        patch.manufacturer = asOptionalString(body.manufacturer, 200);
      }
      if (body.status != null) patch.status = asRequiredString(body.status, "status", 64);
      if (body.concentration !== undefined) {
        patch.concentration = asOptionalString(body.concentration, 120);
      }
      if (body.foodContactApproved != null) {
        patch.foodContactApproved = asBool(body.foodContactApproved);
      }
      if (body.storageLocation !== undefined) {
        patch.storageLocation = asOptionalString(body.storageLocation, 300);
      }
      if (body.expirationDate !== undefined) {
        patch.expirationDate = asOptionalDate(body.expirationDate);
      }
      if (body.ppeRequired != null) patch.ppeRequired = asJsonArray(body.ppeRequired);

      const [row] = await tx
        .update(industrialSanitationChemicals)
        .set(patch)
        .where(eq(industrialSanitationChemicals.id, chemicalId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update chemical");
      return mapChemical(row);
    });
  }

  // ── Environmental samples ────────────────────────────────────────────────

  async listEnvironmentalSamples(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationEnvironmentalSamples)
        .where(
          and(
            eq(industrialSanitationEnvironmentalSamples.tenantId, tenantId),
            isNull(industrialSanitationEnvironmentalSamples.archivedAt),
            siteId ? eq(industrialSanitationEnvironmentalSamples.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationEnvironmentalSamples.collectedAt))
        .limit(200),
    );
    return { items: rows.map(mapEnvSample) };
  }

  async createEnvironmentalSample(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const sampleNumber =
        asOptionalString(body.sampleNumber, 64) ??
        (await this.nextNumber(tx, tenantId, "ENV_SAMPLE", "EM"));
      const [row] = await tx
        .insert(industrialSanitationEnvironmentalSamples)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          locationId: asOptionalUuid(body.locationId),
          zoneId: asOptionalUuid(body.zoneId),
          sampleNumber,
          samplePoint: asOptionalString(body.samplePoint, 300),
          sampleType: asOptionalString(body.sampleType, 64) ?? "ATP",
          testName: asOptionalString(body.testName, 200),
          collectedAt: asOptionalDate(body.collectedAt) ?? now,
          collectedByUserId: principal.userId ?? null,
          laboratory: asOptionalString(body.laboratory, 200),
          lotBatch: asOptionalString(body.lotBatch, 120),
          result: asOptionalString(body.result, 200),
          resultUnits: asOptionalString(body.resultUnits, 64),
          detectionLimit: asOptionalString(body.detectionLimit, 64),
          passFail: asOptionalString(body.passFail, 32),
          attachmentsJson: asJsonArray(body.attachmentsJson ?? body.attachments),
          status: asOptionalString(body.status, 64) ?? "PENDING",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create environmental sample");
      return mapEnvSample(row);
    });
  }

  // ── Compressed air ───────────────────────────────────────────────────────

  async listCompressedAirRequests(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationCompressedAirRequests)
        .where(
          and(
            eq(industrialSanitationCompressedAirRequests.tenantId, tenantId),
            isNull(industrialSanitationCompressedAirRequests.archivedAt),
            status
              ? eq(industrialSanitationCompressedAirRequests.status, status)
              : undefined,
            siteId ? eq(industrialSanitationCompressedAirRequests.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationCompressedAirRequests.createdAt))
        .limit(200),
    );
    return { items: rows.map(mapCompressedAir) };
  }

  async createCompressedAirRequest(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const requestNumber = await this.nextNumber(tx, tenantId, "COMPRESSED_AIR", "CAIR");
      const [row] = await tx
        .insert(industrialSanitationCompressedAirRequests)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          locationId: asOptionalUuid(body.locationId),
          requestNumber,
          areaIdentified: asRequiredString(body.areaIdentified, "areaIdentified", 500),
          cleaningReason: asOptionalString(body.cleaningReason, 4000),
          equipmentStatusConfirmed: asBool(body.equipmentStatusConfirmed),
          ignitionSourcesAddressed: asBool(body.ignitionSourcesAddressed),
          otherIgnitionControlled: asBool(body.otherIgnitionControlled),
          ppeConfirmed: asBool(body.ppeConfirmed),
          areaBarricaded: asBool(body.areaBarricaded),
          dustCollectionReviewed: asBool(body.dustCollectionReviewed),
          status: "REQUESTED",
          requestedByUserId: principal.userId ?? null,
          notes: asOptionalString(body.notes, 4000),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create compressed air request");
      return mapCompressedAir(row);
    });
  }

  async approveCompressedAirRequest(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const requestId = asRequiredUuid(id, "id");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationCompressedAirRequests)
        .where(
          and(
            eq(industrialSanitationCompressedAirRequests.id, requestId),
            eq(industrialSanitationCompressedAirRequests.tenantId, tenantId),
            isNull(industrialSanitationCompressedAirRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Compressed air request not found");

      if (
        !existing.equipmentStatusConfirmed ||
        !existing.ignitionSourcesAddressed ||
        !existing.otherIgnitionControlled
      ) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Approval requires equipmentStatusConfirmed, ignitionSourcesAddressed, and otherIgnitionControlled to be true",
        );
      }

      const [row] = await tx
        .update(industrialSanitationCompressedAirRequests)
        .set({
          status: "APPROVED",
          approvedByUserId: principal.userId ?? null,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(industrialSanitationCompressedAirRequests.id, requestId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to approve request");
      return mapCompressedAir(row);
    });
  }

  async denyCompressedAirRequest(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const requestId = asRequiredUuid(id, "id");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationCompressedAirRequests)
        .where(
          and(
            eq(industrialSanitationCompressedAirRequests.id, requestId),
            eq(industrialSanitationCompressedAirRequests.tenantId, tenantId),
            isNull(industrialSanitationCompressedAirRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Compressed air request not found");

      const [row] = await tx
        .update(industrialSanitationCompressedAirRequests)
        .set({
          status: "DENIED",
          denialReason: asOptionalString(body.denialReason ?? body.reason, 4000),
          approvedByUserId: principal.userId ?? null,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(industrialSanitationCompressedAirRequests.id, requestId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to deny request");
      return mapCompressedAir(row);
    });
  }

  // ── Concerns ─────────────────────────────────────────────────────────────

  async reportConcern(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const concernType = asRequiredString(body.concernType, "concernType", 64).toUpperCase();
    if (!CONCERN_TYPES.has(concernType)) {
      throw new ForgeError("VALIDATION_FAILED", `Invalid concernType: ${concernType}`);
    }
    const now = new Date();
    const [row] = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .insert(industrialSanitationConcernReports)
        .values({
          id: createId(),
          tenantId,
          siteId: asOptionalUuid(body.siteId),
          locationId: asOptionalUuid(body.locationId),
          concernType,
          description: asOptionalString(body.description, 4000),
          photosJson: asJsonArray(body.photosJson ?? body.photos),
          status: "OPEN",
          routedDepartmentId: asOptionalUuid(body.routedDepartmentId),
          reportedByUserId: principal.userId ?? null,
          reportedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    );
    if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to report concern");
    return mapConcern(row);
  }

  async listConcerns(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const status = asOptionalString(query.status, 64);
    const siteId = asOptionalUuid(query.siteId);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationConcernReports)
        .where(
          and(
            eq(industrialSanitationConcernReports.tenantId, tenantId),
            isNull(industrialSanitationConcernReports.archivedAt),
            status ? eq(industrialSanitationConcernReports.status, status) : undefined,
            siteId ? eq(industrialSanitationConcernReports.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationConcernReports.reportedAt))
        .limit(200),
    );
    return { items: rows.map(mapConcern) };
  }

  // ── Analytics / heat map / verifications list ─────────────────────────────

  async getAnalytics(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const findingSite = siteId ? eq(industrialSanitationFindings.siteId, siteId) : undefined;

      const byCategory = await tx
        .select({
          key: industrialSanitationFindings.category,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            findingSite,
          ),
        )
        .groupBy(industrialSanitationFindings.category);

      const bySeverity = await tx
        .select({
          key: industrialSanitationFindings.severity,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            findingSite,
          ),
        )
        .groupBy(industrialSanitationFindings.severity);

      const byArea = await tx
        .select({
          key: industrialSanitationLocations.name,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .leftJoin(
          industrialSanitationLocations,
          eq(industrialSanitationLocations.id, industrialSanitationFindings.locationId),
        )
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            findingSite,
          ),
        )
        .groupBy(industrialSanitationLocations.name);

      const byInspector = await tx
        .select({
          key: industrialSanitationFindings.reportedByUserId,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            findingSite,
          ),
        )
        .groupBy(industrialSanitationFindings.reportedByUserId);

      const toCountRows = (rows: Array<{ key: string | null; c: number }>) =>
        rows.map((r) => ({
          label: r.key ?? "Unknown",
          category: r.key ?? "Unknown",
          severity: r.key ?? "Unknown",
          count: Number(r.c ?? 0),
          value: Number(r.c ?? 0),
        }));

      const dustBuckets: Array<{ days: number; label: string; count: number; value: number }> = [];
      for (const days of [30, 60, 90]) {
        const [row] = await tx
          .select({ c: count() })
          .from(industrialSanitationDustMeasurements)
          .where(
            and(
              eq(industrialSanitationDustMeasurements.tenantId, tenantId),
              isNull(industrialSanitationDustMeasurements.archivedAt),
              eq(industrialSanitationDustMeasurements.exceedsActionLevel, true),
              gte(industrialSanitationDustMeasurements.measuredAt, daysAgo(days)),
              siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
            ),
          );
        const c = Number(row?.c ?? 0);
        dustBuckets.push({ days, label: `Last ${days}d`, count: c, value: c });
      }

      const mssCompletionTrend: Array<{ weekStart: string; percent: number; active: number; onTime: number }> =
        [];
      for (let i = 7; i >= 0; i -= 1) {
        const weekEnd = new Date(startOfWeek(now));
        weekEnd.setDate(weekEnd.getDate() - i * 7 + 6);
        weekEnd.setHours(23, 59, 59, 999);
        const weekStart = new Date(startOfWeek(now));
        weekStart.setDate(weekStart.getDate() - i * 7);
        const [active] = await tx
          .select({ c: count() })
          .from(industrialSanitationMasterSchedule)
          .where(
            and(
              eq(industrialSanitationMasterSchedule.tenantId, tenantId),
              isNull(industrialSanitationMasterSchedule.archivedAt),
              eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
              lte(industrialSanitationMasterSchedule.createdAt, weekEnd),
              siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
            ),
          );
        const [onTime] = await tx
          .select({ c: count() })
          .from(industrialSanitationMasterSchedule)
          .where(
            and(
              eq(industrialSanitationMasterSchedule.tenantId, tenantId),
              isNull(industrialSanitationMasterSchedule.archivedAt),
              eq(industrialSanitationMasterSchedule.status, "ACTIVE"),
              lte(industrialSanitationMasterSchedule.createdAt, weekEnd),
              or(
                isNull(industrialSanitationMasterSchedule.nextDueAt),
                gte(industrialSanitationMasterSchedule.nextDueAt, weekStart),
              ),
              siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
            ),
          );
        const activeN = Number(active?.c ?? 0);
        const onTimeN = Number(onTime?.c ?? 0);
        mssCompletionTrend.push({
          weekStart: weekStart.toISOString(),
          active: activeN,
          onTime: onTimeN,
          percent: activeN === 0 ? 100 : Math.round((onTimeN / activeN) * 1000) / 10,
        });
      }

      const inspectionScoreTrend: Array<{ weekStart: string; avgScore: number | null; count: number }> =
        [];
      for (let i = 11; i >= 0; i -= 1) {
        const weekStart = new Date(startOfWeek(now));
        weekStart.setDate(weekStart.getDate() - i * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        const scores = await tx
          .select({ score: industrialSanitationInspections.scorePercent })
          .from(industrialSanitationInspections)
          .where(
            and(
              eq(industrialSanitationInspections.tenantId, tenantId),
              isNull(industrialSanitationInspections.archivedAt),
              eq(industrialSanitationInspections.status, "COMPLETED"),
              gte(industrialSanitationInspections.completedAt, weekStart),
              lte(industrialSanitationInspections.completedAt, weekEnd),
              siteId ? eq(industrialSanitationInspections.siteId, siteId) : undefined,
            ),
          );
        inspectionScoreTrend.push({
          weekStart: weekStart.toISOString(),
          avgScore: avgScore(scores.map((s) => s.score)),
          count: scores.length,
        });
      }

      const [verifTotal] = await tx
        .select({ c: count() })
        .from(industrialSanitationVerifications)
        .where(
          and(
            eq(industrialSanitationVerifications.tenantId, tenantId),
            isNull(industrialSanitationVerifications.archivedAt),
            siteId ? eq(industrialSanitationVerifications.siteId, siteId) : undefined,
          ),
        );
      const [verifFail] = await tx
        .select({ c: count() })
        .from(industrialSanitationVerifications)
        .where(
          and(
            eq(industrialSanitationVerifications.tenantId, tenantId),
            isNull(industrialSanitationVerifications.archivedAt),
            inArray(industrialSanitationVerifications.result, ["FAIL", "RECLEAN_REQUIRED"]),
            siteId ? eq(industrialSanitationVerifications.siteId, siteId) : undefined,
          ),
        );
      const totalV = Number(verifTotal?.c ?? 0);
      const failV = Number(verifFail?.c ?? 0);
      const failedVerificationRate =
        totalV === 0 ? null : Math.round((failV / totalV) * 1000) / 10;

      const recurringByFlag = await tx
        .select()
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.isRecurring, true),
            findingSite,
          ),
        )
        .orderBy(desc(industrialSanitationFindings.recurrenceCount))
        .limit(10);

      let recurringFindings = recurringByFlag.map(mapFinding);
      if (recurringFindings.length < 10) {
        const grouped = await tx
          .select({
            locationId: industrialSanitationFindings.locationId,
            category: industrialSanitationFindings.category,
            c: count(),
          })
          .from(industrialSanitationFindings)
          .where(
            and(
              eq(industrialSanitationFindings.tenantId, tenantId),
              isNull(industrialSanitationFindings.archivedAt),
              findingSite,
              gte(industrialSanitationFindings.createdAt, daysAgo(90)),
            ),
          )
          .groupBy(industrialSanitationFindings.locationId, industrialSanitationFindings.category)
          .orderBy(desc(count()))
          .limit(10);
        const extras = grouped
          .filter((g) => Number(g.c ?? 0) >= 2)
          .map((g) => ({
            locationId: g.locationId,
            category: g.category,
            recurrenceCount: Number(g.c ?? 0),
            isRecurring: true,
          }));
        if (!recurringFindings.length) {
          recurringFindings = extras as never;
        }
      }

      const smartInsights: string[] = [];
      const dust30 = dustBuckets.find((b) => b.days === 30)?.count ?? 0;
      const dust60 = dustBuckets.find((b) => b.days === 60)?.count ?? 0;
      const prior30In60 = dust60 - dust30;
      if (prior30In60 > 0 && dust30 > 0) {
        const pct = Math.round(((dust30 - prior30In60) / prior30In60) * 100);
        if (Number.isFinite(pct) && pct !== 0) {
          smartInsights.push(
            `Dust findings ${pct > 0 ? "increased" : "decreased"} ${Math.abs(pct)}% comparing the last 30 days to the prior 30 days`,
          );
        }
      } else if (dust60 > 0 && prior30In60 === 0 && dust30 > 0) {
        smartInsights.push(
          `Dust action-level exceedances rose from 0 to ${dust30} in the last 30 days versus the prior 30 days`,
        );
      }

      const recentScores = inspectionScoreTrend.filter((w) => w.avgScore != null);
      if (recentScores.length >= 4) {
        const last2 = recentScores.slice(-2);
        const prev2 = recentScores.slice(-4, -2);
        const a = avgScore(last2.map((w) => w.avgScore));
        const b = avgScore(prev2.map((w) => w.avgScore));
        if (a != null && b != null && b > 0) {
          const pct = Math.round(((a - b) / b) * 100);
          if (Math.abs(pct) >= 5) {
            smartInsights.push(
              `Inspection scores ${pct > 0 ? "improved" : "declined"} ${Math.abs(pct)}% over the last 2 weeks versus the prior 2 weeks`,
            );
          }
        }
      }

      if (failedVerificationRate != null && totalV >= 5 && failedVerificationRate >= 20) {
        smartInsights.push(
          `Failed verification rate is ${failedVerificationRate}% across ${totalV} verifications`,
        );
      }

      return {
        findingsByCategory: toCountRows(byCategory),
        findingsBySeverity: toCountRows(bySeverity),
        findingsByArea: toCountRows(byArea),
        findingsByInspector: toCountRows(
          byInspector.map((r) => ({ key: r.key, c: r.c })),
        ),
        dustAccumulationTrend: dustBuckets,
        dustTrend: dustBuckets,
        mssCompletionTrend: mssCompletionTrend.map((w) => ({
          ...w,
          label: w.weekStart,
          date: w.weekStart,
          value: w.percent,
          percent: w.percent,
        })),
        mssTrend: mssCompletionTrend.map((w) => ({
          label: w.weekStart,
          date: w.weekStart,
          value: w.percent,
          percent: w.percent,
        })),
        inspectionScoreTrend: inspectionScoreTrend.map((w) => ({
          ...w,
          label: w.weekStart,
          date: w.weekStart,
          score: w.avgScore,
          value: w.avgScore ?? 0,
        })),
        scoreTrend: inspectionScoreTrend.map((w) => ({
          label: w.weekStart,
          date: w.weekStart,
          score: w.avgScore,
          value: w.avgScore ?? 0,
        })),
        failedVerificationRate,
        recurringFindings,
        smartInsights: smartInsights.map((message, idx) => ({
          id: `insight-${idx}`,
          title: "Insight",
          message,
          severity: "INFO",
        })),
      };
    });
  }

  async getHeatMap(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const sevenDaysAgo = daysAgo(7);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const locations = await tx
        .select()
        .from(industrialSanitationLocations)
        .where(
          and(
            eq(industrialSanitationLocations.tenantId, tenantId),
            isNull(industrialSanitationLocations.archivedAt),
            siteId ? eq(industrialSanitationLocations.siteId, siteId) : undefined,
          ),
        )
        .limit(500);

      const openFindings = await tx
        .select({
          locationId: industrialSanitationFindings.locationId,
          severity: industrialSanitationFindings.severity,
          c: count(),
        })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            isNull(industrialSanitationFindings.archivedAt),
            eq(industrialSanitationFindings.status, "OPEN"),
            siteId ? eq(industrialSanitationFindings.siteId, siteId) : undefined,
          ),
        )
        .groupBy(industrialSanitationFindings.locationId, industrialSanitationFindings.severity);

      const dustAlerts = await tx
        .select({
          locationId: industrialSanitationDustMeasurements.locationId,
          c: count(),
        })
        .from(industrialSanitationDustMeasurements)
        .where(
          and(
            eq(industrialSanitationDustMeasurements.tenantId, tenantId),
            isNull(industrialSanitationDustMeasurements.archivedAt),
            eq(industrialSanitationDustMeasurements.exceedsActionLevel, true),
            gte(industrialSanitationDustMeasurements.measuredAt, sevenDaysAgo),
            siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
          ),
        )
        .groupBy(industrialSanitationDustMeasurements.locationId);

      const pestOpen = await tx
        .select({
          locationId: industrialSanitationPestFindings.locationId,
          deviceId: industrialSanitationPestFindings.deviceId,
          c: count(),
        })
        .from(industrialSanitationPestFindings)
        .where(
          and(
            eq(industrialSanitationPestFindings.tenantId, tenantId),
            isNull(industrialSanitationPestFindings.archivedAt),
            eq(industrialSanitationPestFindings.status, "OPEN"),
            siteId ? eq(industrialSanitationPestFindings.siteId, siteId) : undefined,
          ),
        )
        .groupBy(
          industrialSanitationPestFindings.locationId,
          industrialSanitationPestFindings.deviceId,
        );

      const findingStats = new Map<string, { findingCount: number; criticalCount: number; majorCount: number }>();
      for (const row of openFindings) {
        if (!row.locationId) continue;
        const cur = findingStats.get(row.locationId) ?? {
          findingCount: 0,
          criticalCount: 0,
          majorCount: 0,
        };
        const n = Number(row.c ?? 0);
        cur.findingCount += n;
        if (String(row.severity).toUpperCase() === "CRITICAL") cur.criticalCount += n;
        if (String(row.severity).toUpperCase() === "MAJOR") cur.majorCount += n;
        findingStats.set(row.locationId, cur);
      }
      const dustMap = new Map(
        dustAlerts.filter((r) => r.locationId).map((r) => [r.locationId as string, Number(r.c ?? 0)]),
      );
      const pestByLocation = new Map<string, number>();
      const pestByDevice = new Map<string, number>();
      for (const row of pestOpen) {
        const n = Number(row.c ?? 0);
        if (row.locationId) {
          pestByLocation.set(row.locationId, (pestByLocation.get(row.locationId) ?? 0) + n);
        }
        if (row.deviceId) {
          pestByDevice.set(row.deviceId, (pestByDevice.get(row.deviceId) ?? 0) + n);
        }
      }

      const locationItems = locations.map((loc) => {
        const stats = findingStats.get(loc.id) ?? {
          findingCount: 0,
          criticalCount: 0,
          majorCount: 0,
        };
        const dustAlertCount = dustMap.get(loc.id) ?? 0;
        const pestCount = pestByLocation.get(loc.id) ?? 0;
        return {
          ...mapLocation(loc),
          findingCount: stats.findingCount,
          criticalCount: stats.criticalCount,
          dustAlertCount,
          pestCount,
          sanitationStatus: locationSanitationStatus({
            ...stats,
            dustAlertCount,
            pestCount,
          }),
        };
      });

      const devices = await tx
        .select()
        .from(industrialSanitationPestDevices)
        .where(
          and(
            eq(industrialSanitationPestDevices.tenantId, tenantId),
            isNull(industrialSanitationPestDevices.archivedAt),
            siteId ? eq(industrialSanitationPestDevices.siteId, siteId) : undefined,
          ),
        )
        .limit(500);

      const pestDevices = devices.map((d) => ({
        ...mapPestDevice(d),
        openFindingCount: pestByDevice.get(d.id) ?? 0,
      }));

      return { locations: locationItems, pestDevices };
    });
  }

  async listVerifications(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const cleaningTaskId = asOptionalUuid(query.cleaningTaskId);
    const result = asOptionalString(query.result, 64);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(industrialSanitationVerifications)
        .where(
          and(
            eq(industrialSanitationVerifications.tenantId, tenantId),
            isNull(industrialSanitationVerifications.archivedAt),
            siteId ? eq(industrialSanitationVerifications.siteId, siteId) : undefined,
            cleaningTaskId
              ? eq(industrialSanitationVerifications.cleaningTaskId, cleaningTaskId)
              : undefined,
            result ? eq(industrialSanitationVerifications.result, result) : undefined,
          ),
        )
        .orderBy(desc(industrialSanitationVerifications.verifiedAt))
        .limit(200),
    );
    return { items: rows.map(mapVerification) };
  }

  async updateEnvironmentalSample(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const sampleId = asRequiredUuid(id, "id");
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationEnvironmentalSamples)
        .where(
          and(
            eq(industrialSanitationEnvironmentalSamples.id, sampleId),
            eq(industrialSanitationEnvironmentalSamples.tenantId, tenantId),
            isNull(industrialSanitationEnvironmentalSamples.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Environmental sample not found");

      const passFail = (
        asOptionalString(body.passFail, 32) ??
        existing.passFail ??
        ""
      ).toUpperCase();
      const result = asOptionalString(body.result, 200) ?? existing.result;
      const status =
        asOptionalString(body.status, 64) ??
        (passFail === "FAIL" ? "FAILED" : passFail === "PASS" ? "COMPLETED" : existing.status);

      let correctiveActionId = existing.correctiveActionId;
      let createdFinding: ReturnType<typeof mapFinding> | null = null;

      if (passFail === "FAIL" && !correctiveActionId) {
        const findingId = createId();
        const findingNumber = await this.nextNumber(tx, tenantId, "FINDING", "FND");
        const title = `Environmental sample fail: ${existing.sampleNumber ?? existing.sampleType}`;
        correctiveActionId = await this.createCorrectiveAction(tx, {
          tenantId,
          siteId: existing.siteId,
          parentEntityType: "SANITATION_ENV_SAMPLE",
          parentEntityId: sampleId,
          title,
          description: `Sample ${existing.sampleNumber ?? sampleId} result: ${result ?? "FAIL"}`,
          finding: title,
          priority: "MAJOR",
        });
        const category = "ENVIRONMENTAL";
        const priorCount = await countRecurringFindings(
          tx,
          tenantId,
          existing.locationId,
          category,
        );
        const [finding] = await tx
          .insert(industrialSanitationFindings)
          .values({
            id: findingId,
            tenantId,
            siteId: existing.siteId,
            locationId: existing.locationId,
            zoneId: existing.zoneId,
            findingNumber,
            category,
            title: title.slice(0, 500),
            description: `Sample type ${existing.sampleType}; result ${result ?? "FAIL"}`,
            severity: "MAJOR",
            status: "OPEN",
            regulationRefs: [],
            photosJson: [],
            isRecurring: priorCount >= 2,
            recurrenceCount: priorCount,
            correctiveActionId,
            reportedByUserId: principal.userId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (finding) createdFinding = mapFinding(finding);
      }

      const [row] = await tx
        .update(industrialSanitationEnvironmentalSamples)
        .set({
          result,
          passFail: passFail || existing.passFail,
          status,
          correctiveActionId,
          updatedAt: now,
        })
        .where(eq(industrialSanitationEnvironmentalSamples.id, sampleId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update environmental sample");
      return { ...mapEnvSample(row), finding: createdFinding };
    });
  }

  async completeCompressedAirRequest(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const requestId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationCompressedAirRequests)
        .where(
          and(
            eq(industrialSanitationCompressedAirRequests.id, requestId),
            eq(industrialSanitationCompressedAirRequests.tenantId, tenantId),
            isNull(industrialSanitationCompressedAirRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Compressed air request not found");
      if (existing.status !== "APPROVED" && existing.status !== "IN_PROGRESS") {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Only approved or in-progress requests can be completed",
        );
      }
      const [row] = await tx
        .update(industrialSanitationCompressedAirRequests)
        .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
        .where(eq(industrialSanitationCompressedAirRequests.id, requestId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to complete request");
      return mapCompressedAir(row);
    });
  }

  async verifyCompressedAirRequest(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const requestId = asRequiredUuid(id, "id");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationCompressedAirRequests)
        .where(
          and(
            eq(industrialSanitationCompressedAirRequests.id, requestId),
            eq(industrialSanitationCompressedAirRequests.tenantId, tenantId),
            isNull(industrialSanitationCompressedAirRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Compressed air request not found");
      if (existing.status !== "COMPLETED") {
        throw new ForgeError("VALIDATION_FAILED", "Only completed requests can be verified");
      }
      const [row] = await tx
        .update(industrialSanitationCompressedAirRequests)
        .set({ status: "VERIFIED", verifiedAt: now, updatedAt: now })
        .where(eq(industrialSanitationCompressedAirRequests.id, requestId))
        .returning();
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to verify request");
      return mapCompressedAir(row);
    });
  }

  async getInspectionPrintable(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const detail = await this.getInspection(principal, id);
    const inspection = detail as Record<string, unknown>;
    const findings = Array.isArray((detail as { findings?: unknown }).findings)
      ? ((detail as { findings: Array<Record<string, unknown>> }).findings)
      : [];
    const title =
      String(inspection.title ?? inspection.inspectionNumber ?? "Sanitation inspection").trim() ||
      "Sanitation inspection";

    const branding = await this.loadReportBranding(tenantId);
    const html = buildSanitationInspectionPrintableHtml(inspection, findings, branding);
    return { html, title };
  }

  private async loadReportBranding(
    tenantId: string,
  ): Promise<{ companyName: string | null; logoUrl: string | null }> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const tenantRows = await tx.execute(sql`
        select tenant_key, display_name, legal_name
        from tenants
        where id = ${tenantId}::uuid
        limit 1
      `);
      const tenantRow = (Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]) as
        | Record<string, unknown>
        | undefined;
      const brandingRows = await tx.execute(sql`
        select cv.payload_json as payload
        from config_objects co
        join config_versions cv on cv.id = co.current_published_version_id
        where co.tenant_id = ${tenantId}::uuid
          and co.namespace = 'branding'
          and co.object_key = 'default'
        limit 1
      `);
      const brandingPayloadRaw = (Array.isArray(brandingRows)
        ? brandingRows[0]
        : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]) as
        | { payload?: unknown }
        | undefined;
      const payload =
        brandingPayloadRaw?.payload && typeof brandingPayloadRaw.payload === "object"
          ? (brandingPayloadRaw.payload as Record<string, unknown>)
          : {};
      const tenantKey = String(tenantRow?.tenant_key ?? "").trim();
      const companyName =
        String(
          payload.productDisplayName ??
            tenantRow?.display_name ??
            tenantRow?.legal_name ??
            "",
        ).trim() || null;
      const logoUrl =
        String(payload.logoUrl ?? payload.logo_url ?? "").trim() ||
        (tenantKey === "producers-rice-mill"
          ? "https://producersrice.forgeindustrialsafety.com/branding/producers-rice-mill.png"
          : null);
      return { companyName, logoUrl };
    });
  }

  private async loadLogoImage(url: string | null): Promise<Buffer | null> {
    if (!url) return null;
    const inline = decodeImageDataUrl(url);
    if (inline) return inline;
    if (!/^https:\/\//i.test(url)) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!/image\/(png|jpe?g)/.test(type)) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      return buffer.length > 0 && buffer.length <= 2_000_000 ? buffer : null;
    } catch {
      return null;
    }
  }

  /** Active personnel with an email address, for choosing report recipients. */
  async listReportRecipients(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select({
          id: industrialPersonnel.id,
          displayName: industrialPersonnel.displayName,
          firstName: industrialPersonnel.firstName,
          lastName: industrialPersonnel.lastName,
          preferredName: industrialPersonnel.preferredName,
          email: industrialPersonnel.email,
          companyEmail: industrialPersonnel.companyEmail,
          jobTitle: industrialPersonnel.jobTitle,
          departmentName: industrialPersonnel.departmentName,
          status: industrialPersonnel.status,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            isNull(industrialPersonnel.archivedAt),
            sql`lower(coalesce(${industrialPersonnel.status}, 'active')) not in ('inactive', 'terminated', 'separated', 'archived')`,
            sql`coalesce(nullif(trim(${industrialPersonnel.companyEmail}), ''), nullif(trim(${industrialPersonnel.email}), '')) is not null`,
          ),
        )
        .limit(5000),
    );
    const items = rows
      .map((row) => {
        const email = personnelReportEmail(row);
        if (!email) return null;
        return {
          id: row.id,
          name: personnelReportName(row),
          email,
          jobTitle: row.jobTitle?.trim() || null,
          departmentName: row.departmentName?.trim() || null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { items };
  }

  /** Renders a completed inspection to PDF and emails it to the chosen personnel. */
  async emailInspectionPdf(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const rawIds = Array.isArray(body.personnelIds) ? body.personnelIds : [];
    const personnelIds = [
      ...new Set(rawIds.map((v) => String(v ?? "").trim()).filter((v) => UUID_RE.test(v))),
    ];
    if (!personnelIds.length) {
      throw new ForgeError("VALIDATION_FAILED", "Choose at least one recipient");
    }
    if (personnelIds.length > MAX_REPORT_RECIPIENTS) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Choose no more than ${MAX_REPORT_RECIPIENTS} recipients`,
      );
    }
    const note = asOptionalString(body.message, 2000) ?? "";
    const timeZone = isValidTimeZone(body.timeZone) ? body.timeZone : undefined;

    const detail = (await this.getInspection(principal, id)) as Record<string, unknown> & {
      findings?: Array<Record<string, unknown>>;
    };
    if (String(detail.status ?? "").toUpperCase() !== "COMPLETED") {
      throw new ForgeError("VALIDATION_FAILED", "Only completed inspections can be emailed");
    }

    const lookups = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const people = await tx
        .select({
          id: industrialPersonnel.id,
          displayName: industrialPersonnel.displayName,
          firstName: industrialPersonnel.firstName,
          lastName: industrialPersonnel.lastName,
          preferredName: industrialPersonnel.preferredName,
          email: industrialPersonnel.email,
          companyEmail: industrialPersonnel.companyEmail,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            inArray(industrialPersonnel.id, personnelIds),
            isNull(industrialPersonnel.archivedAt),
          ),
        );

      let questions: SanitationPdfQuestion[] = [];
      const templateId = typeof detail.templateId === "string" ? detail.templateId : null;
      if (templateId) {
        const [template] = await tx
          .select({ templateJson: industrialSanitationTemplates.templateJson })
          .from(industrialSanitationTemplates)
          .where(eq(industrialSanitationTemplates.id, templateId))
          .limit(1);
        const tj = asJsonObject(template?.templateJson);
        const sections = Array.isArray(tj.sections) ? (tj.sections as TemplateSection[]) : [];
        questions = sections.flatMap((s) =>
          (s.questions ?? [])
            .filter((q) => q && typeof q.id === "string")
            .map((q) => ({ id: q.id, label: String(q.label ?? q.id), section: String(s.title ?? "") })),
        );
      }

      let siteName: string | null = null;
      let siteTimeZone: string | null = null;
      const siteId = typeof detail.siteId === "string" ? detail.siteId : null;
      if (siteId) {
        const [site] = await tx
          .select({ name: industrialSites.name, timezone: industrialSites.timezone })
          .from(industrialSites)
          .where(and(eq(industrialSites.id, siteId), eq(industrialSites.tenantId, tenantId)))
          .limit(1);
        siteName = site?.name ?? null;
        siteTimeZone = isValidTimeZone(site?.timezone) ? site.timezone : null;
      }

      let locationName: string | null = null;
      const locationId = typeof detail.locationId === "string" ? detail.locationId : null;
      if (locationId) {
        const [location] = await tx
          .select({ name: industrialSanitationLocations.name })
          .from(industrialSanitationLocations)
          .where(
            and(
              eq(industrialSanitationLocations.id, locationId),
              eq(industrialSanitationLocations.tenantId, tenantId),
            ),
          )
          .limit(1);
        locationName = location?.name ?? null;
      }

      return { people, questions, siteName, siteTimeZone, locationName };
    });

    const byId = new Map(lookups.people.map((p) => [p.id, p]));
    const recipients: Array<{ personnelId: string; name: string; email: string }> = [];
    const skipped: Array<{ personnelId: string; name: string | null; reason: string }> = [];
    for (const personnelId of personnelIds) {
      const person = byId.get(personnelId);
      if (!person) {
        skipped.push({ personnelId, name: null, reason: "Person not found" });
        continue;
      }
      const email = personnelReportEmail(person);
      const name = personnelReportName(person);
      if (!email) {
        skipped.push({ personnelId, name, reason: "No email address on file" });
        continue;
      }
      if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) continue;
      recipients.push({ personnelId, name, email });
    }
    if (!recipients.length) {
      throw new ForgeError("VALIDATION_FAILED", "None of the selected people have an email address");
    }

    const branding = await this.loadReportBranding(tenantId);
    const logo = await this.loadLogoImage(branding.logoUrl);
    const pdfTimeZone = lookups.siteTimeZone ?? timeZone;
    const pdf = await buildSanitationInspectionPdf({
      inspection: detail,
      findings: Array.isArray(detail.findings) ? detail.findings : [],
      questions: lookups.questions,
      companyName: branding.companyName,
      siteName: lookups.siteName,
      locationName: lookups.locationName,
      logo,
      ...(pdfTimeZone ? { timeZone: pdfTimeZone } : {}),
    });
    if (pdf.length > MAX_REPORT_PDF_BYTES) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "The report PDF is too large to email. Print it and share it another way.",
      );
    }
    const filename = sanitationPdfFilename(detail);
    const attachment = {
      filename,
      contentType: "application/pdf",
      contentBase64: pdf.toString("base64"),
    };

    const title =
      String(detail.title ?? detail.inspectionNumber ?? "Sanitation inspection").trim() ||
      "Sanitation inspection";
    const number = String(detail.inspectionNumber ?? "").trim();
    const compliance = String(detail.complianceStatus ?? "").replace(/_/g, " ").trim();
    const score =
      detail.scorePercent != null && Number.isFinite(Number(detail.scorePercent))
        ? `${Math.round(Number(detail.scorePercent))}%`
        : "";
    const company = branding.companyName ?? "Forge";
    const subject = `Sanitation inspection report: ${number || title}`;
    const facts: Array<[string, string]> = [
      ["Inspection", number],
      ["Location", [lookups.siteName, lookups.locationName].filter(Boolean).join(" - ")],
      ["Compliance", compliance],
      ["Score", score],
    ];
    const factHtml = facts
      .filter(([, v]) => v)
      .map(([k, v]) => `<li><strong>${escapeSanitationHtml(k)}:</strong> ${escapeSanitationHtml(v)}</li>`)
      .join("");
    const noteHtml = note
      ? `<p style="white-space:pre-wrap;border-left:3px solid #d1d5db;padding-left:10px">${escapeSanitationHtml(note)}</p>`
      : "";
    const htmlBody = [
      `<p>A completed sanitation inspection report from ${escapeSanitationHtml(company)} is attached as a PDF.</p>`,
      `<p><strong>${escapeSanitationHtml(title)}</strong></p>`,
      factHtml ? `<ul>${factHtml}</ul>` : "",
      noteHtml,
      `<p style="color:#6b7280;font-size:12px">Attachment: ${escapeSanitationHtml(filename)}</p>`,
    ].join("");
    const textBody = [
      `A completed sanitation inspection report from ${company} is attached as a PDF.`,
      title,
      ...facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
      note ? `\n${note}` : "",
      `Attachment: ${filename}`,
    ]
      .filter(Boolean)
      .join("\n");

    const results: Array<{
      personnelId: string;
      name: string;
      email: string;
      accepted: boolean;
      detail?: string;
    }> = [];
    for (const recipient of recipients) {
      try {
        const result = await this.notifications.sendTemplatedEmail({
          to: recipient.email,
          templateKey: "sanitation_inspection_completed",
          tenantId,
          vars: { subject, htmlBody, textBody },
          attachments: [attachment],
        });
        results.push({
          ...recipient,
          accepted: result.accepted,
          ...(result.accepted || !result.detail ? {} : { detail: result.detail }),
        });
      } catch (err) {
        results.push({
          ...recipient,
          accepted: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const sent = results.filter((r) => r.accepted).length;
    this.logger.log(
      `Sanitation inspection ${id} PDF emailed by ${principal.userId}: ${sent}/${results.length} accepted`,
    );
    return {
      filename,
      sizeBytes: pdf.length,
      sent,
      failed: results.length - sent,
      results,
      skipped,
    };
  }

  async getAuditPackage(principal: ForgePrincipal, query: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const from = asOptionalDate(query.from ?? query.dateFrom);
    const to = asOptionalDate(query.to ?? query.dateTo);
    if (!from || !to) {
      throw new ForgeError("VALIDATION_FAILED", "from and to dates are required");
    }
    const siteId = asOptionalUuid(query.siteId);
    const includeRaw = query.include;
    const includeSet = new Set<string>(
      Array.isArray(includeRaw)
        ? includeRaw.map((x) => String(x).toLowerCase())
        : String(includeRaw ?? "inspections,findings,dust,spills,pest,cleaning,mss,chemicals")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    );

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      let siteName: string | undefined;
      if (siteId) {
        const [site] = await tx
          .select({ name: industrialSites.name })
          .from(industrialSites)
          .where(and(eq(industrialSites.id, siteId), eq(industrialSites.tenantId, tenantId)))
          .limit(1);
        siteName = site?.name;
      }

      const inspections = includeSet.has("inspections")
        ? (
            await tx
              .select()
              .from(industrialSanitationInspections)
              .where(
                and(
                  eq(industrialSanitationInspections.tenantId, tenantId),
                  isNull(industrialSanitationInspections.archivedAt),
                  gte(industrialSanitationInspections.completedAt, from),
                  lte(industrialSanitationInspections.completedAt, to),
                  siteId ? eq(industrialSanitationInspections.siteId, siteId) : undefined,
                ),
              )
              .orderBy(desc(industrialSanitationInspections.completedAt))
              .limit(500)
          ).map(mapInspection)
        : [];

      const findings = includeSet.has("findings")
        ? (
            await tx
              .select()
              .from(industrialSanitationFindings)
              .where(
                and(
                  eq(industrialSanitationFindings.tenantId, tenantId),
                  isNull(industrialSanitationFindings.archivedAt),
                  gte(industrialSanitationFindings.createdAt, from),
                  lte(industrialSanitationFindings.createdAt, to),
                  siteId ? eq(industrialSanitationFindings.siteId, siteId) : undefined,
                ),
              )
              .orderBy(desc(industrialSanitationFindings.createdAt))
              .limit(500)
          ).map(mapFinding)
        : [];

      const dust = includeSet.has("dust")
        ? (
            await tx
              .select()
              .from(industrialSanitationDustMeasurements)
              .where(
                and(
                  eq(industrialSanitationDustMeasurements.tenantId, tenantId),
                  isNull(industrialSanitationDustMeasurements.archivedAt),
                  gte(industrialSanitationDustMeasurements.measuredAt, from),
                  lte(industrialSanitationDustMeasurements.measuredAt, to),
                  siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
                ),
              )
              .orderBy(desc(industrialSanitationDustMeasurements.measuredAt))
              .limit(500)
          ).map(mapDust)
        : [];

      const spills = includeSet.has("spills")
        ? (
            await tx
              .select()
              .from(industrialSanitationSpills)
              .where(
                and(
                  eq(industrialSanitationSpills.tenantId, tenantId),
                  isNull(industrialSanitationSpills.archivedAt),
                  gte(industrialSanitationSpills.reportedAt, from),
                  lte(industrialSanitationSpills.reportedAt, to),
                  siteId ? eq(industrialSanitationSpills.siteId, siteId) : undefined,
                ),
              )
              .orderBy(desc(industrialSanitationSpills.reportedAt))
              .limit(500)
          ).map(mapSpill)
        : [];

      const pestFindings = includeSet.has("pest")
        ? (
            await tx
              .select()
              .from(industrialSanitationPestFindings)
              .where(
                and(
                  eq(industrialSanitationPestFindings.tenantId, tenantId),
                  isNull(industrialSanitationPestFindings.archivedAt),
                  gte(industrialSanitationPestFindings.observedAt, from),
                  lte(industrialSanitationPestFindings.observedAt, to),
                  siteId ? eq(industrialSanitationPestFindings.siteId, siteId) : undefined,
                ),
              )
              .orderBy(desc(industrialSanitationPestFindings.observedAt))
              .limit(500)
          ).map(mapPestFinding)
        : [];

      const cleaningTasks = includeSet.has("cleaning")
        ? (
            await tx
              .select()
              .from(industrialSanitationCleaningTasks)
              .where(
                and(
                  eq(industrialSanitationCleaningTasks.tenantId, tenantId),
                  isNull(industrialSanitationCleaningTasks.archivedAt),
                  or(
                    and(
                      gte(industrialSanitationCleaningTasks.dueAt, from),
                      lte(industrialSanitationCleaningTasks.dueAt, to),
                    ),
                    and(
                      gte(industrialSanitationCleaningTasks.completedAt, from),
                      lte(industrialSanitationCleaningTasks.completedAt, to),
                    ),
                  ),
                  siteId ? eq(industrialSanitationCleaningTasks.siteId, siteId) : undefined,
                ),
              )
              .orderBy(desc(industrialSanitationCleaningTasks.dueAt))
              .limit(500)
          ).map(mapCleaningTask)
        : [];

      const mss = includeSet.has("mss")
        ? (
            await tx
              .select()
              .from(industrialSanitationMasterSchedule)
              .where(
                and(
                  eq(industrialSanitationMasterSchedule.tenantId, tenantId),
                  isNull(industrialSanitationMasterSchedule.archivedAt),
                  siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
                ),
              )
              .orderBy(industrialSanitationMasterSchedule.title)
              .limit(500)
          ).map(mapMss)
        : [];

      const chemicals = includeSet.has("chemicals")
        ? (
            await tx
              .select()
              .from(industrialSanitationChemicals)
              .where(
                and(
                  eq(industrialSanitationChemicals.tenantId, tenantId),
                  isNull(industrialSanitationChemicals.archivedAt),
                  siteId ? eq(industrialSanitationChemicals.siteId, siteId) : undefined,
                ),
              )
              .orderBy(industrialSanitationChemicals.name)
              .limit(500)
          ).map(mapChemical)
        : [];

      const summary = {
        inspections: inspections.length,
        findings: findings.length,
        dust: dust.length,
        spills: spills.length,
        pestFindings: pestFindings.length,
        cleaningTasks: cleaningTasks.length,
        mss: mss.length,
        chemicals: chemicals.length,
      };

      const title = `Sanitation audit package (${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)})`;
      const html = buildSanitationAuditPackageHtml({
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
        ...(siteName ? { siteName } : {}),
        inspections: inspections as Array<Record<string, unknown>>,
        findings: findings as Array<Record<string, unknown>>,
        dust: dust as Array<Record<string, unknown>>,
        spills: spills as Array<Record<string, unknown>>,
        pestFindings: pestFindings as Array<Record<string, unknown>>,
        cleaningTasks: cleaningTasks as Array<Record<string, unknown>>,
        mss: mss as Array<Record<string, unknown>>,
        chemicals: chemicals as Array<Record<string, unknown>>,
      });

      return { html, title, summary };
    });
  }

  async exportCsv(principal: ForgePrincipal, kind: string, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const siteId = asOptionalUuid(query.siteId);
    const k = String(kind ?? query.kind ?? "")
      .trim()
      .toLowerCase()
      .replace(/\.csv$/, "");
    const stamp = new Date().toISOString().slice(0, 10);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      switch (k) {
        case "inspections": {
          const rows = await tx
            .select()
            .from(industrialSanitationInspections)
            .where(
              and(
                eq(industrialSanitationInspections.tenantId, tenantId),
                isNull(industrialSanitationInspections.archivedAt),
                siteId ? eq(industrialSanitationInspections.siteId, siteId) : undefined,
              ),
            )
            .orderBy(desc(industrialSanitationInspections.createdAt))
            .limit(2000);
          const headers = [
            "inspectionNumber",
            "title",
            "inspectionType",
            "status",
            "complianceStatus",
            "scorePercent",
            "completedAt",
          ];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapInspection(r) as Record<string, unknown>),
            ),
            filename: `sanitation-inspections-${stamp}.csv`,
          };
        }
        case "findings": {
          const rows = await tx
            .select()
            .from(industrialSanitationFindings)
            .where(
              and(
                eq(industrialSanitationFindings.tenantId, tenantId),
                isNull(industrialSanitationFindings.archivedAt),
                siteId ? eq(industrialSanitationFindings.siteId, siteId) : undefined,
              ),
            )
            .orderBy(desc(industrialSanitationFindings.createdAt))
            .limit(2000);
          const headers = [
            "findingNumber",
            "severity",
            "category",
            "title",
            "status",
            "isRecurring",
            "recurrenceCount",
            "createdAt",
          ];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapFinding(r) as Record<string, unknown>),
            ),
            filename: `sanitation-findings-${stamp}.csv`,
          };
        }
        case "dust": {
          const rows = await tx
            .select()
            .from(industrialSanitationDustMeasurements)
            .where(
              and(
                eq(industrialSanitationDustMeasurements.tenantId, tenantId),
                isNull(industrialSanitationDustMeasurements.archivedAt),
                siteId ? eq(industrialSanitationDustMeasurements.siteId, siteId) : undefined,
              ),
            )
            .orderBy(desc(industrialSanitationDustMeasurements.measuredAt))
            .limit(2000);
          const headers = [
            "measurementNumber",
            "dustDepthInches",
            "exceedsActionLevel",
            "isPriorityArea",
            "measuredAt",
          ];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapDust(r) as Record<string, unknown>),
            ),
            filename: `sanitation-dust-${stamp}.csv`,
          };
        }
        case "mss": {
          const rows = await tx
            .select()
            .from(industrialSanitationMasterSchedule)
            .where(
              and(
                eq(industrialSanitationMasterSchedule.tenantId, tenantId),
                isNull(industrialSanitationMasterSchedule.archivedAt),
                siteId ? eq(industrialSanitationMasterSchedule.siteId, siteId) : undefined,
              ),
            )
            .orderBy(industrialSanitationMasterSchedule.title)
            .limit(2000);
          const headers = ["title", "cleaningTask", "frequency", "nextDueAt", "status"];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapMss(r) as Record<string, unknown>),
            ),
            filename: `sanitation-mss-${stamp}.csv`,
          };
        }
        case "cleaning": {
          const rows = await tx
            .select()
            .from(industrialSanitationCleaningTasks)
            .where(
              and(
                eq(industrialSanitationCleaningTasks.tenantId, tenantId),
                isNull(industrialSanitationCleaningTasks.archivedAt),
                siteId ? eq(industrialSanitationCleaningTasks.siteId, siteId) : undefined,
              ),
            )
            .orderBy(desc(industrialSanitationCleaningTasks.dueAt))
            .limit(2000);
          const headers = ["taskNumber", "title", "status", "dueAt", "completedAt"];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapCleaningTask(r) as Record<string, unknown>),
            ),
            filename: `sanitation-cleaning-${stamp}.csv`,
          };
        }
        case "spills": {
          const rows = await tx
            .select()
            .from(industrialSanitationSpills)
            .where(
              and(
                eq(industrialSanitationSpills.tenantId, tenantId),
                isNull(industrialSanitationSpills.archivedAt),
                siteId ? eq(industrialSanitationSpills.siteId, siteId) : undefined,
              ),
            )
            .orderBy(desc(industrialSanitationSpills.reportedAt))
            .limit(2000);
          const headers = ["spillNumber", "product", "status", "reportedAt"];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapSpill(r) as Record<string, unknown>),
            ),
            filename: `sanitation-spills-${stamp}.csv`,
          };
        }
        case "pest": {
          const rows = await tx
            .select()
            .from(industrialSanitationPestFindings)
            .where(
              and(
                eq(industrialSanitationPestFindings.tenantId, tenantId),
                isNull(industrialSanitationPestFindings.archivedAt),
                siteId ? eq(industrialSanitationPestFindings.siteId, siteId) : undefined,
              ),
            )
            .orderBy(desc(industrialSanitationPestFindings.observedAt))
            .limit(2000);
          const headers = [
            "pestCategory",
            "pestSpecies",
            "activityLevel",
            "status",
            "observedAt",
          ];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapPestFinding(r) as Record<string, unknown>),
            ),
            filename: `sanitation-pest-${stamp}.csv`,
          };
        }
        case "chemicals": {
          const rows = await tx
            .select()
            .from(industrialSanitationChemicals)
            .where(
              and(
                eq(industrialSanitationChemicals.tenantId, tenantId),
                isNull(industrialSanitationChemicals.archivedAt),
                siteId ? eq(industrialSanitationChemicals.siteId, siteId) : undefined,
              ),
            )
            .orderBy(industrialSanitationChemicals.name)
            .limit(2000);
          const headers = ["name", "manufacturer", "status", "foodContactApproved"];
          return {
            csv: rowsToCsv(
              headers,
              rows.map((r) => mapChemical(r) as Record<string, unknown>),
            ),
            filename: `sanitation-chemicals-${stamp}.csv`,
          };
        }
        default:
          throw new ForgeError(
            "VALIDATION_FAILED",
            "kind must be one of: inspections, findings, dust, mss, cleaning, spills, pest, chemicals",
          );
      }
    });
  }

  async generateLocationQrToken(principal: ForgePrincipal, locationId: string) {
    const tenantId = this.tenant(principal);
    const id = asRequiredUuid(locationId, "locationId");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationLocations)
        .where(
          and(
            eq(industrialSanitationLocations.id, id),
            eq(industrialSanitationLocations.tenantId, tenantId),
            isNull(industrialSanitationLocations.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Location not found");
      let token = existing.qrToken;
      if (!token) {
        token = randomQrToken();
        await tx
          .update(industrialSanitationLocations)
          .set({ qrToken: token, updatedAt: now })
          .where(eq(industrialSanitationLocations.id, id));
      }
      return {
        qrToken: token,
        scanPath: `/scan/sanitation-location/${token}`,
        locationId: id,
      };
    });
  }

  async generatePestDeviceQrToken(principal: ForgePrincipal, deviceId: string) {
    const tenantId = this.tenant(principal);
    const id = asRequiredUuid(deviceId, "deviceId");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSanitationPestDevices)
        .where(
          and(
            eq(industrialSanitationPestDevices.id, id),
            eq(industrialSanitationPestDevices.tenantId, tenantId),
            isNull(industrialSanitationPestDevices.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Pest device not found");
      let token = existing.qrToken;
      if (!token) {
        token = randomQrToken();
        await tx
          .update(industrialSanitationPestDevices)
          .set({ qrToken: token, updatedAt: now })
          .where(eq(industrialSanitationPestDevices.id, id));
      }
      return {
        qrToken: token,
        scanPath: `/scan/sanitation-pest-device/${token}`,
        deviceId: id,
      };
    });
  }

  async resolveLocationByQr(principal: ForgePrincipal, token: string) {
    const tenantId = this.tenant(principal);
    const qrToken = asRequiredString(token, "token", 120);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [location] = await tx
        .select()
        .from(industrialSanitationLocations)
        .where(
          and(
            eq(industrialSanitationLocations.tenantId, tenantId),
            eq(industrialSanitationLocations.qrToken, qrToken),
            isNull(industrialSanitationLocations.archivedAt),
          ),
        )
        .limit(1);
      if (!location) throw new ForgeError("NOT_FOUND", "Sanitation location QR not found");

      const [openFindings] = await tx
        .select({ value: count() })
        .from(industrialSanitationFindings)
        .where(
          and(
            eq(industrialSanitationFindings.tenantId, tenantId),
            eq(industrialSanitationFindings.locationId, location.id),
            inArray(industrialSanitationFindings.status, ["OPEN", "IN_PROGRESS"]),
            isNull(industrialSanitationFindings.archivedAt),
          ),
        );

      const [lastInspection] = await tx
        .select()
        .from(industrialSanitationInspections)
        .where(
          and(
            eq(industrialSanitationInspections.tenantId, tenantId),
            eq(industrialSanitationInspections.locationId, location.id),
            isNull(industrialSanitationInspections.archivedAt),
          ),
        )
        .orderBy(desc(industrialSanitationInspections.completedAt))
        .limit(1);

      const [lastCleaning] = await tx
        .select()
        .from(industrialSanitationCleaningTasks)
        .where(
          and(
            eq(industrialSanitationCleaningTasks.tenantId, tenantId),
            eq(industrialSanitationCleaningTasks.locationId, location.id),
            isNull(industrialSanitationCleaningTasks.archivedAt),
          ),
        )
        .orderBy(desc(industrialSanitationCleaningTasks.completedAt))
        .limit(1);

      const openCount = Number(openFindings?.value ?? 0);
      const status =
        openCount > 0
          ? "ATTENTION"
          : lastInspection?.complianceStatus === "FAILED_PRODUCTION_HOLD" ||
              lastInspection?.status === "FAIL"
            ? "CRITICAL"
            : "GOOD";

      return {
        kind: "SANITATION_LOCATION" as const,
        location: mapLocation(location),
        sanitationStatus: status,
        openFindingCount: openCount,
        lastInspection: lastInspection
          ? {
              id: lastInspection.id,
              title: lastInspection.title,
              completedAt: iso(lastInspection.completedAt),
              complianceStatus: lastInspection.complianceStatus,
            }
          : null,
        lastCleaning: lastCleaning
          ? {
              id: lastCleaning.id,
              title: lastCleaning.title,
              completedAt: iso(lastCleaning.completedAt),
              status: lastCleaning.status,
            }
          : null,
        actions: [
          { id: "start_inspection", label: "Start Inspection", href: "/sanitation/?mode=inspect" },
          { id: "complete_cleaning", label: "Complete Cleaning", href: "/sanitation/?mode=cleaning" },
          { id: "report_issue", label: "Report Sanitation Issue", href: "/sanitation/?mode=concern" },
          { id: "dust_measurement", label: "Dust Measurement", href: "/sanitation/?mode=dust" },
        ],
      };
    });
  }

  async resolvePestDeviceByQr(principal: ForgePrincipal, token: string) {
    const tenantId = this.tenant(principal);
    const qrToken = asRequiredString(token, "token", 120);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [device] = await tx
        .select()
        .from(industrialSanitationPestDevices)
        .where(
          and(
            eq(industrialSanitationPestDevices.tenantId, tenantId),
            eq(industrialSanitationPestDevices.qrToken, qrToken),
            isNull(industrialSanitationPestDevices.archivedAt),
          ),
        )
        .limit(1);
      if (!device) throw new ForgeError("NOT_FOUND", "Pest device QR not found");

      const findings = await tx
        .select()
        .from(industrialSanitationPestFindings)
        .where(
          and(
            eq(industrialSanitationPestFindings.tenantId, tenantId),
            eq(industrialSanitationPestFindings.deviceId, device.id),
            isNull(industrialSanitationPestFindings.archivedAt),
          ),
        )
        .orderBy(desc(industrialSanitationPestFindings.observedAt))
        .limit(10);

      return {
        kind: "SANITATION_PEST_DEVICE" as const,
        device: mapPestDevice(device),
        recentFindings: findings.map(mapPestFinding),
        actions: [
          { id: "record_finding", label: "Record Pest Finding", href: "/sanitation/?mode=concern" },
          { id: "start_pest_inspection", label: "Start Pest Inspection", href: "/sanitation/?mode=inspect" },
        ],
      };
    });
  }

  async listRegulatoryLibrary(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    const refs = new Set<string>(STATIC_REGULATORY_REFS);

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const templates = await tx
        .select({
          templateJson: industrialSanitationTemplates.templateJson,
        })
        .from(industrialSanitationTemplates)
        .where(
          and(
            isNull(industrialSanitationTemplates.archivedAt),
            or(
              isNull(industrialSanitationTemplates.tenantId),
              eq(industrialSanitationTemplates.tenantId, tenantId),
            ),
          ),
        );
      for (const t of templates) {
        const tj = asJsonObject(t.templateJson);
        const sections = Array.isArray(tj.sections) ? (tj.sections as TemplateSection[]) : [];
        for (const section of sections) {
          for (const q of section.questions ?? []) {
            if (q.regulationRef?.trim()) refs.add(q.regulationRef.trim());
          }
        }
      }
    });

    return {
      items: [...refs].sort((a, b) => a.localeCompare(b)).map((regulationRef) => ({ regulationRef })),
    };
  }

  // ── UI settings (sub-module tab visibility) ──────────────────────────────

  async getUiSettings(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.getOrCreateUiSettings(tx, tenantId, principal.userId);
      return this.mapUiSettings(row);
    });
  }

  async updateUiSettings(principal: ForgePrincipal, body: Record<string, unknown>) {
    this.assertCanManageSanitationSubmodules(principal);
    const tenantId = this.tenant(principal);
    const disabledTabs = this.normalizeDisabledTabs(body.disabledTabs);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const current = await this.getOrCreateUiSettings(tx, tenantId, principal.userId);
      const now = new Date();
      await tx
        .update(industrialSanitationUiSettings)
        .set({
          disabledTabs,
          updatedByUserId: principal.userId,
          updatedAt: now,
        })
        .where(eq(industrialSanitationUiSettings.id, current.id));

      const [updated] = await tx
        .select()
        .from(industrialSanitationUiSettings)
        .where(eq(industrialSanitationUiSettings.id, current.id))
        .limit(1);
      if (!updated) throw new ForgeError("INTERNAL_ERROR", "Failed to update sanitation UI settings");
      return this.mapUiSettings(updated);
    }, principal.userId);
  }

  private assertCanManageSanitationSubmodules(principal: ForgePrincipal) {
    if (principal.isPlatformAdmin) return;
    if (principal.activeProducts.has("FORGE_CREATOR")) return;
    if (
      principal.permissions.has("industrial.admin") ||
      principal.permissions.has("industrial.sanitation.manage")
    ) {
      return;
    }
    throw new ForgeError(
      "FORBIDDEN",
      "Only a Tenant Admin or Creator can change Sanitation sub-modules.",
    );
  }

  private normalizeDisabledTabs(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new ForgeError("VALIDATION_FAILED", "disabledTabs must be an array of tab ids");
    }
    const allowed = new Set<string>(SANITATION_TOGGLEABLE_TAB_IDS);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of value) {
      if (typeof raw !== "string") {
        throw new ForgeError("VALIDATION_FAILED", "disabledTabs entries must be strings");
      }
      const id = raw.trim();
      if (!id || id === "settings") continue;
      if (!allowed.has(id)) {
        throw new ForgeError("VALIDATION_FAILED", `Unknown sanitation tab: ${id}`);
      }
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private mapUiSettings(row: typeof industrialSanitationUiSettings.$inferSelect) {
    const disabledTabs = Array.isArray(row.disabledTabs)
      ? row.disabledTabs.filter((v): v is string => typeof v === "string")
      : [];
    return {
      id: row.id,
      tenantId: row.tenantId,
      disabledTabs,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async getOrCreateUiSettings(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
  ) {
    const [existing] = await tx
      .select()
      .from(industrialSanitationUiSettings)
      .where(eq(industrialSanitationUiSettings.tenantId, tenantId))
      .limit(1);
    if (existing) return existing;

    const id = createId();
    const now = new Date();
    await tx.insert(industrialSanitationUiSettings).values({
      id,
      tenantId,
      disabledTabs: [],
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const [created] = await tx
      .select()
      .from(industrialSanitationUiSettings)
      .where(eq(industrialSanitationUiSettings.id, id))
      .limit(1);
    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create sanitation UI settings");
    return created;
  }
}

/** Tab ids that may be turned off (Settings is always on). */
const SANITATION_TOGGLEABLE_TAB_IDS = [
  "dashboard",
  "analytics",
  "heatmap",
  "inspections",
  "start",
  "preop",
  "run",
  "mss",
  "cleaning",
  "dust",
  "environmental",
  "spills",
  "zones",
  "pest",
  "chemicals",
  "compressed-air",
  "findings",
  "verification",
  "concerns",
  "reports",
  "regulatory",
  "profile",
  "templates",
] as const;
