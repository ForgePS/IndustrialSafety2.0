export function timeOfDayGreeting(now = new Date()): "Good Morning" | "Good Afternoon" | "Good Evening" {
  const hour = now.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function firstNameFromDisplay(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}
