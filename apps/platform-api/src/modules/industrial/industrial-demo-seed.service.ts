import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  DEMO_DIVISIONS,
  DEMO_LOCATIONS,
  DEMO_SEED_TARGETS,
  INDUSTRIAL_DEMO_COMPANY_NAME,
  INDUSTRIAL_DEMO_TENANT_SLUG,
} from "@forge/contracts";
import {
  buildIndustrialDemoSeedPlan,
  createId,
  demoEmail,
  demoPhone,
  demoSeedVersions,
  industrialCalendarEvents,
  industrialDepartments,
  industrialEquipment,
  industrialFleetVehicles,
  industrialIncidents,
  industrialInspections,
  industrialLotoProcedures,
  industrialOshaCases,
  industrialPersonnel,
  industrialReminders,
  industrialSites,
  industrialSupplyItems,
  industrialTasks,
  industrialTrainingAssignments,
  industrialTrainingSources,
  industrialWorkersCompCases,
  platformJobs,
  qrLinks,
  reportDefinitions,
  tenants,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, like, sql } from "drizzle-orm";
import { assertTenantAllowedForDemoSeed } from "../../common/demo-tenant.js";
import { DATABASE } from "../../tokens.js";

const FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Taylor",
  "Casey",
  "Morgan",
  "Riley",
  "Avery",
  "Quinn",
  "Parker",
  "Reese",
  "Cameron",
  "Drew",
  "Jamie",
  "Skyler",
  "Harper",
] as const;

const LAST_NAMES = [
  "Nguyen",
  "Patel",
  "Garcia",
  "Johnson",
  "Williams",
  "Brown",
  "Davis",
  "Miller",
  "Wilson",
  "Moore",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
] as const;

const SUPPLY_NAMES = [
  "Nitrile Gloves",
  "Safety Glasses",
  "Hard Hat",
  "Ear Plugs",
  "Hi-Vis Vest",
  "Respirator Cartridges",
  "First Aid Kit",
  "Lockout Hasps",
  "Padlocks",
  "Spill Pads",
] as const;

export type DemoSeedCounts = {
  sites: number;
  departments: number;
  personnel: number;
  trainingAssignments: number;
  incidents: number;
  oshaRecordables: number;
  workersCompCases: number;
  inspections: number;
  vehicles: number;
  equipmentAssets: number;
  safetySupplyItems: number;
  lotoProcedures: number;
  qrEquipmentRecords: number;
  tasks: number;
  reminders: number;
  calendarEvents: number;
  reports: number;
};

export type DemoSeedApplyResult = {
  jobId: string;
  status: "completed" | "failed";
  counts: DemoSeedCounts;
  seedVersionId: string;
  plan: ReturnType<typeof buildIndustrialDemoSeedPlan>;
};

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function demoSource(documentId: string) {
  return {
    sourceSystem: "FORGE_DEMO" as const,
    sourceCollection: "demo_seed" as const,
    sourceDocumentId: documentId,
  };
}

@Injectable()
export class IndustrialDemoSeedService {
  private readonly logger = new Logger(IndustrialDemoSeedService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Enqueue and immediately process a deterministic demo seed apply.
   * Safe only for tenants with is_demo_tenant = true.
   */
  async enqueueAndApply(principal: ForgePrincipal): Promise<DemoSeedApplyResult> {
    const tenantId = principal.tenantId;
    await assertTenantAllowedForDemoSeed(this.db, tenantId);
    const [tenant] = await this.db
      .select({
        id: tenants.id,
        isDemoTenant: tenants.isDemoTenant,
        slug: tenants.slug,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) throw new ForgeError("NOT_FOUND", "Tenant not found");
    if (!tenant.isDemoTenant) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Demo seed apply is only allowed for demo tenants",
      );
    }

    const jobId = createId();
    const plan = buildIndustrialDemoSeedPlan();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx.insert(platformJobs).values({
        id: jobId,
        tenantId,
        type: "demo.seed.apply",
        status: "QUEUED",
        progress: 0,
        attempt: 0,
        createdByUserId: principal.userId,
        correlationId: principal.correlationId || createId(),
        requestId: principal.requestId ?? null,
        resultJson: {
          kind: "demo-seed-apply",
          tenantSlug: tenant.slug ?? INDUSTRIAL_DEMO_TENANT_SLUG,
          plan,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }, principal.userId);

    try {
      return await this.applySeed(tenantId, jobId, principal.userId ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        await tx
          .update(platformJobs)
          .set({
            status: "FAILED",
            failure: message,
            completedAt: new Date(),
            updatedAt: new Date(),
            progress: 100,
          })
          .where(eq(platformJobs.id, jobId));
      });
      throw error;
    }
  }

  async applySeed(
    tenantId: string,
    jobId: string,
    actorUserId: string | null,
  ): Promise<DemoSeedApplyResult> {
    const plan = buildIndustrialDemoSeedPlan();
    this.logger.log(`Applying demo seed for tenant=${tenantId} job=${jobId}`);

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx
        .update(platformJobs)
        .set({ status: "RUNNING", progress: 5, updatedAt: new Date() })
        .where(eq(platformJobs.id, jobId));
    });

    const counts = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();

      // FK-safe cleanup of prior synthetic demo rows.
      await tx
        .delete(industrialReminders)
        .where(
          and(
            eq(industrialReminders.tenantId, tenantId),
            like(industrialReminders.title, "DEMO:%"),
          ),
        );
      await tx
        .delete(industrialCalendarEvents)
        .where(
          and(
            eq(industrialCalendarEvents.tenantId, tenantId),
            like(industrialCalendarEvents.title, "DEMO:%"),
          ),
        );
      await tx
        .delete(qrLinks)
        .where(and(eq(qrLinks.tenantId, tenantId), eq(qrLinks.sourceSystem, "FORGE_DEMO")));
      await tx
        .delete(industrialLotoProcedures)
        .where(
          and(
            eq(industrialLotoProcedures.tenantId, tenantId),
            eq(industrialLotoProcedures.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.tenantId, tenantId),
            like(industrialTrainingAssignments.title, "DEMO:%"),
          ),
        );
      await tx
        .delete(industrialTrainingSources)
        .where(
          and(
            eq(industrialTrainingSources.tenantId, tenantId),
            like(industrialTrainingSources.title, "DEMO:%"),
          ),
        );
      await tx
        .delete(industrialTasks)
        .where(
          and(eq(industrialTasks.tenantId, tenantId), eq(industrialTasks.sourceSystem, "FORGE_DEMO")),
        );
      await tx
        .delete(industrialWorkersCompCases)
        .where(
          and(
            eq(industrialWorkersCompCases.tenantId, tenantId),
            eq(industrialWorkersCompCases.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialOshaCases)
        .where(
          and(
            eq(industrialOshaCases.tenantId, tenantId),
            eq(industrialOshaCases.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialIncidents)
        .where(
          and(
            eq(industrialIncidents.tenantId, tenantId),
            eq(industrialIncidents.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialInspections)
        .where(
          and(
            eq(industrialInspections.tenantId, tenantId),
            eq(industrialInspections.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.tenantId, tenantId),
            eq(industrialFleetVehicles.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialEquipment)
        .where(
          and(
            eq(industrialEquipment.tenantId, tenantId),
            eq(industrialEquipment.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialSupplyItems)
        .where(
          and(
            eq(industrialSupplyItems.tenantId, tenantId),
            like(industrialSupplyItems.itemNumber, "DEMO-%"),
          ),
        );
      await tx
        .delete(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.tenantId, tenantId),
            like(reportDefinitions.reportKey, "demo.%"),
          ),
        );
      await tx
        .delete(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            eq(industrialPersonnel.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.tenantId, tenantId),
            eq(industrialDepartments.sourceSystem, "FORGE_DEMO"),
          ),
        );
      await tx
        .delete(industrialSites)
        .where(
          and(eq(industrialSites.tenantId, tenantId), eq(industrialSites.sourceSystem, "FORGE_DEMO")),
        );

      const siteIds: string[] = [];
      for (let i = 0; i < DEMO_LOCATIONS.length; i += 1) {
        const name = DEMO_LOCATIONS[i]!;
        const id = createId();
        siteIds.push(id);
        await tx.insert(industrialSites).values({
          id,
          tenantId,
          name,
          siteKey: `demo-site-${i + 1}`,
          timezone: "America/Chicago",
          status: "ACTIVE",
          ...demoSource(`site-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      const departmentIds: string[] = [];
      for (let i = 0; i < DEMO_DIVISIONS.length; i += 1) {
        const name = DEMO_DIVISIONS[i]!;
        const id = createId();
        departmentIds.push(id);
        await tx.insert(industrialDepartments).values({
          id,
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          name,
          divisionName: name,
          status: "ACTIVE",
          ...demoSource(`dept-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      const personnelIds: string[] = [];
      const personnelCount = DEMO_SEED_TARGETS.employees;
      for (let i = 0; i < personnelCount; i += 1) {
        const firstName = FIRST_NAMES[i % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]!;
        const displayName = `${firstName} ${lastName}`;
        const deptId = departmentIds[i % departmentIds.length]!;
        const siteId = siteIds[i % siteIds.length]!;
        const divisionName = DEMO_DIVISIONS[i % DEMO_DIVISIONS.length]!;
        const id = createId();
        personnelIds.push(id);
        await tx.insert(industrialPersonnel).values({
          id,
          tenantId,
          siteId,
          departmentId: deptId,
          employeeNumber: `DEMO-${String(i + 1).padStart(4, "0")}`,
          firstName,
          lastName,
          displayName,
          email: demoEmail(`${firstName}.${lastName}`, i + 1),
          phone: demoPhone(i + 1),
          companyEmail: demoEmail(`c.${firstName}.${lastName}`, i + 1),
          companyName: INDUSTRIAL_DEMO_COMPANY_NAME,
          departmentName: divisionName,
          divisionName,
          jobTitle: i % 5 === 0 ? "Supervisor" : "Operator",
          status: "ACTIVE",
          ...demoSource(`personnel-${i + 1}`),
          sourcePayload: { synthetic: true, demoIndex: i + 1 },
          createdAt: now,
          updatedAt: now,
        });
      }

      const trainingSourceIds: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        const id = createId();
        trainingSourceIds.push(id);
        await tx.insert(industrialTrainingSources).values({
          id,
          tenantId,
          title: `DEMO: Safety Course ${i + 1}`,
          description: "Synthetic demo training source for Walkthrough Studio.",
          status: "PUBLISHED",
          questionCount: 10,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
      for (let i = 0; i < DEMO_SEED_TARGETS.trainingAssignments; i += 1) {
        await tx.insert(industrialTrainingAssignments).values({
          id: createId(),
          tenantId,
          title: `DEMO: Assignment ${i + 1}`,
          description: "Demo training assignment",
          sourceId: trainingSourceIds[i % trainingSourceIds.length]!,
          dueAt: new Date(Date.now() + (i + 7) * 86_400_000),
          passingPercent: 80,
          quizMode: "STANDARD",
          optionCount: 4,
          feedbackEnabled: true,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.incidents; i += 1) {
        await tx.insert(industrialIncidents).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          title: `DEMO Near Miss ${i + 1}`,
          status: i % 3 === 0 ? "CLOSED" : "ACTIVE",
          ...demoSource(`incident-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.oshaRecordables; i += 1) {
        await tx.insert(industrialOshaCases).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          departmentId: departmentIds[i % departmentIds.length]!,
          personnelId: personnelIds[i % personnelIds.length]!,
          title: `DEMO OSHA Case ${i + 1}`,
          status: "ACTIVE",
          recordDate: isoDateOffset(-(i + 10)),
          ...demoSource(`osha-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.workersCompCases; i += 1) {
        await tx.insert(industrialWorkersCompCases).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          departmentId: departmentIds[i % departmentIds.length]!,
          personnelId: personnelIds[i % personnelIds.length]!,
          caseNumber: `DEMO-WC-${String(i + 1).padStart(3, "0")}`,
          status: "OPEN",
          severity: i % 2 === 0 ? "MEDICAL_ONLY" : "LOST_TIME",
          reportedAt: now,
          claimSummary: { synthetic: true, demoIndex: i + 1 },
          ...demoSource(`wc-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.inspections; i += 1) {
        await tx.insert(industrialInspections).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          departmentId: departmentIds[i % departmentIds.length]!,
          title: `DEMO Inspection ${i + 1}`,
          status: i % 4 === 0 ? "COMPLETED" : "ACTIVE",
          inspectionType: i % 2 === 0 ? "AREA" : "EQUIPMENT",
          completedAt: i % 4 === 0 ? now : null,
          ...demoSource(`inspection-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.vehicles; i += 1) {
        await tx.insert(industrialFleetVehicles).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          assetNumber: `DEMO-VEH-${String(i + 1).padStart(3, "0")}`,
          assetType: "FLEET_VEHICLE",
          year: 2018 + (i % 7),
          make: i % 2 === 0 ? "Ford" : "Chevrolet",
          model: i % 2 === 0 ? "F-150" : "Silverado",
          licensePlate: `DM${String(i + 1).padStart(4, "0")}`,
          licenseState: "TX",
          status: "ACTIVE",
          outOfService: false,
          dotRegulated: i % 3 === 0,
          ...demoSource(`vehicle-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      const equipmentIds: string[] = [];
      for (let i = 0; i < DEMO_SEED_TARGETS.equipmentAssets; i += 1) {
        const id = createId();
        equipmentIds.push(id);
        await tx.insert(industrialEquipment).values({
          id,
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          name: `DEMO Equipment ${i + 1}`,
          equipmentNumber: `DEMO-EQ-${String(i + 1).padStart(3, "0")}`,
          equipmentType: i % 2 === 0 ? "PRESS" : "CONVEYOR",
          status: "ACTIVE",
          ...demoSource(`equipment-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.safetySupplyItems; i += 1) {
        const name = SUPPLY_NAMES[i % SUPPLY_NAMES.length]!;
        await tx.insert(industrialSupplyItems).values({
          id: createId(),
          tenantId,
          itemNumber: `DEMO-${String(i + 1).padStart(4, "0")}`,
          name: `${name} ${i + 1}`,
          shortName: name,
          status: "ACTIVE",
          inventoryType: "CONSUMABLE",
          unitOfMeasure: "EA",
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.lotoProcedures; i += 1) {
        await tx.insert(industrialLotoProcedures).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          equipmentId: equipmentIds[i % equipmentIds.length]!,
          title: `DEMO LOTO Procedure ${i + 1}`,
          procedureNumber: `DEMO-LOTO-${String(i + 1).padStart(3, "0")}`,
          revision: "A",
          status: "ACTIVE",
          ...demoSource(`loto-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.qrEquipmentRecords; i += 1) {
        await tx.insert(qrLinks).values({
          id: createId(),
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          label: `DEMO QR Equipment ${i + 1}`,
          displayCode: `DEMOQR${String(i + 1).padStart(3, "0")}`,
          status: "ACTIVE",
          accessMode: "AUTHENTICATED_ONLY",
          actionConfig: { kind: "equipment_profile" },
          targetType: "EQUIPMENT",
          targetId: equipmentIds[i % equipmentIds.length]!,
          scanCount: 0,
          metadata: { synthetic: true },
          ...demoSource(`qr-equipment-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      const taskIds: string[] = [];
      for (let i = 0; i < DEMO_SEED_TARGETS.tasks; i += 1) {
        const id = createId();
        taskIds.push(id);
        await tx.insert(industrialTasks).values({
          id,
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          departmentId: departmentIds[i % departmentIds.length]!,
          title: `DEMO Task ${i + 1}`,
          status: i % 5 === 0 ? "COMPLETED" : "ACTIVE",
          assigneePersonnelId: personnelIds[i % personnelIds.length]!,
          dueDate: isoDateOffset(i + 3),
          completedAt: i % 5 === 0 ? now : null,
          ...demoSource(`task-${i + 1}`),
          createdAt: now,
          updatedAt: now,
        });
      }

      const eventIds: string[] = [];
      for (let i = 0; i < DEMO_SEED_TARGETS.calendarEvents; i += 1) {
        const id = createId();
        eventIds.push(id);
        const startsAt = new Date(Date.now() + (i + 1) * 86_400_000);
        const endsAt = new Date(startsAt.getTime() + 3_600_000);
        await tx.insert(industrialCalendarEvents).values({
          id,
          tenantId,
          siteId: siteIds[i % siteIds.length]!,
          title: `DEMO: Safety Meeting ${i + 1}`,
          description: "Synthetic demo calendar event",
          startsAt,
          endsAt,
          allDay: false,
          status: "SCHEDULED",
          taskId: taskIds[i % taskIds.length]!,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.reminders; i += 1) {
        await tx.insert(industrialReminders).values({
          id: createId(),
          tenantId,
          eventId: eventIds[i % eventIds.length]!,
          taskId: taskIds[i % taskIds.length]!,
          title: `DEMO: Reminder ${i + 1}`,
          remindAt: new Date(Date.now() + (i + 2) * 86_400_000),
          channel: "IN_APP",
          status: "PENDING",
          recipientUserIds: [],
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let i = 0; i < DEMO_SEED_TARGETS.reports; i += 1) {
        await tx.insert(reportDefinitions).values({
          id: createId(),
          tenantId,
          reportKey: `demo.report.${i + 1}`,
          name: `DEMO Safety Report ${i + 1}`,
          description: "Synthetic demo saved report",
          origin: "saved",
          category: "safety",
          moduleCode: "industrial",
          reportType: "standard",
          payloadJson: { synthetic: true, demoIndex: i + 1 },
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        sites: siteIds.length,
        departments: departmentIds.length,
        personnel: personnelCount,
        trainingAssignments: DEMO_SEED_TARGETS.trainingAssignments,
        incidents: DEMO_SEED_TARGETS.incidents,
        oshaRecordables: DEMO_SEED_TARGETS.oshaRecordables,
        workersCompCases: DEMO_SEED_TARGETS.workersCompCases,
        inspections: DEMO_SEED_TARGETS.inspections,
        vehicles: DEMO_SEED_TARGETS.vehicles,
        equipmentAssets: DEMO_SEED_TARGETS.equipmentAssets,
        safetySupplyItems: DEMO_SEED_TARGETS.safetySupplyItems,
        lotoProcedures: DEMO_SEED_TARGETS.lotoProcedures,
        qrEquipmentRecords: DEMO_SEED_TARGETS.qrEquipmentRecords,
        tasks: DEMO_SEED_TARGETS.tasks,
        reminders: DEMO_SEED_TARGETS.reminders,
        calendarEvents: DEMO_SEED_TARGETS.calendarEvents,
        reports: DEMO_SEED_TARGETS.reports,
      } satisfies DemoSeedCounts;
    }, actorUserId ?? undefined);

    const seedVersionId = createId();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx
        .update(demoSeedVersions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(demoSeedVersions.tenantId, tenantId));

      await tx.insert(demoSeedVersions).values({
        id: seedVersionId,
        tenantId,
        seedKey: "default",
        version: `apply-${new Date().toISOString().slice(0, 19)}`,
        snapshotJson: {
          plan,
          counts,
          appliedAt: new Date().toISOString(),
          jobId,
          note: "Synthetic Forge Industrial Demo rows (FORGE_DEMO / DEMO: prefixes).",
        },
        isActive: true,
        seededAt: new Date(),
      });

      await tx
        .update(platformJobs)
        .set({
          status: "SUCCEEDED",
          progress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
          resultJson: {
            kind: "demo-seed-apply",
            counts,
            seedVersionId,
            plan,
          },
        })
        .where(eq(platformJobs.id, jobId));
    }, actorUserId ?? undefined);

    this.logger.log(
      `Demo seed complete tenant=${tenantId} sites=${counts.sites} personnel=${counts.personnel} equipment=${counts.equipmentAssets}`,
    );

    return {
      jobId,
      status: "completed",
      counts,
      seedVersionId,
      plan,
    };
  }

  async getLatestSeedStatus(tenantId: string) {
    const seed = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(demoSeedVersions)
        .where(and(eq(demoSeedVersions.tenantId, tenantId), eq(demoSeedVersions.isActive, true)))
        .limit(1);
      return row ?? null;
    });

    const liveCounts = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [personnel] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            eq(industrialPersonnel.sourceSystem, "FORGE_DEMO"),
          ),
        );
      const [sites] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSites)
        .where(
          and(eq(industrialSites.tenantId, tenantId), eq(industrialSites.sourceSystem, "FORGE_DEMO")),
        );
      const [departments] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.tenantId, tenantId),
            eq(industrialDepartments.sourceSystem, "FORGE_DEMO"),
          ),
        );
      const [incidents] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialIncidents)
        .where(
          and(
            eq(industrialIncidents.tenantId, tenantId),
            eq(industrialIncidents.sourceSystem, "FORGE_DEMO"),
          ),
        );
      const [inspections] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialInspections)
        .where(
          and(
            eq(industrialInspections.tenantId, tenantId),
            eq(industrialInspections.sourceSystem, "FORGE_DEMO"),
          ),
        );
      const [vehicles] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.tenantId, tenantId),
            eq(industrialFleetVehicles.sourceSystem, "FORGE_DEMO"),
          ),
        );
      const [equipmentAssets] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialEquipment)
        .where(
          and(
            eq(industrialEquipment.tenantId, tenantId),
            eq(industrialEquipment.sourceSystem, "FORGE_DEMO"),
          ),
        );
      const [tasks] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialTasks)
        .where(
          and(eq(industrialTasks.tenantId, tenantId), eq(industrialTasks.sourceSystem, "FORGE_DEMO")),
        );
      const [trainingAssignments] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.tenantId, tenantId),
            like(industrialTrainingAssignments.title, "DEMO:%"),
          ),
        );
      const [safetySupplyItems] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyItems)
        .where(
          and(
            eq(industrialSupplyItems.tenantId, tenantId),
            like(industrialSupplyItems.itemNumber, "DEMO-%"),
          ),
        );

      return {
        personnel: personnel?.count ?? 0,
        sites: sites?.count ?? 0,
        departments: departments?.count ?? 0,
        incidents: incidents?.count ?? 0,
        inspections: inspections?.count ?? 0,
        vehicles: vehicles?.count ?? 0,
        equipmentAssets: equipmentAssets?.count ?? 0,
        tasks: tasks?.count ?? 0,
        trainingAssignments: trainingAssignments?.count ?? 0,
        safetySupplyItems: safetySupplyItems?.count ?? 0,
      };
    });

    return {
      activeSeed: seed,
      liveCounts,
      targets: DEMO_SEED_TARGETS,
    };
  }
}
