import { WALKTHROUGH_VOICE_PROFILES, DEFAULT_WALKTHROUGH_VOICE_PROFILE_ID } from "@forge/contracts";

/** Amazon Polly voices mapped through Walkthrough Studio voice profiles. */
export const WALKTHROUGH_VOICE_OPTIONS = WALKTHROUGH_VOICE_PROFILES.map((profile) => ({
  id: profile.providerVoiceId,
  label: profile.displayName,
  hint: `${profile.tone} (${profile.provider})`,
  profileId: profile.id,
}));

export type WalkthroughVoiceId = (typeof WALKTHROUGH_VOICE_OPTIONS)[number]["id"];

export const DEFAULT_WALKTHROUGH_VOICE: WalkthroughVoiceId =
  WALKTHROUGH_VOICE_PROFILES.find((v) => v.id === DEFAULT_WALKTHROUGH_VOICE_PROFILE_ID)
    ?.providerVoiceId ?? "Danielle";
