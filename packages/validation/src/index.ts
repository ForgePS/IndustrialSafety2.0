import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(320);
export const phoneSchema = z.string().regex(/^\+?[0-9().\-\s]{7,20}$/, "Invalid phone number");
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const dateTimeSchema = z.string().datetime({ offset: true });
export const tenantIdSchema = uuidSchema;
export const userIdSchema = uuidSchema;
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});
export const sortDirectionSchema = z.enum(["asc", "desc"]);
export const searchTextSchema = z.string().trim().max(200);
export const fileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\\/:*?"<>|]+$/, "Invalid file name");
export const mimeTypeSchema = z
  .string()
  .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i, "Invalid MIME type");
export const awsAccountIdSchema = z.string().regex(/^\d{12}$/, "AWS account ID must be 12 digits");
export const awsRegionSchema = z.string().regex(/^[a-z]{2}-[a-z]+-\d+$/, "Invalid AWS region");
export const awsArnSchema = z
  .string()
  .regex(/^arn:(aws|aws-us-gov):[a-z0-9-]+:[a-z0-9-]*:\d{0,12}:.+$/, "Invalid ARN");
/** Placeholder format only — not authoritative FEMA validation. */
export const femaSidPlaceholderSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{5,32}$/, "Invalid FEMA SID placeholder format");
/** Last four digits only — never validate or accept a full SSN here. */
export const ssnLastFourSchema = z.string().regex(/^\d{4}$/, "Expected four digits");

export const validators = {
  uuid: uuidSchema,
  email: emailSchema,
  phone: phoneSchema,
  dateOnly: dateOnlySchema,
  dateTime: dateTimeSchema,
  tenantId: tenantIdSchema,
  userId: userIdSchema,
  pagination: paginationSchema,
  sortDirection: sortDirectionSchema,
  searchText: searchTextSchema,
  fileName: fileNameSchema,
  mimeType: mimeTypeSchema,
  awsAccountId: awsAccountIdSchema,
  awsRegion: awsRegionSchema,
  awsArn: awsArnSchema,
  femaSidPlaceholder: femaSidPlaceholderSchema,
  ssnLastFour: ssnLastFourSchema,
} as const;

export {
  isValidVin,
  normalizeVin,
  validateVin,
  type VinValidationResult,
} from "./vin.js";
