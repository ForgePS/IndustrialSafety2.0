import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { requireIfMatch, setETag } from "../../common/concurrency.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { RmsMasterDataService } from "./rms-master-data.service.js";

function resourceController(
  path: string,
  resourceType: string,
  serviceKey: keyof Pick<
    RmsMasterDataService,
    | "createStation"
    | "createShift"
    | "createApparatus"
    | "createUnit"
    | "createPersonnel"
    | "createOccupancy"
    | "createPreplan"
  >,
  listKey: keyof Pick<
    RmsMasterDataService,
    | "listStations"
    | "listShifts"
    | "listApparatus"
    | "listUnits"
    | "listPersonnel"
    | "listOccupancies"
    | "listPreplans"
  >,
  getKey: keyof Pick<
    RmsMasterDataService,
    | "getStation"
    | "getShift"
    | "getApparatus"
    | "getUnit"
    | "getPersonnel"
    | "getOccupancy"
    | "getPreplan"
  >,
  patchKey: keyof Pick<
    RmsMasterDataService,
    | "patchStation"
    | "patchShift"
    | "patchApparatus"
    | "patchUnit"
    | "patchPersonnel"
    | "patchOccupancy"
    | "patchPreplan"
  >,
  deleteKey: keyof Pick<
    RmsMasterDataService,
    | "deleteStation"
    | "deleteShift"
    | "deleteApparatus"
    | "deleteUnit"
    | "deletePersonnel"
    | "deleteOccupancy"
    | "deletePreplan"
  >,
  idParam: string,
) {
  @Controller(`api/v1/tenants/:tenantId/rms/${path}`)
  class ResourceController {
    constructor(public readonly rms: RmsMasterDataService) {}

    @Post()
    @RequirePermission("rms.masterdata.manage")
    @Idempotent({ resourceType })
    async create(
      @Param("tenantId") tenantId: string,
      @Body() body: unknown,
      @Principal() principal: ForgePrincipal,
      @Req() req: RequestWithIds,
      @Res({ passthrough: true }) res: Response,
    ) {
      const data = await this.rms[serviceKey](tenantId, body, principal);
      setETag(res, data.recordVersion);
      return ok(data, getRequestIds(req));
    }

    @Get()
    @RequirePermission("rms.masterdata.read")
    async list(
      @Param("tenantId") tenantId: string,
      @Query() query: Record<string, string>,
      @Req() req: RequestWithIds,
    ) {
      const result = await this.rms[listKey](tenantId, query);
      return ok(result.items, getRequestIds(req), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      });
    }

    @Get(`:${idParam}`)
    @RequirePermission("rms.masterdata.read")
    async get(
      @Param("tenantId") tenantId: string,
      @Param(idParam) id: string,
      @Req() req: RequestWithIds,
      @Res({ passthrough: true }) res: Response,
    ) {
      const data = await this.rms[getKey](tenantId, id);
      setETag(res, data.recordVersion);
      return ok(data, getRequestIds(req));
    }

    @Patch(`:${idParam}`)
    @RequirePermission("rms.masterdata.manage")
    async patch(
      @Param("tenantId") tenantId: string,
      @Param(idParam) id: string,
      @Body() body: unknown,
      @Principal() principal: ForgePrincipal,
      @Req() req: RequestWithIds,
      @Res({ passthrough: true }) res: Response,
    ) {
      const expected = requireIfMatch(req, resourceType);
      const data = await this.rms[patchKey](tenantId, id, body, principal, expected);
      setETag(res, data.recordVersion);
      return ok(data, getRequestIds(req));
    }

    @Delete(`:${idParam}`)
    @RequirePermission("rms.masterdata.manage")
    async remove(
      @Param("tenantId") tenantId: string,
      @Param(idParam) id: string,
      @Principal() principal: ForgePrincipal,
      @Req() req: RequestWithIds,
      @Res({ passthrough: true }) res: Response,
    ) {
      const expected = requireIfMatch(req, resourceType);
      const data = await this.rms[deleteKey](tenantId, id, principal, expected);
      setETag(res, data.recordVersion);
      return ok(data, getRequestIds(req));
    }
  }
  return ResourceController;
}

export const RmsStationsController = resourceController(
  "stations",
  "rms_station",
  "createStation",
  "listStations",
  "getStation",
  "patchStation",
  "deleteStation",
  "stationId",
);

export const RmsShiftsController = resourceController(
  "shifts",
  "rms_shift",
  "createShift",
  "listShifts",
  "getShift",
  "patchShift",
  "deleteShift",
  "shiftId",
);

export const RmsApparatusController = resourceController(
  "apparatus",
  "rms_apparatus",
  "createApparatus",
  "listApparatus",
  "getApparatus",
  "patchApparatus",
  "deleteApparatus",
  "apparatusId",
);

export const RmsUnitsController = resourceController(
  "units",
  "rms_unit",
  "createUnit",
  "listUnits",
  "getUnit",
  "patchUnit",
  "deleteUnit",
  "unitId",
);

export const RmsPersonnelController = resourceController(
  "personnel",
  "rms_personnel",
  "createPersonnel",
  "listPersonnel",
  "getPersonnel",
  "patchPersonnel",
  "deletePersonnel",
  "personnelId",
);

export const RmsOccupanciesController = resourceController(
  "occupancies",
  "rms_occupancy",
  "createOccupancy",
  "listOccupancies",
  "getOccupancy",
  "patchOccupancy",
  "deleteOccupancy",
  "occupancyId",
);

export const RmsPreplansController = resourceController(
  "preplans",
  "rms_preplan",
  "createPreplan",
  "listPreplans",
  "getPreplan",
  "patchPreplan",
  "deletePreplan",
  "preplanId",
);

@Controller("api/v1/tenants/:tenantId/rms/rosters")
export class RmsRostersController {
  constructor(private readonly rms: RmsMasterDataService) {}

  @Post()
  @RequirePermission("rms.masterdata.manage")
  @Idempotent({ resourceType: "rms_roster" })
  async create(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.rms.createRoster(tenantId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Get()
  @RequirePermission("rms.masterdata.read")
  async list(
    @Param("tenantId") tenantId: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithIds,
  ) {
    const result = await this.rms.listRosters(tenantId, query);
    return ok(result.items, getRequestIds(req), {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }

  @Get(":rosterId")
  @RequirePermission("rms.masterdata.read")
  async get(
    @Param("tenantId") tenantId: string,
    @Param("rosterId") rosterId: string,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.rms.getRoster(tenantId, rosterId);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Post(":rosterId/assignments")
  @RequirePermission("rms.masterdata.manage")
  @Idempotent({ resourceType: "rms_roster_assignment" })
  async addAssignment(
    @Param("tenantId") tenantId: string,
    @Param("rosterId") rosterId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.rms.addRosterAssignment(tenantId, rosterId, body, principal);
    setETag(res, data.recordVersion);
    return ok(data, getRequestIds(req));
  }

  @Delete(":rosterId/assignments/:assignmentId")
  @RequirePermission("rms.masterdata.manage")
  async removeAssignment(
    @Param("tenantId") tenantId: string,
    @Param("rosterId") rosterId: string,
    @Param("assignmentId") assignmentId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.rms.removeRosterAssignment(tenantId, rosterId, assignmentId, principal),
      getRequestIds(req),
    );
  }
}
