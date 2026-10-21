import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import { HELPDESK_CUSTOMER_PERMISSIONS } from "@forge/contracts";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { HelpdeskService } from "./helpdesk.service.js";

const ANY_HELPDESK = [...HELPDESK_CUSTOMER_PERMISSIONS, "helpdesk.support.view"];
const VIEW_TICKETS = ["helpdesk.ticket.view_own", "helpdesk.ticket.view_tenant"];
const SUPPORT_VIEW = ["helpdesk.support.view"];

type Query = Record<string, unknown>;

@Controller("api/v1/helpdesk")
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskService) {}

  @Get("config")
  @RequireAnyPermission(ANY_HELPDESK)
  async config(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.getConfig(principal), getRequestIds(req));
  }

  // ---------------------------------------------------------------- customer

  @Get("tickets")
  @RequireAnyPermission(VIEW_TICKETS)
  async listTickets(@Principal() principal: ForgePrincipal, @Query() query: Query, @Req() req: RequestWithIds) {
    const data = await this.helpdesk.listMyTickets(principal, query ?? {});
    return ok(data, getRequestIds(req), { page: data.page, pageSize: data.pageSize, total: data.total });
  }

  @Post("tickets")
  @RequireAnyPermission(["helpdesk.ticket.create"])
  async createTicket(@Principal() principal: ForgePrincipal, @Body() body: unknown, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.createTicket(principal, body), getRequestIds(req));
  }

  @Get("tickets/:id")
  @RequireAnyPermission(VIEW_TICKETS)
  async getTicket(@Principal() principal: ForgePrincipal, @Param("id") id: string, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.getMyTicket(principal, id), getRequestIds(req));
  }

  @Post("tickets/:id/reply")
  @RequireAnyPermission(["helpdesk.ticket.comment"])
  async reply(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.customerReply(principal, id, body), getRequestIds(req));
  }

  @Post("tickets/:id/reopen")
  @RequireAnyPermission(["helpdesk.ticket.reopen"])
  async reopen(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.customerSetStatus(principal, id, "REOPENED", body), getRequestIds(req));
  }

  @Post("tickets/:id/close")
  @RequireAnyPermission(["helpdesk.ticket.close"])
  async close(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.customerSetStatus(principal, id, "CLOSED", body), getRequestIds(req));
  }

  @Post("tickets/:id/attachments/upload-url")
  @RequireAnyPermission(["helpdesk.ticket.comment"])
  async customerUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.createAttachmentUpload(principal, "customer", id, body), getRequestIds(req));
  }

  @Post("tickets/:id/attachments/:attachmentId/complete")
  @RequireAnyPermission(["helpdesk.ticket.comment"])
  async customerCompleteUpload(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.completeAttachmentUpload(principal, "customer", id, attachmentId), getRequestIds(req));
  }

  @Get("tickets/:id/attachments/:attachmentId/download")
  @RequireAnyPermission(VIEW_TICKETS)
  async customerDownload(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.attachmentDownload(principal, "customer", id, attachmentId), getRequestIds(req));
  }

  @Delete("tickets/:id/attachments/:attachmentId")
  @RequireAnyPermission(["helpdesk.ticket.comment"])
  async customerDeleteAttachment(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.deleteAttachment(principal, "customer", id, attachmentId), getRequestIds(req));
  }

  // ---------------------------------------------------------------- Forge support console

  @Get("support/summary")
  @RequireAnyPermission(SUPPORT_VIEW)
  async supportSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.supportSummary(principal), getRequestIds(req));
  }

  @Get("support/tickets")
  @RequireAnyPermission(SUPPORT_VIEW)
  async supportList(@Principal() principal: ForgePrincipal, @Query() query: Query, @Req() req: RequestWithIds) {
    const data = await this.helpdesk.supportList(principal, query ?? {});
    return ok(data, getRequestIds(req), { page: data.page, pageSize: data.pageSize, total: data.total });
  }

  @Get("support/agents")
  @RequireAnyPermission(SUPPORT_VIEW)
  async supportAgents(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.supportAgents(principal), getRequestIds(req));
  }

  @Get("support/tags")
  @RequireAnyPermission(SUPPORT_VIEW)
  async supportTagList(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.supportTags(principal), getRequestIds(req));
  }

  @Get("support/tickets/:id")
  @RequireAnyPermission(SUPPORT_VIEW)
  async supportTicket(@Principal() principal: ForgePrincipal, @Param("id") id: string, @Req() req: RequestWithIds) {
    return ok(await this.helpdesk.supportTicketDetail(principal, id), getRequestIds(req));
  }

  @Post("support/tickets/:id/reply")
  @RequireAnyPermission(["helpdesk.support.respond"])
  async supportReply(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportReply(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/internal-note")
  @RequireAnyPermission(["helpdesk.support.internal_note"])
  async supportInternalNote(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportInternalNote(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/status")
  @RequireAnyPermission(["helpdesk.support.change_status"])
  async supportStatus(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportChangeStatus(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/priority")
  @RequireAnyPermission(["helpdesk.support.change_priority"])
  async supportPriority(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportChangePriority(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/assign")
  @RequireAnyPermission(["helpdesk.support.assign"])
  async supportAssign(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportAssign(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/tags")
  @RequireAnyPermission(["helpdesk.support.manage_watchers"])
  async supportTags(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportTagsChange(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/watchers")
  @RequireAnyPermission(["helpdesk.support.manage_watchers"])
  async supportWatchers(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.supportWatchersChange(principal, id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/attachments/upload-url")
  @RequireAnyPermission(["helpdesk.support.respond"])
  async supportUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.createAttachmentUpload(principal, "support", id, body), getRequestIds(req));
  }

  @Post("support/tickets/:id/attachments/:attachmentId/complete")
  @RequireAnyPermission(["helpdesk.support.respond"])
  async supportCompleteUpload(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.completeAttachmentUpload(principal, "support", id, attachmentId), getRequestIds(req));
  }

  @Get("support/tickets/:id/attachments/:attachmentId/download")
  @RequireAnyPermission(SUPPORT_VIEW)
  async supportDownload(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.attachmentDownload(principal, "support", id, attachmentId), getRequestIds(req));
  }

  @Delete("support/tickets/:id/attachments/:attachmentId")
  @RequireAnyPermission(["helpdesk.support.respond"])
  async supportDeleteAttachment(
    @Principal() principal: ForgePrincipal,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.helpdesk.deleteAttachment(principal, "support", id, attachmentId), getRequestIds(req));
  }
}
