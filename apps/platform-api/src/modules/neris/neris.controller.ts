import { Body, Controller, Get, Param, Put, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { NerisAccessService } from "./neris-access.service.js";
import { NerisConditionEngine } from "./neris-condition-engine.service.js";
import { NerisConfigurationOverlayService } from "./neris-configuration-overlay.service.js";
import { NerisSchemaRegistryService, type PageQuery } from "./neris-schema-registry.service.js";
import { NerisSchemaValidationService } from "./neris-schema-validation.service.js";
import { NerisValueSetService } from "./neris-value-set.service.js";

function optionalPage(page?: string, pageSize?: string): Pick<PageQuery, "page" | "pageSize"> {
  const out: Pick<PageQuery, "page" | "pageSize"> = {};
  if (page !== undefined) out.page = Number(page);
  if (pageSize !== undefined) out.pageSize = Number(pageSize);
  return out;
}

@Controller("api/v1/platform/neris")
export class NerisPlatformController {
  constructor(
    private readonly access: NerisAccessService,
    private readonly registry: NerisSchemaRegistryService,
    private readonly valueSetService: NerisValueSetService,
    private readonly validation: NerisSchemaValidationService,
    private readonly conditions: NerisConditionEngine,
  ) {}

  @Get("packages")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async packages(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    await this.access.assertSchemaBrowserEnabled(principal);
    return ok(await this.registry.listPackages(), getRequestIds(req));
  }

  @Get("versions")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async versions(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const data = await this.registry.listVersions(optionalPage(page, pageSize));
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("modules")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async modules(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const query: PageQuery = { ...optionalPage(page, pageSize) };
    if (search !== undefined) query.search = search;
    if (schemaVersionId !== undefined) query.schemaVersionId = schemaVersionId;
    const data = await this.registry.listModules(query);
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("modules/:moduleId/groups")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async groups(
    @Principal() principal: ForgePrincipal,
    @Param("moduleId") moduleId: string,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    return ok(await this.registry.listGroups(moduleId), getRequestIds(req));
  }

  @Get("fields")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async fields(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Query("moduleId") moduleId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const query: PageQuery = { ...optionalPage(page, pageSize) };
    if (search !== undefined) query.search = search;
    if (schemaVersionId !== undefined) query.schemaVersionId = schemaVersionId;
    if (moduleId !== undefined) query.moduleId = moduleId;
    const data = await this.registry.listFields(query);
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("conditions")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async conditionsList(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @Query("parseStatus") parseStatus: string | undefined,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const query: PageQuery = { ...optionalPage(page, pageSize) };
    if (search !== undefined) query.search = search;
    if (parseStatus !== undefined) query.parseStatus = parseStatus;
    if (schemaVersionId !== undefined) query.schemaVersionId = schemaVersionId;
    const data = await this.registry.listConditions(query);
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("mappings")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async mappings(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const query: PageQuery = { ...optionalPage(page, pageSize) };
    if (search !== undefined) query.search = search;
    if (schemaVersionId !== undefined) query.schemaVersionId = schemaVersionId;
    const data = await this.registry.listMappings(query);
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("value-sets")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async listValueSets(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const query: {
      page?: number;
      pageSize?: number;
      search?: string;
      schemaVersionId?: string;
    } = { ...optionalPage(page, pageSize) };
    if (search !== undefined) query.search = search;
    if (schemaVersionId !== undefined) query.schemaVersionId = schemaVersionId;
    const data = await this.valueSetService.listValueSets(query);
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("value-sets/:valueSetId/options")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async options(
    @Principal() principal: ForgePrincipal,
    @Param("valueSetId") valueSetId: string,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @Query("includeInactive") includeInactive: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const query: {
      valueSetId: string;
      page?: number;
      pageSize?: number;
      search?: string;
      includeInactive: boolean;
      activeOnly: boolean;
    } = {
      valueSetId,
      includeInactive: includeInactive === "true",
      activeOnly: includeInactive !== "true",
      ...optionalPage(page, pageSize),
    };
    if (search !== undefined) query.search = search;
    const data = await this.valueSetService.listOptions(query);
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("value-sets/:valueSetId/hierarchy")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async hierarchy(
    @Principal() principal: ForgePrincipal,
    @Param("valueSetId") valueSetId: string,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    return ok(await this.valueSetService.listHierarchy(valueSetId), getRequestIds(req));
  }

  @Get("imports")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async imports(
    @Principal() principal: ForgePrincipal,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    const data = await this.registry.listImportHistory(optionalPage(page, pageSize));
    return ok(data.items, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    });
  }

  @Get("validation-results")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async validationResults(
    @Principal() principal: ForgePrincipal,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertSchemaBrowserEnabled(principal);
    return ok(await this.validation.getLatestResults(schemaVersionId), getRequestIds(req));
  }

  @Get("integrity")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async integrity(
    @Principal() principal: ForgePrincipal,
    @Query("schemaVersionId") schemaVersionId: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    await this.access.assertRegistryEnabled(principal);
    return ok(await this.validation.runLiveIntegrityCheck(schemaVersionId), getRequestIds(req));
  }

  @Get("condition-engine/ping")
  @RequirePermission("platform.neris.schema.read", { allowWhenSuspended: true })
  async conditionPing(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    await this.access.assertRegistryEnabled(principal);
    const visible = this.conditions.isVisible(
      { field: "structure_unit", equals: true },
      { structure_unit: true },
    );
    return ok({ ok: true, sampleVisible: visible }, getRequestIds(req));
  }
}

@Controller("api/v1/tenants/:tenantId/neris")
export class NerisTenantController {
  constructor(private readonly overlays: NerisConfigurationOverlayService) {}

  @Get("configuration")
  @RequirePermission("platform.neris.overlay.read", { allowWhenSuspended: true })
  async getConfig(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.overlays.getConfiguration(tenantId), getRequestIds(req));
  }

  @Put("configuration")
  @RequirePermission("platform.neris.overlay.manage", { allowWhenSuspended: true })
  async putConfig(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.overlays.upsertConfiguration(tenantId, body, principal),
      getRequestIds(req),
    );
  }

  @Get("field-overlays")
  @RequirePermission("platform.neris.overlay.read", { allowWhenSuspended: true })
  async fieldOverlays(@Param("tenantId") tenantId: string, @Req() req: RequestWithIds) {
    return ok(await this.overlays.listFieldOverlays(tenantId), getRequestIds(req));
  }

  @Put("field-overlays")
  @RequirePermission("platform.neris.overlay.manage", { allowWhenSuspended: true })
  async putFieldOverlay(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.overlays.upsertFieldOverlay(tenantId, body, principal),
      getRequestIds(req),
    );
  }

  @Put("value-overlays")
  @RequirePermission("platform.neris.overlay.manage", { allowWhenSuspended: true })
  async putValueOverlay(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.overlays.upsertValueOverlay(tenantId, body, principal),
      getRequestIds(req),
    );
  }
}
