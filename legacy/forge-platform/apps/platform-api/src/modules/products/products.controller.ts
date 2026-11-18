import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { RequirePermission } from "../auth-context/require-permission.decorator.js";
import { ProductsService } from "./products.service.js";

@Controller("api/v1/platform")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("platforms")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async listPlatforms(@Req() req: RequestWithIds) {
    return ok(await this.products.listPlatforms(), getRequestIds(req));
  }

  @Get("products")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async listProducts(
    @Req() req: RequestWithIds,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return ok(await this.products.listProducts(includeArchived === "true"), getRequestIds(req));
  }

  @Patch("products/:productCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchProduct(
    @Param("productCode") productCode: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.patchProduct(productCode, body), getRequestIds(req));
  }

  @Get("modules")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async listModules(
    @Req() req: RequestWithIds,
    @Query("productCode") productCode?: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return ok(
      await this.products.listModules(productCode, includeArchived === "true"),
      getRequestIds(req),
    );
  }

  @Post("products/:productCode/modules")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async createModule(
    @Param("productCode") productCode: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.createModule(productCode, body), getRequestIds(req));
  }

  @Patch("products/:productCode/modules/:moduleCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchModule(
    @Param("productCode") productCode: string,
    @Param("moduleCode") moduleCode: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.patchModule(productCode, moduleCode, body), getRequestIds(req));
  }

  @Delete("products/:productCode/modules/:moduleCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async archiveModule(
    @Param("productCode") productCode: string,
    @Param("moduleCode") moduleCode: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.archiveModule(productCode, moduleCode), getRequestIds(req));
  }

  @Get("plans")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async listPlans(@Req() req: RequestWithIds, @Query("includeArchived") includeArchived?: string) {
    return ok(await this.products.listPlans(includeArchived === "true"), getRequestIds(req));
  }

  @Post("plans")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async createPlan(@Body() body: unknown, @Req() req: RequestWithIds) {
    return ok(await this.products.createPlan(body), getRequestIds(req));
  }

  @Get("plans/:planCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async getPlan(@Param("planCode") planCode: string, @Req() req: RequestWithIds) {
    return ok(await this.products.getPlanByCode(planCode), getRequestIds(req));
  }

  @Patch("plans/:planCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchPlan(
    @Param("planCode") planCode: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.patchPlan(planCode, body), getRequestIds(req));
  }

  @Delete("plans/:planCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async deletePlan(@Param("planCode") planCode: string, @Req() req: RequestWithIds) {
    return ok(await this.products.deletePlan(planCode), getRequestIds(req));
  }

  @Get("plans/:planCode/prices")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async listPlanPrices(
    @Param("planCode") planCode: string,
    @Req() req: RequestWithIds,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return ok(
      await this.products.listPlanPrices(planCode, includeArchived === "true"),
      getRequestIds(req),
    );
  }

  @Post("plans/:planCode/prices")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async createPlanPrice(
    @Param("planCode") planCode: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.createPlanPrice(planCode, body), getRequestIds(req));
  }

  @Patch("plans/:planCode/prices/:priceCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async patchPlanPrice(
    @Param("planCode") planCode: string,
    @Param("priceCode") priceCode: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.patchPlanPrice(planCode, priceCode, body), getRequestIds(req));
  }

  @Delete("plans/:planCode/prices/:priceCode")
  @RequirePermission("platform.entitlement.manage", { allowWhenSuspended: true })
  async archivePlanPrice(
    @Param("planCode") planCode: string,
    @Param("priceCode") priceCode: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.products.archivePlanPrice(planCode, priceCode), getRequestIds(req));
  }
}
