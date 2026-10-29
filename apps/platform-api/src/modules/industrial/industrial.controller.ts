import { Body, Controller, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { ForgeError } from "@forge/errors";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { IndustrialService } from "./industrial.service.js";

@Controller("api/v1/tenants/:tenantId/industrial")
export class IndustrialController {
  constructor(private readonly industrial: IndustrialService) {}

  @Get("sites")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listSites(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listSites(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("sites/:siteId")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async getSite(
    @Param("tenantId") tenantId: string,
    @Param("siteId") siteId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.industrial.getSite(tenantId, siteId);
    return ok(data, getRequestIds(req));
  }

  @Post("sites")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createSite(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const input: Parameters<IndustrialService["createSite"]>[1] = {
      name: String(body.name ?? ""),
    };
    if (typeof body.siteKey === "string" && body.siteKey.trim() !== "") {
      input.siteKey = body.siteKey.trim();
    }
    if (typeof body.timezone === "string" && body.timezone.trim() !== "") {
      input.timezone = body.timezone.trim();
    }
    const data = await this.industrial.createSite(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Patch("sites/:siteId")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async updateSite(
    @Param("tenantId") tenantId: string,
    @Param("siteId") siteId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (body.archive === true || body.status === "ARCHIVED") {
      const data = await this.industrial.archiveSite(tenantId, siteId);
      return ok(data, getRequestIds(req));
    }
    const data = await this.industrial.updateSite(tenantId, siteId, {
      name: String(body.name ?? ""),
    });
    return ok(data, getRequestIds(req));
  }

  @Get("departments")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listDepartments(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listDepartments(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("departments")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createDepartment(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const input: Parameters<IndustrialService["createDepartment"]>[1] = {
      name: String(body.name ?? ""),
    };
    if (typeof body.description === "string") input.description = body.description;
    if (typeof body.siteId === "string" && body.siteId.trim() !== "") {
      input.siteId = body.siteId.trim();
    }
    if (typeof body.divisionName === "string") {
      input.divisionName = body.divisionName.trim() || null;
    }
    const data = await this.industrial.createDepartment(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Patch("departments/:id")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async updateDepartment(
    @Param("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (body.archive === true || body.status === "ARCHIVED") {
      const data = await this.industrial.archiveDepartment(tenantId, id);
      return ok(data, getRequestIds(req));
    }
    const input: { name?: string; siteId?: string | null; divisionName?: string | null } = {};
    if (body.name !== undefined && body.name !== null) {
      input.name = String(body.name);
    }
    if (body.siteId !== undefined) {
      input.siteId =
        typeof body.siteId === "string" && body.siteId.trim() !== "" ? body.siteId.trim() : null;
    }
    if (body.divisionName !== undefined) {
      input.divisionName =
        typeof body.divisionName === "string" && body.divisionName.trim() !== ""
          ? body.divisionName.trim()
          : null;
    }
    if (
      input.name === undefined &&
      input.siteId === undefined &&
      input.divisionName === undefined
    ) {
      throw new ForgeError("VALIDATION_FAILED", "name, siteId, or divisionName is required");
    }
    const data = await this.industrial.updateDepartment(tenantId, id, input);
    return ok(data, getRequestIds(req));
  }

  @Get("positions")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listPositions(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listPositions(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("positions")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createPosition(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const input: Parameters<IndustrialService["createPosition"]>[1] = {
      name: String(body.name ?? ""),
    };
    if (typeof body.description === "string") input.description = body.description;
    if (typeof body.departmentId === "string") input.departmentId = body.departmentId;
    const data = await this.industrial.createPosition(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Patch("positions/:id")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async patchPosition(
    @Param("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (body.archive === true || body.status === "ARCHIVED") {
      const data = await this.industrial.archivePosition(tenantId, id);
      return ok(data, getRequestIds(req));
    }
    if (body.name === undefined || body.name === null || String(body.name).trim() === "") {
      throw new ForgeError("VALIDATION_FAILED", "name is required");
    }
    const input: Parameters<IndustrialService["updatePosition"]>[2] = {
      name: String(body.name),
    };
    if (body.departmentId !== undefined) {
      input.departmentId =
        typeof body.departmentId === "string" && body.departmentId.trim() !== ""
          ? body.departmentId.trim()
          : null;
    }
    const data = await this.industrial.updatePosition(tenantId, id, input);
    return ok(data, getRequestIds(req));
  }

  @Get("employment-types")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listEmploymentTypes(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listEmploymentTypes(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("employment-types")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createEmploymentType(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const input: Parameters<IndustrialService["createEmploymentType"]>[1] = {
      name: String(body.name ?? ""),
    };
    if (typeof body.description === "string") input.description = body.description;
    const data = await this.industrial.createEmploymentType(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Patch("employment-types/:id")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async patchEmploymentType(
    @Param("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    if (
      body.archive === true ||
      body.status === "ARCHIVED" ||
      body.name === undefined ||
      body.name === null ||
      String(body.name).trim() === ""
    ) {
      const data = await this.industrial.archiveEmploymentType(tenantId, id);
      return ok(data, getRequestIds(req));
    }
    const data = await this.industrial.updateEmploymentType(tenantId, id, {
      name: String(body.name),
    });
    return ok(data, getRequestIds(req));
  }

  @Get("personnel")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listPersonnel(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listPersonnel(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("org-lookups/create-missing")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createMissingOrgLookup(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const kind = String(body.kind ?? "") as
      "division" | "department" | "position" | "employment_type";
    if (
      kind !== "division" &&
      kind !== "department" &&
      kind !== "position" &&
      kind !== "employment_type"
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "kind must be division, department, position, or employment_type",
      );
    }
    const input: Parameters<IndustrialService["createMissingOrgLookup"]>[1] = {
      kind,
      name: String(body.name ?? ""),
    };
    if (typeof body.description === "string") input.description = body.description;
    if (typeof body.siteId === "string" && body.siteId.trim() !== "") {
      input.siteId = body.siteId.trim();
    }
    if (typeof body.departmentId === "string" && body.departmentId.trim() !== "") {
      input.departmentId = body.departmentId.trim();
    }
    if (typeof body.divisionName === "string" && body.divisionName.trim() !== "") {
      input.divisionName = body.divisionName.trim();
    }
    const data = await this.industrial.createMissingOrgLookup(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Patch("org-lookups/divisions")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async patchPersonnelDivision(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const fromName = String(body.fromName ?? body.id ?? "").trim();
    if (!fromName) {
      throw new ForgeError("VALIDATION_FAILED", "fromName is required");
    }
    const fromSiteId =
      body.fromSiteId !== undefined
        ? typeof body.fromSiteId === "string" && body.fromSiteId.trim() !== ""
          ? body.fromSiteId.trim()
          : null
        : undefined;
    if (body.archive === true || body.remove === true) {
      const data = await this.industrial.removePersonnelDivision(tenantId, fromName, fromSiteId);
      return ok(data, getRequestIds(req));
    }
    const nextSiteId =
      body.siteId !== undefined
        ? typeof body.siteId === "string" && body.siteId.trim() !== ""
          ? body.siteId.trim()
          : null
        : undefined;
    const data = await this.industrial.renamePersonnelDivision(
      tenantId,
      fromName,
      String(body.name ?? body.toName ?? ""),
      {
        ...(fromSiteId !== undefined ? { fromSiteId } : {}),
        ...(nextSiteId !== undefined ? { siteId: nextSiteId } : {}),
      },
    );
    return ok(data, getRequestIds(req));
  }

  @Get("loto/procedures")
  @RequirePermission("industrial.loto.view", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listLotoProcedures(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listLotoProcedures(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("loto/records")
  @RequirePermission("industrial.loto.view", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listLotoRecords(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listLotoRecords(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("fleet/vehicles")
  @RequirePermission("industrial.fleet.view", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listFleetVehicles(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listFleetVehicles(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("fleet/vehicles")
  @RequirePermission("industrial.fleet.manage", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createFleetVehicle(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const input: Parameters<IndustrialService["createFleetVehicle"]>[1] = {};
    if (typeof body.year === "number") input.year = body.year;
    if (typeof body.make === "string") input.make = body.make;
    if (typeof body.model === "string") input.model = body.model;
    if (typeof body.color === "string") input.color = body.color;
    if (typeof body.vin === "string") input.vin = body.vin;
    if (typeof body.licensePlate === "string") input.licensePlate = body.licensePlate;
    if (typeof body.renewalDate === "string") input.renewalDate = body.renewalDate;
    if (typeof body.locationName === "string") input.locationName = body.locationName;
    if (typeof body.countyAssessed === "string") input.countyAssessed = body.countyAssessed;
    if (typeof body.insured === "boolean") input.insured = body.insured;
    if (typeof body.mileage === "number") input.mileage = body.mileage;
    if (typeof body.notes === "string") input.notes = body.notes;
    if (typeof body.vehicleFringe === "boolean") input.vehicleFringe = body.vehicleFringe;
    const data = await this.industrial.createFleetVehicle(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Get("fleet/drivers")
  @RequirePermission("industrial.fleet.view", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listFleetDrivers(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listFleetDrivers(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Get("corrective-actions")
  @RequirePermission("industrial.corrective_actions.view", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async listCorrectiveActions(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.listCorrectiveActions(tenantId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("corrective-actions")
  @RequirePermission("industrial.corrective_actions.manage", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async createCorrectiveAction(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const input: Parameters<IndustrialService["createCorrectiveAction"]>[1] = {
      title: String(body.title ?? ""),
      parentEntityType: String(body.parentEntityType ?? "UNKNOWN"),
    };
    if (typeof body.parentEntityId === "string") input.parentEntityId = body.parentEntityId;
    if (typeof body.description === "string") input.description = body.description;
    if (typeof body.priority === "string") input.priority = body.priority;
    if (typeof body.dueDate === "string") input.dueDate = body.dueDate;
    const data = await this.industrial.createCorrectiveAction(tenantId, input);
    return ok(data, getRequestIds(req));
  }

  @Get("incidents/body-map-config")
  @RequirePermission("industrial.access", {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async getBodyMapConfig(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    const data = await this.industrial.getBodyMapConfig(tenantId);
    return ok(data, getRequestIds(req));
  }

  @Put("incidents/body-map-config")
  @RequireAnyPermission(["industrial.admin", "platform.configuration.update"], {
    requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
  })
  async saveBodyMapConfig(
    @Param("tenantId") tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.industrial.saveBodyMapConfig(tenantId, body.regions);
    return ok(data, getRequestIds(req));
  }
}
