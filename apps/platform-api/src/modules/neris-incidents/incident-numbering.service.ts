import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  createId,
  nerisIncidentNumberConfigs,
  nerisIncidentNumbers,
  nerisIncidentNumberSequences,
  rmsStations,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { and, eq, sql } from "drizzle-orm";

interface NumberContext {
  incidentDate: Date;
  stationId?: string | null;
  categoryKey?: string | null;
}

@Injectable()
export class IncidentNumberingService {
  async ensureDefaultConfig(tx: DatabaseTransaction, tenantId: string, userId?: string) {
    const existing = await tx.query.nerisIncidentNumberConfigs.findFirst({
      where: and(
        eq(nerisIncidentNumberConfigs.tenantId, tenantId),
        eq(nerisIncidentNumberConfigs.name, "DEFAULT"),
      ),
    });
    if (existing) return existing;

    const now = new Date();
    const [created] = await tx
      .insert(nerisIncidentNumberConfigs)
      .values({
        id: createId(),
        tenantId,
        name: "DEFAULT",
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create incident number config");
    return created;
  }

  async claimNextNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    ctx: NumberContext,
    userId?: string,
    manualNumber?: string,
  ): Promise<{ number: string; ledgerId: string }> {
    const config = await this.ensureDefaultConfig(tx, tenantId, userId);

    if (manualNumber) {
      if (!config.allowManual) {
        throw new ForgeError(
          "BAD_REQUEST",
          "Manual incident numbers are not allowed for this tenant",
        );
      }
      const [existing] = await tx
        .select({ id: nerisIncidentNumbers.id })
        .from(nerisIncidentNumbers)
        .where(
          and(
            eq(nerisIncidentNumbers.tenantId, tenantId),
            eq(nerisIncidentNumbers.number, manualNumber),
          ),
        )
        .limit(1);
      if (existing) {
        throw new ForgeError("CONFLICT", "Incident number already assigned");
      }
      const ledgerId = createId();
      await tx.insert(nerisIncidentNumbers).values({
        id: ledgerId,
        tenantId,
        number: manualNumber,
        status: "ASSIGNED",
        source: "MANUAL",
        stationId: ctx.stationId,
        createdByUserId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { number: manualNumber, ledgerId };
    }

    const periodKey = this.resolvePeriodKey(
      config.resetMode,
      config.fiscalYearStartMonth,
      ctx.incidentDate,
    );
    const scopedStationId = config.scope === "STATION" ? (ctx.stationId ?? null) : null;
    const scopedCategoryKey = config.scope === "CATEGORY" ? (ctx.categoryKey ?? null) : null;

    const locked = await tx.execute(sql`
      SELECT id, next_value
      FROM neris_incident_number_sequences
      WHERE config_id = ${config.id}
        AND period_key = ${periodKey}
        AND station_id IS NOT DISTINCT FROM ${scopedStationId}
        AND category_key IS NOT DISTINCT FROM ${scopedCategoryKey}
      FOR UPDATE
    `);

    let sequenceId: string;
    let seqValue: number;

    const rows = locked as unknown as Array<{ id: string; next_value: number }>;
    if (rows.length === 0) {
      sequenceId = createId();
      seqValue = 1;
      await tx.insert(nerisIncidentNumberSequences).values({
        id: sequenceId,
        tenantId,
        configId: config.id,
        periodKey,
        stationId: scopedStationId,
        categoryKey: scopedCategoryKey,
        nextValue: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      sequenceId = rows[0]!.id;
      seqValue = rows[0]!.next_value;
      await tx
        .update(nerisIncidentNumberSequences)
        .set({ nextValue: seqValue + 1, updatedAt: new Date() })
        .where(eq(nerisIncidentNumberSequences.id, sequenceId));
    }

    let stationNumber: string | null = null;
    if (scopedStationId) {
      const [station] = await tx
        .select({ stationNumber: rmsStations.stationNumber })
        .from(rmsStations)
        .where(and(eq(rmsStations.id, scopedStationId), eq(rmsStations.tenantId, tenantId)))
        .limit(1);
      stationNumber = station?.stationNumber ?? null;
    }

    const formatted = this.formatNumber(config.formatTemplate, {
      prefix: config.prefix,
      suffix: config.suffix,
      agencyCode: config.agencyCode,
      stationNumber,
      incidentDate: ctx.incidentDate,
      sequence: seqValue,
    });

    const ledgerId = createId();
    await tx.insert(nerisIncidentNumbers).values({
      id: ledgerId,
      tenantId,
      number: formatted,
      status: "ASSIGNED",
      source: "AUTO",
      sequenceValue: seqValue,
      periodKey,
      stationId: scopedStationId,
      createdByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { number: formatted, ledgerId };
  }

  async bindNumberToIncident(
    tx: DatabaseTransaction,
    tenantId: string,
    ledgerId: string,
    incidentId: string,
  ) {
    await tx
      .update(nerisIncidentNumbers)
      .set({ incidentId, updatedAt: new Date() })
      .where(
        and(eq(nerisIncidentNumbers.id, ledgerId), eq(nerisIncidentNumbers.tenantId, tenantId)),
      );
  }

  formatNumber(
    template: string,
    ctx: {
      prefix?: string | null;
      suffix?: string | null;
      agencyCode?: string | null;
      stationNumber?: string | null;
      incidentDate: Date;
      sequence: number;
    },
  ): string {
    const year = ctx.incidentDate.getUTCFullYear();
    const tokens: Record<string, string> = {
      PREFIX: ctx.prefix ?? "",
      SUFFIX: ctx.suffix ?? "",
      YEAR2: String(year).slice(-2),
      YEAR4: String(year),
      STATION: ctx.stationNumber ?? "",
      AGENCY: ctx.agencyCode ?? "",
    };

    const result = template.replace(/\{([A-Z0-9_]+(?::\d+)?)\}/g, (_match, token: string) => {
      const seqMatch = /^SEQ:(\d+)$/.exec(token);
      if (seqMatch) {
        const width = Number.parseInt(seqMatch[1]!, 10);
        return String(ctx.sequence).padStart(width, "0");
      }
      return tokens[token] ?? "";
    });
    return result;
  }

  checksumSnapshot(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  private resolvePeriodKey(resetMode: string, fiscalStartMonth: number, date: Date): string {
    if (resetMode === "NONE") return "ALL";
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    if (resetMode === "FISCAL") {
      const fiscalYear = month >= fiscalStartMonth ? year : year - 1;
      return `FY${fiscalYear}`;
    }
    return String(year);
  }
}
