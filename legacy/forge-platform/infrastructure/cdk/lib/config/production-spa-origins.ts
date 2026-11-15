/**
 * CloudFront default domains for production SPAs before customer DNS cutover.
 * Keep in sync with Forge-Production-Frontend distributions.
 * Adding these to Cognito/CORS does not change external DNS or customer traffic.
 */
export const PRODUCTION_PRE_CUTOVER_SPA_ORIGINS = [
  "https://d204ytvvxvsqgl.cloudfront.net",
  "https://d2epagkvbhk1s0.cloudfront.net",
  "https://dw797mr8rhedy.cloudfront.net",
  "https://d1n0e5wvjwbpdf.cloudfront.net",
  "https://d2qv0f0hojgvqo.cloudfront.net",
] as const;
