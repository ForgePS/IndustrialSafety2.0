import { z } from "zod";

export const SEARCH_ENTITY_TYPES = ["tenant", "membership", "facility", "module"] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  types: z.array(z.enum(SEARCH_ENTITY_TYPES)).max(8).optional(),
  limitPerType: z.number().int().min(1).max(25).optional().default(8),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = z.object({
  type: z.enum(SEARCH_ENTITY_TYPES),
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  subtitle: z.string().max(500).optional(),
  href: z.string().min(1).max(500),
  tenantId: z.string().uuid().optional(),
});

export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchGroupSchema = z.object({
  type: z.enum(SEARCH_ENTITY_TYPES),
  label: z.string().min(1).max(80),
  hits: z.array(searchHitSchema),
});

export type SearchGroup = z.infer<typeof searchGroupSchema>;

export const searchResponseSchema = z.object({
  groups: z.array(searchGroupSchema),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const SEARCH_GROUP_LABELS: Record<SearchEntityType, string> = {
  tenant: "Tenants",
  membership: "Members",
  facility: "Facilities",
  module: "Modules",
};
