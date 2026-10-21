/**
 * Forge Walkthrough Engine + Walkthrough Studio contracts.
 * Industrial Safety Complete Platform Overview is the first product presentation.
 * Architecture is reusable for RMS, Academy, Field, onboarding, and sales demos.
 */

/** Presentation identity for the standard Industrial Safety overview. */
export const INDUSTRIAL_PLATFORM_WALKTHROUGH_ID =
  "forge-industrial-safety-complete-platform-overview" as const;

export const INDUSTRIAL_DEMO_TENANT_SLUG = "forge-industrial-demo" as const;
export const INDUSTRIAL_DEMO_COMPANY_NAME = "Forge Demo Manufacturing" as const;

/**
 * Tenant keys/slugs allowed to receive synthetic FORGE_DEMO seed data and
 * Walkthrough Studio Enable Demo / Reset Demo. Customer tenants (e.g.
 * producers-rice-mill) must never be marked demo or seeded via these paths.
 */
export const INDUSTRIAL_DEMO_TENANT_KEYS = [
  "forge-platform",
  INDUSTRIAL_DEMO_TENANT_SLUG,
] as const;

export type IndustrialDemoTenantKey = (typeof INDUSTRIAL_DEMO_TENANT_KEYS)[number];

export function isIndustrialDemoTenantKey(
  tenantKeyOrSlug: string | null | undefined,
): tenantKeyOrSlug is IndustrialDemoTenantKey {
  const key = String(tenantKeyOrSlug ?? "")
    .trim()
    .toLowerCase();
  return (INDUSTRIAL_DEMO_TENANT_KEYS as readonly string[]).includes(key);
}

export const WALKTHROUGH_STUDIO_SESSION_KEY = "forge-walkthrough-studio-session";
export const WALKTHROUGH_STUDIO_SESSION_EVENT = "forge-walkthrough-studio-session-changed";

/** Soft target band for the standard presentation. */
export const WALKTHROUGH_TARGET_RUNTIME_MIN_MS = (8 * 60 + 15) * 1000;
export const WALKTHROUGH_TARGET_RUNTIME_MAX_MS = (9 * 60 + 15) * 1000;

/** Runtime status thresholds (Master Runtime Monitor). */
export const WALKTHROUGH_RUNTIME_GREEN_MS = (9 * 60 + 15) * 1000;
export const WALKTHROUGH_RUNTIME_YELLOW_MS = (9 * 60 + 30) * 1000;
export const WALKTHROUGH_RUNTIME_ORANGE_MS = (9 * 60 + 45) * 1000;
/** Hard block for standard MP4 export unless Override Standard Runtime is set. */
export const WALKTHROUGH_RUNTIME_MAX_MS = (9 * 60 + 45) * 1000;

export const WALKTHROUGH_DEFAULT_WPM = 150;
export const WALKTHROUGH_SPEED_MIN = 0.9;
export const WALKTHROUGH_SPEED_MAX = 1.15;
export const WALKTHROUGH_SPEED_DEFAULT = 1.0;

export const WALKTHROUGH_TRANSITION_MS_DEFAULT = 350;

export type WalkthroughRuntimeStatus = "green" | "yellow" | "orange" | "red";

export type WalkthroughStatus = "draft" | "published" | "archived";

export type WalkthroughExportStatus =
  | "queued"
  | "generating_narration"
  | "preparing_scenes"
  | "rendering"
  | "encoding"
  | "uploading"
  | "complete"
  | "failed";

export type WalkthroughCaptionMode = "off" | "burned_in" | "subtitle_track";

export type WalkthroughTransitionType = "crossfade" | "direct" | "none";

export type WalkthroughNarrationProvider = "openai" | "elevenlabs" | "polly";

export type WalkthroughVoiceGender = "female" | "male";

export type WalkthroughVoiceProfile = {
  id: string;
  displayName: string;
  gender: WalkthroughVoiceGender;
  accent: string;
  tone: string;
  provider: WalkthroughNarrationProvider;
  /** Provider-native voice id (e.g. Polly Danielle, ElevenLabs voice id). */
  providerVoiceId: string;
  style: string;
  category:
    | "professional_female_warm"
    | "professional_female_executive"
    | "professional_female_southern"
    | "professional_male_professional"
    | "professional_male_conversational"
    | "professional_male_executive"
    | "openai_nova"
    | "openai_onyx"
    | "elevenlabs_rachel";
  recommended?: boolean;
};

export const WALKTHROUGH_DEFAULT_VOICE_STYLE = [
  "Natural professional American English.",
  "Warm, confident, knowledgeable, and conversational.",
  "Speak as though personally demonstrating professional safety software to corporate leadership.",
  "Do not sound like a commercial announcer.",
  "Do not sound robotic.",
  "Use natural sentence rhythm.",
  "Use subtle emphasis on product names and important capabilities.",
  "Pause briefly between major ideas.",
  "Maintain approximately 145 to 155 words per minute.",
  "Pronounce Forge Industrial Safety, OSHA, DOT, Lockout Tagout, and QR code clearly and naturally.",
].join(" ");

export const WALKTHROUGH_VOICE_PROFILES: readonly WalkthroughVoiceProfile[] = [
  {
    id: "forge-female-warm",
    displayName: "Professional Female — Warm",
    gender: "female",
    accent: "American",
    tone: "Friendly, confident, conversational",
    provider: "polly",
    providerVoiceId: "Danielle",
    style: "warm",
    category: "professional_female_warm",
  },
  {
    id: "forge-female-executive",
    displayName: "Professional Female — Executive",
    gender: "female",
    accent: "American",
    tone: "Polished, authoritative, professional",
    provider: "polly",
    providerVoiceId: "Ruth",
    style: "executive",
    category: "professional_female_executive",
  },
  {
    id: "forge-female-southern",
    displayName: "Professional Female — Southern Neutral",
    gender: "female",
    accent: "Southern American (subtle)",
    tone: "Warm with light regional character",
    provider: "polly",
    providerVoiceId: "Joanna",
    style: "southern_neutral",
    category: "professional_female_southern",
  },
  {
    id: "forge-male-professional",
    displayName: "Professional Male — Professional",
    gender: "male",
    accent: "American",
    tone: "Clear and confident",
    provider: "polly",
    providerVoiceId: "Matthew",
    style: "professional",
    category: "professional_male_professional",
  },
  {
    id: "forge-male-conversational",
    displayName: "Professional Male — Conversational",
    gender: "male",
    accent: "American",
    tone: "Relaxed but knowledgeable",
    provider: "polly",
    providerVoiceId: "Stephen",
    style: "conversational",
    category: "professional_male_conversational",
    recommended: true,
  },
  {
    id: "forge-male-executive",
    displayName: "Professional Male — Executive",
    gender: "male",
    accent: "American",
    tone: "Deeper, controlled presentation voice",
    provider: "polly",
    providerVoiceId: "Gregory",
    style: "executive",
    category: "professional_male_executive",
  },
  {
    id: "forge-openai-nova",
    displayName: "OpenAI — Nova (HD)",
    gender: "female",
    accent: "American",
    tone: "Clear generative narration",
    provider: "openai",
    providerVoiceId: "nova",
    style: "warm",
    category: "openai_nova",
  },
  {
    id: "forge-openai-onyx",
    displayName: "OpenAI — Onyx (HD)",
    gender: "male",
    accent: "American",
    tone: "Steady generative narration",
    provider: "openai",
    providerVoiceId: "onyx",
    style: "executive",
    category: "openai_onyx",
  },
  {
    id: "forge-elevenlabs-rachel",
    displayName: "ElevenLabs — Rachel",
    gender: "female",
    accent: "American",
    tone: "Natural conversational",
    provider: "elevenlabs",
    providerVoiceId: "21m00Tcm4TlvDq8ikWAM",
    style: "conversational",
    category: "elevenlabs_rachel",
  },
] as const;

export const DEFAULT_WALKTHROUGH_VOICE_PROFILE_ID = "forge-male-conversational" as const;

/** Action engine — selectors should use data-walkthrough-id primarily. */
export type WalkthroughEngineAction =
  | { type: "navigate"; route: string; delayMs?: number }
  | { type: "cursorMove"; target: string; durationMs?: number }
  | { type: "click"; target: string; delayMs?: number }
  | { type: "hover"; target: string; durationMs?: number }
  | { type: "scroll"; target?: string; top?: number; behavior?: "smooth" | "auto" }
  | { type: "focus"; target: string; label?: string; durationMs?: number }
  | { type: "callout"; text: string; target?: string; durationMs?: number }
  | { type: "openModal"; target: string }
  | { type: "closeModal"; target?: string }
  | { type: "selectTab"; target: string }
  | { type: "expand"; target: string }
  | { type: "collapse"; target: string }
  | { type: "type"; target: string; text: string; delayMs?: number }
  | { type: "pause"; durationMs: number }
  | { type: "zoom"; target?: string; scale?: number; durationMs?: number }
  | { type: "reset"; module?: string }
  | { type: "highlight"; target: string; durationMs?: number }
  | { type: "open-tab"; target: string }
  | { type: "open-panel"; target: string }
  | { type: "close-panel"; target: string }
  | { type: "wait"; durationMs: number }
  | { type: "card"; variant: "opening" | "closing"; durationMs?: number };

export type WalkthroughScene = {
  id: string;
  name: string;
  module: string;
  route: string;
  durationMs: number;
  narrationText: string;
  voiceProfileId?: string;
  voiceSpeed?: number;
  targetSelector?: string;
  secondarySelectors?: string[];
  actions?: WalkthroughEngineAction[];
  captionText?: string;
  transitionType?: WalkthroughTransitionType;
  transitionDurationMs?: number;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  requiredModule?: string;
  skipIfUnavailable?: boolean;
};

export type WalkthroughChapter = {
  id: string;
  title: string;
  order: number;
  targetDurationMs: number;
  scenes: WalkthroughScene[];
};

export type WalkthroughDefinition = {
  id: string;
  name: string;
  description: string;
  productCode: string;
  version: string;
  status: WalkthroughStatus;
  chapters: WalkthroughChapter[];
  defaultVoiceProfileId: string;
  tagline?: string;
  closingTagline?: string;
};

export const WALKTHROUGH_STUDIO_PERMISSIONS = [
  "industrial.walkthrough.view",
  "industrial.walkthrough.manage",
  "industrial.walkthrough.narration.edit",
  "industrial.walkthrough.voices.manage",
  "industrial.walkthrough.demo.manage",
  "industrial.walkthrough.demo.reset",
  "industrial.walkthrough.videos.generate",
  "industrial.walkthrough.videos.download",
  "industrial.walkthrough.share.manage",
  "industrial.walkthrough.analytics.view",
] as const;

export type WalkthroughStudioPermission = (typeof WALKTHROUGH_STUDIO_PERMISSIONS)[number];

function scene(
  partial: WalkthroughScene & { chapterTitle?: never },
): WalkthroughScene {
  return {
    skipIfUnavailable: true,
    transitionType: "direct",
    transitionDurationMs: WALKTHROUGH_TRANSITION_MS_DEFAULT,
    captionText: partial.narrationText,
    ...partial,
  };
}

/** Standard Forge Industrial Safety walkthrough — 21 modules, ~8:03 nominal. */
export const INDUSTRIAL_PLATFORM_WALKTHROUGH_CHAPTERS: readonly WalkthroughChapter[] = [
  {
    id: "introduction",
    title: "Introduction",
    order: 1,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "introduction",
        name: "Introduction",
        module: "INTRODUCTION",
        route: "/",
        durationMs: 25_000,
        narrationText:
          "Welcome to Forge Industrial Safety. Forge brings personnel, training, incident management, compliance, inspections, equipment, communication, and day-to-day safety operations together in one connected platform. In the next few minutes, we'll take a quick look at how Forge helps safety teams manage their operation from one system.",
        actions: [
          { type: "card", variant: "opening", durationMs: 7_500 },
          { type: "navigate", route: "/", delayMs: 0 },
        ],
      }),
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    order: 2,
    targetDurationMs: 22_000,
    scenes: [
      scene({
        id: "analytics",
        name: "Analytics",
        module: "ANALYTICS",
        route: "/modules/analytics/",
        durationMs: 22_000,
        requiredModule: "ANALYTICS",
        targetSelector: "analytics-sic",
        narrationText:
          "The Analytics module is the Safety Intelligence Center for the platform. It brings together live safety scores, period comparisons, incident and inspection trends, department performance, and injury hotspots so leaders can see what is improving and where attention is still needed.",
        actions: [
          { type: "navigate", route: "/modules/analytics/" },
          { type: "focus", target: "analytics-sic", label: "Safety Intelligence Center", durationMs: 7_000 },
          { type: "highlight", target: "analytics-sic", durationMs: 12_000 },
        ],
      }),
    ],
  },
  {
    id: "personnel",
    title: "Personnel",
    order: 3,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "personnel",
        name: "Personnel",
        module: "PERSONNEL",
        route: "/modules/personnel/",
        durationMs: 25_000,
        requiredModule: "PERSONNEL",
        targetSelector: "personnel-overview",
        secondarySelectors: ["personnel-profile-card", "personnel-directory"],
        narrationText:
          "Personnel gives the safety team a centralized employee record instead of information being spread across spreadsheets, paper files, and separate systems. From one employee profile, authorized users can review contact information, department and location assignments, certifications, training history, documents, assigned equipment, and related safety records.",
        actions: [
          { type: "navigate", route: "/modules/personnel/" },
          { type: "cursorMove", target: "personnel-overview", durationMs: 800 },
          { type: "focus", target: "personnel-overview", label: "Employee directory", durationMs: 8_000 },
          { type: "highlight", target: "personnel-overview", durationMs: 14_000 },
        ],
      }),
    ],
  },
  {
    id: "training",
    title: "Training",
    order: 4,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "training",
        name: "Training",
        module: "TRAINING",
        route: "/modules/training/",
        durationMs: 25_000,
        requiredModule: "TRAINING",
        targetSelector: "training-admin",
        narrationText:
          "The Training module handles both company-wide and employee-specific training. Administrators can build courses, assign required training by employee, department, division, or location, monitor completion, track scores, manage recurring requirements, and quickly identify overdue or upcoming training from the same system.",
        actions: [
          { type: "navigate", route: "/modules/training/" },
          { type: "focus", target: "training-admin", label: "Training dashboard", durationMs: 8_000 },
          { type: "highlight", target: "training-admin", durationMs: 14_000 },
        ],
      }),
    ],
  },
  {
    id: "my-training",
    title: "My Training",
    order: 5,
    targetDurationMs: 20_000,
    scenes: [
      scene({
        id: "my-training",
        name: "My Training",
        module: "TRAINING",
        route: "/my-training/",
        durationMs: 20_000,
        requiredModule: "TRAINING",
        targetSelector: "employee-my-training",
        narrationText:
          "Employees receive a much simpler experience through My Training. They can immediately see what has been assigned, what is due, begin available courses, review completed training, and access their individual training transcript without navigating the administrative side of Forge.",
        actions: [
          { type: "navigate", route: "/my-training/" },
          { type: "focus", target: "employee-my-training", label: "My Training", durationMs: 6_000 },
          { type: "highlight", target: "employee-my-training", durationMs: 12_000 },
        ],
      }),
    ],
  },
  {
    id: "incidents",
    title: "Incidents",
    order: 6,
    targetDurationMs: 30_000,
    scenes: [
      scene({
        id: "incidents",
        name: "Incidents",
        module: "INCIDENTS",
        route: "/modules/incidents/",
        durationMs: 30_000,
        requiredModule: "INCIDENTS",
        targetSelector: "safety-incidents",
        secondarySelectors: ["incident-create-button"],
        narrationText:
          "Incident Management creates one structured location for documenting workplace events. Forge can capture the initial report, people involved, injury information, photographs, investigations, contributing factors, corrective actions, and follow-up activity while maintaining a complete history of the event.",
        actions: [
          { type: "navigate", route: "/modules/incidents/" },
          { type: "focus", target: "safety-incidents", label: "Incident dashboard", durationMs: 10_000 },
          { type: "highlight", target: "safety-incidents", durationMs: 16_000 },
        ],
      }),
    ],
  },
  {
    id: "osha",
    title: "OSHA",
    order: 7,
    targetDurationMs: 30_000,
    scenes: [
      scene({
        id: "osha",
        name: "OSHA",
        module: "OSHA",
        route: "/modules/osha/",
        durationMs: 30_000,
        requiredModule: "OSHA",
        targetSelector: "osha-dashboard",
        secondarySelectors: ["osha-300-log", "osha-300a"],
        narrationText:
          "The OSHA section connects compliance reporting directly to the underlying incident information. Authorized safety personnel can review recordability decisions, maintain the OSHA 300 Log, manage the supporting information needed for OSHA 301 reporting, prepare the 300A annual summary, and reduce duplicate data entry.",
        actions: [
          { type: "navigate", route: "/modules/osha/" },
          { type: "focus", target: "osha-dashboard", label: "Automatic OSHA Recordkeeping", durationMs: 8_000 },
          { type: "highlight", target: "osha-dashboard", durationMs: 8_000 },
          { type: "highlight", target: "osha-300-log", durationMs: 7_000 },
          { type: "highlight", target: "osha-300a", durationMs: 7_000 },
        ],
      }),
    ],
  },
  {
    id: "workers-comp",
    title: "Workers Compensation",
    order: 8,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "workers-comp",
        name: "Workers Compensation",
        module: "WORKERS_COMP",
        route: "/modules/workers-comp/",
        durationMs: 25_000,
        requiredModule: "WORKERS_COMP",
        targetSelector: "workers-comp-overview",
        narrationText:
          "Workers Compensation extends the incident workflow into claim management. The safety team can track claim status, related incidents, documentation, medical or work restrictions where authorized, important dates, communications, and follow-up activity without creating a completely separate tracking process.",
        actions: [
          { type: "navigate", route: "/modules/workers-comp/" },
          { type: "focus", target: "workers-comp-overview", label: "Claims dashboard", durationMs: 8_000 },
          { type: "highlight", target: "workers-comp-overview", durationMs: 14_000 },
        ],
      }),
    ],
  },
  {
    id: "inspections",
    title: "Inspections",
    order: 9,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "inspections",
        name: "Inspections",
        module: "INSPECTIONS",
        route: "/modules/inspections/",
        durationMs: 25_000,
        requiredModule: "INSPECTIONS",
        targetSelector: "safety-inspections",
        narrationText:
          "Forge Inspections allows organizations to standardize inspections across locations and operations. Teams can build reusable inspection templates, schedule recurring inspections, complete them from mobile devices, document deficiencies with photographs, assign corrective actions, and track unresolved findings to completion.",
        actions: [
          { type: "navigate", route: "/modules/inspections/" },
          { type: "focus", target: "safety-inspections", label: "Inspection dashboard", durationMs: 8_000 },
          { type: "highlight", target: "safety-inspections", durationMs: 14_000 },
        ],
      }),
    ],
  },
  {
    id: "dot",
    title: "DOT",
    order: 10,
    targetDurationMs: 22_000,
    scenes: [
      scene({
        id: "dot",
        name: "DOT",
        module: "DOT_COMPLIANCE",
        route: "/modules/dot-compliance/",
        durationMs: 22_000,
        requiredModule: "DOT_COMPLIANCE",
        targetSelector: "dot-overview",
        narrationText:
          "The DOT module helps transportation operations keep driver and vehicle compliance information organized. Required records, documents, expiration dates, driver information, vehicle details, and compliance status can be monitored centrally with upcoming requirements surfaced before they become a problem.",
        actions: [
          { type: "navigate", route: "/modules/dot-compliance/" },
          { type: "focus", target: "dot-overview", label: "Driver compliance", durationMs: 7_000 },
          { type: "highlight", target: "dot-overview", durationMs: 12_000 },
        ],
      }),
    ],
  },
  {
    id: "equipment",
    title: "Assets & Equipment",
    order: 11,
    targetDurationMs: 22_000,
    scenes: [
      scene({
        id: "equipment",
        name: "Assets & Equipment",
        module: "EQUIPMENT",
        route: "/modules/equipment/",
        durationMs: 22_000,
        requiredModule: "EQUIPMENT",
        targetSelector: "equipment-overview",
        narrationText:
          "Assets and Equipment provides a central record for safety equipment, machinery, tools, and other trackable assets. Each asset can maintain identifying information, location, inspections, maintenance history, documentation, employee assignments, and its own QR-enabled record.",
        actions: [
          { type: "navigate", route: "/modules/equipment/" },
          { type: "focus", target: "equipment-overview", label: "Equipment directory", durationMs: 7_000 },
          { type: "highlight", target: "equipment-overview", durationMs: 12_000 },
        ],
      }),
    ],
  },
  {
    id: "fleet",
    title: "Fleet",
    order: 12,
    targetDurationMs: 22_000,
    scenes: [
      scene({
        id: "fleet",
        name: "Fleet",
        module: "FLEET",
        route: "/modules/fleet/",
        durationMs: 22_000,
        requiredModule: "FLEET",
        targetSelector: "fleet-overview",
        narrationText:
          "Fleet Management provides the same visibility for company vehicles. Forge can track vehicle specifications, mileage, insurance, registration and renewal dates, maintenance activity, assigned drivers, documentation, and other information needed to manage the fleet.",
        actions: [
          { type: "navigate", route: "/modules/fleet/" },
          { type: "focus", target: "fleet-overview", label: "Vehicle cards", durationMs: 7_000 },
          { type: "highlight", target: "fleet-overview", durationMs: 12_000 },
        ],
      }),
    ],
  },
  {
    id: "safety-supplies",
    title: "Safety Supplies",
    order: 13,
    targetDurationMs: 20_000,
    scenes: [
      scene({
        id: "safety-supplies",
        name: "Safety Supplies",
        module: "SAFETY_SUPPLIES",
        route: "/modules/safety-supplies/",
        durationMs: 20_000,
        requiredModule: "SAFETY_SUPPLIES",
        targetSelector: "safety-supplies-overview",
        narrationText:
          "Safety Supplies combines inventory management with employee requests. Administrators can monitor available quantities and minimum stock levels while employees can request needed safety supplies through Forge or by scanning a location-specific QR code.",
        actions: [
          { type: "navigate", route: "/modules/safety-supplies/" },
          { type: "focus", target: "safety-supplies-overview", label: "Inventory", durationMs: 6_000 },
          { type: "highlight", target: "safety-supplies-overview", durationMs: 12_000 },
        ],
      }),
    ],
  },
  {
    id: "loto",
    title: "Lockout/Tagout",
    order: 14,
    targetDurationMs: 28_000,
    scenes: [
      scene({
        id: "loto",
        name: "Lockout/Tagout",
        module: "LOCKOUT_TAGOUT",
        route: "/modules/lockout-tagout/",
        durationMs: 28_000,
        requiredModule: "LOCKOUT_TAGOUT",
        targetSelector: "loto-overview",
        narrationText:
          "Lockout Tagout procedures can be connected directly to individual equipment. Procedures can document energy sources, isolation points, shutdown steps, verification requirements, photographs, equipment information, and revision history, while QR access places the correct procedure directly at the machine.",
        actions: [
          { type: "navigate", route: "/modules/lockout-tagout/" },
          { type: "focus", target: "loto-overview", label: "LOTO procedures", durationMs: 9_000 },
          { type: "highlight", target: "loto-overview", durationMs: 16_000 },
        ],
      }),
    ],
  },
  {
    id: "emergency-alerts",
    title: "Emergency Alerts",
    order: 15,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "emergency-alerts",
        name: "Emergency Alerts",
        module: "EMERGENCY_ALERTS",
        route: "/modules/emergency-alerts/",
        durationMs: 25_000,
        requiredModule: "EMERGENCY_ALERTS",
        targetSelector: "emergency-alerts",
        narrationText:
          "Emergency Alerts gives authorized personnel a centralized method for communicating urgent information. Alerts can be targeted by location, division, department, or employee group and distributed through configured communication channels, with acknowledgement tracking available when confirmation is required.",
        actions: [
          { type: "navigate", route: "/modules/emergency-alerts/" },
          { type: "focus", target: "emergency-alerts", label: "Alert builder", durationMs: 8_000 },
          { type: "highlight", target: "emergency-alerts", durationMs: 14_000 },
        ],
      }),
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    order: 16,
    targetDurationMs: 18_000,
    scenes: [
      scene({
        id: "tasks",
        name: "Tasks",
        module: "TASKS",
        route: "/modules/tasks/",
        durationMs: 18_000,
        requiredModule: "TASKS",
        targetSelector: "tasks-overview",
        narrationText:
          "Tasks turn safety follow-up into accountable work. Tasks can be assigned to specific employees, given priorities and due dates, connected to other Forge records, and tracked through completion.",
        actions: [
          { type: "navigate", route: "/modules/tasks/" },
          { type: "focus", target: "tasks-overview", label: "Assigned to me", durationMs: 6_000 },
          { type: "highlight", target: "tasks-overview", durationMs: 10_000 },
        ],
      }),
    ],
  },
  {
    id: "calendar",
    title: "Calendar",
    order: 17,
    targetDurationMs: 18_000,
    scenes: [
      scene({
        id: "calendar",
        name: "Calendar",
        module: "CALENDAR",
        route: "/modules/calendar/",
        durationMs: 18_000,
        requiredModule: "CALENDAR",
        targetSelector: "calendar-overview",
        narrationText:
          "The Forge Calendar brings upcoming safety activity together visually. Training, inspections, tasks, meetings, deadlines, and other scheduled activity can be displayed without maintaining separate calendars throughout the organization.",
        actions: [
          { type: "navigate", route: "/modules/calendar/" },
          { type: "focus", target: "calendar-overview", label: "Upcoming events", durationMs: 6_000 },
          { type: "highlight", target: "calendar-overview", durationMs: 10_000 },
        ],
      }),
    ],
  },
  {
    id: "reminders",
    title: "Reminders",
    order: 18,
    targetDurationMs: 15_000,
    scenes: [
      scene({
        id: "reminders",
        name: "Reminders",
        module: "REMINDERS",
        route: "/modules/reminders/",
        durationMs: 15_000,
        requiredModule: "REMINDERS",
        targetSelector: "reminders-overview",
        narrationText:
          "Reminders provide a lightweight way to make sure important items are not forgotten. Users can create personal reminders or, where permitted, send reminders to others and receive them directly within Forge.",
        actions: [
          { type: "navigate", route: "/modules/reminders/" },
          { type: "focus", target: "reminders-overview", label: "Reminders", durationMs: 5_000 },
          { type: "highlight", target: "reminders-overview", durationMs: 8_000 },
        ],
      }),
    ],
  },
  {
    id: "messaging",
    title: "Messaging",
    order: 19,
    targetDurationMs: 18_000,
    scenes: [
      scene({
        id: "messaging",
        name: "Messaging",
        module: "MESSAGING",
        route: "/modules/messaging/",
        durationMs: 18_000,
        requiredModule: "MESSAGING",
        targetSelector: "messaging-overview",
        narrationText:
          "Built-in Messaging keeps operational communication closer to the work itself. Employees can communicate individually or through approved groups while conversations and relevant Forge information remain accessible from the same platform.",
        actions: [
          { type: "navigate", route: "/modules/messaging/" },
          { type: "focus", target: "messaging-overview", label: "Conversations", durationMs: 6_000 },
          { type: "highlight", target: "messaging-overview", durationMs: 10_000 },
        ],
      }),
    ],
  },
  {
    id: "reporting",
    title: "Reporting",
    order: 20,
    targetDurationMs: 20_000,
    scenes: [
      scene({
        id: "reporting",
        name: "Reporting",
        module: "REPORTING",
        route: "/reporting/",
        durationMs: 20_000,
        requiredModule: "REPORTING",
        targetSelector: "reporting-center",
        narrationText:
          "Reporting complements Analytics with filterable dashboards, charts, and exportable reports. Authorized users can dig into incidents, inspections, training, compliance, equipment, fleet, and corrective actions when they need a shareable operational view.",
        actions: [
          { type: "navigate", route: "/reporting/" },
          { type: "focus", target: "reporting-center", label: "Reporting dashboard", durationMs: 7_000 },
          { type: "highlight", target: "reporting-center", durationMs: 11_000 },
        ],
      }),
    ],
  },
  {
    id: "qr-management",
    title: "QR Management",
    order: 21,
    targetDurationMs: 25_000,
    scenes: [
      scene({
        id: "qr-management",
        name: "QR Management",
        module: "QR_LINKS",
        route: "/modules/qr-links/",
        durationMs: 25_000,
        requiredModule: "QR_LINKS",
        targetSelector: "qr-scan",
        narrationText:
          "QR Management connects the physical workplace to the digital safety system. Forge QR codes can provide fast access to equipment records, inspections, Lockout Tagout procedures, safety supply requests, and other approved workflows while allowing administrators to centrally manage the QR program.",
        actions: [
          { type: "navigate", route: "/modules/qr-links/" },
          { type: "focus", target: "qr-scan", label: "QR dashboard", durationMs: 8_000 },
          { type: "highlight", target: "qr-scan", durationMs: 14_000 },
        ],
      }),
    ],
  },
  {
    id: "closing",
    title: "Closing",
    order: 22,
    targetDurationMs: 20_000,
    scenes: [
      scene({
        id: "closing",
        name: "Closing",
        module: "CLOSING",
        route: "/",
        durationMs: 20_000,
        skipIfUnavailable: false,
        narrationText:
          "Forge Industrial Safety brings these individual processes together so information collected in one part of the organization can support the rest of the safety program. From employee training and incident management to inspections, equipment, compliance, communication, analytics, and reporting, Forge provides one connected platform for managing safety operations.",
        actions: [
          { type: "navigate", route: "/" },
          { type: "card", variant: "closing", durationMs: 5_000 },
        ],
      }),
    ],
  },
] as const;

export const INDUSTRIAL_PLATFORM_WALKTHROUGH: WalkthroughDefinition = {
  id: INDUSTRIAL_PLATFORM_WALKTHROUGH_ID,
  name: "Forge Industrial Safety – Complete Platform Overview",
  description:
    "Professional guided demonstration of the Forge Industrial Safety platform across personnel, training, incidents, compliance, operations, communication, and reporting.",
  productCode: "FORGE_INDUSTRIAL",
  version: "1.0",
  status: "published",
  chapters: [...INDUSTRIAL_PLATFORM_WALKTHROUGH_CHAPTERS],
  defaultVoiceProfileId: DEFAULT_WALKTHROUGH_VOICE_PROFILE_ID,
  tagline: "One Platform. Total Safety Visibility.",
  closingTagline: "Connected Safety. One Platform.",
};

/** Flatten chapters to a linear scene list for the action engine / player. */
export function flattenWalkthroughScenes(
  definition: WalkthroughDefinition = INDUSTRIAL_PLATFORM_WALKTHROUGH,
): WalkthroughScene[] {
  return definition.chapters.flatMap((chapter) => chapter.scenes);
}

export function estimateWalkthroughStudioRuntimeMs(
  scenes: readonly Pick<WalkthroughScene, "durationMs" | "pauseBeforeMs" | "pauseAfterMs" | "transitionDurationMs">[] = flattenWalkthroughScenes(),
): number {
  return scenes.reduce((sum, s) => {
    return (
      sum +
      s.durationMs +
      (s.pauseBeforeMs ?? 0) +
      (s.pauseAfterMs ?? 0) +
      (s.transitionDurationMs ?? 0)
    );
  }, 0);
}

export function getWalkthroughRuntimeStatus(totalMs: number): WalkthroughRuntimeStatus {
  if (totalMs <= WALKTHROUGH_RUNTIME_GREEN_MS) return "green";
  if (totalMs <= WALKTHROUGH_RUNTIME_YELLOW_MS) return "yellow";
  if (totalMs <= WALKTHROUGH_RUNTIME_ORANGE_MS) return "orange";
  return "red";
}

export function estimateNarrationDurationMs(
  text: string,
  wordsPerMinute: number = WALKTHROUGH_DEFAULT_WPM,
  speed: number = WALKTHROUGH_SPEED_DEFAULT,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const effectiveWpm = Math.max(1, wordsPerMinute * Math.max(WALKTHROUGH_SPEED_MIN, Math.min(WALKTHROUGH_SPEED_MAX, speed)));
  return Math.round((words / effectiveWpm) * 60_000);
}

export function formatWalkthroughRuntime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const INDUSTRIAL_PLATFORM_WALKTHROUGH_FILENAME_PREFIX =
  "Forge-Industrial-Safety-Walkthrough" as const;

export function buildWalkthroughMp4Filename(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${INDUSTRIAL_PLATFORM_WALKTHROUGH_FILENAME_PREFIX}-${y}-${m}-${d}.mp4`;
}

export const DEMO_SEED_TARGETS = {
  sites: 4,
  departments: 5,
  employees: 75,
  trainingAssignments: 20,
  incidents: 8,
  oshaRecordables: 6,
  workersCompCases: 5,
  inspections: 30,
  vehicles: 25,
  equipmentAssets: 75,
  safetySupplyItems: 40,
  lotoProcedures: 15,
  qrEquipmentRecords: 12,
  tasks: 20,
  reminders: 10,
  calendarEvents: 15,
  reports: 12,
} as const;

export const DEMO_LOCATIONS = [
  "Main Manufacturing Plant",
  "Distribution Center",
  "Maintenance Operations",
  "Corporate Office",
] as const;

export const DEMO_DIVISIONS = [
  "Production",
  "Maintenance",
  "Warehouse",
  "Transportation",
  "Environmental Health & Safety",
  "Administration",
] as const;
