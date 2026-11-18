/**
 * Upsert Commercial Grain Housekeeping template (SAN-DAILY) for producers-rice-mill.
 * Sets app.current_tenant_id so FORCE RLS allows the write.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/refresh-sanitation-templates.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const SECRET_ARN = process.env.FORGE_ADMIN_DB_SECRET_ARN || process.env.DATABASE_SECRET_ARN;

const SAN_DAILY = {
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
};

if (!SECRET_ARN) {
  console.error("FORGE_ADMIN_DB_SECRET_ARN required");
  process.exit(1);
}

const sm = new SecretsManagerClient({});
const secret = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
const creds = JSON.parse(secret.SecretString || "{}");
const sql = postgres({
  host: creds.host || creds.hostname,
  port: Number(creds.port || 5432),
  database: creds.dbname || creds.database || "forge",
  username: creds.username,
  password: creds.password,
  ssl: "require",
  max: 1,
});

try {
  const [tenant] = await sql`
    select id::text as id, tenant_key, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
  console.log(`Tenant ${tenant.tenant_key} (${tenant.id})`);

  await sql`select set_config('app.current_tenant_id', ${tenant.id}, false)`;

  const rows = await sql`
    select id::text as id, code, name, version_number, ownership_scope
    from industrial_sanitation_templates
    where code = ${SAN_DAILY.code}
      and archived_at is null
      and tenant_id = ${tenant.id}::uuid
  `;
  console.log(`Found ${rows.length} tenant SAN-DAILY row(s)`);
  for (const row of rows) {
    console.log(`- ${row.id} v${row.version_number} ${row.name} (${row.ownership_scope})`);
  }

  if (!APPLY) {
    console.log("Dry-run only. Set APPLY=1 to upsert.");
    process.exit(0);
  }

  const templateJson = sql.json({ sections: SAN_DAILY.sections });
  const scoring = sql.json({ pass: 100, minor: -2, major: -10, critical: "FAIL" });

  if (rows.length) {
    const updated = await sql`
      update industrial_sanitation_templates
      set
        name = ${SAN_DAILY.name},
        category = ${SAN_DAILY.category},
        description = ${SAN_DAILY.description},
        template_json = ${templateJson},
        version_number = coalesce(version_number, 1) + 1,
        updated_at = now()
      where code = ${SAN_DAILY.code}
        and archived_at is null
        and tenant_id = ${tenant.id}::uuid
      returning id::text as id, code, name, version_number
    `;
    console.log("Updated:", updated);
  } else {
    const id = randomUUID();
    const inserted = await sql`
      insert into industrial_sanitation_templates (
        id, tenant_id, ownership_scope, code, name, category, description,
        version_number, facility_applicability, template_json, scoring_config,
        status, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenant.id}::uuid, 'TENANT', ${SAN_DAILY.code}, ${SAN_DAILY.name},
        ${SAN_DAILY.category}, ${SAN_DAILY.description}, 1, '[]'::jsonb,
        ${templateJson}, ${scoring}, 'ACTIVE', now(), now()
      )
      returning id::text as id, code, name, version_number
    `;
    console.log("Inserted:", inserted);
  }
} finally {
  await sql.end({ timeout: 5 });
}
