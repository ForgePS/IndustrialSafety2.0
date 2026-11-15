/**
 * Default Forge Industrial brand mark (Sneat palette).
 * Replaces the ThemeSelection Sneat demo glyph — keep primary #696cff unless tenant overrides.
 */
export function ForgeIndustrialMark({
  primaryColor = "#696cff",
  title = "Forge Industrial Safety",
}: {
  primaryColor?: string;
  title?: string;
}) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect x="2" y="2" width="28" height="28" rx="6" fill={primaryColor} />
      <path
        fill="#fff"
        d="M9 8.5h10.5c.55 0 1 .45 1 1v2.1c0 .55-.45 1-1 1H12.2v2.2H18c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1h-5.8V23c0 .55-.45 1-1 1H9.9c-.55 0-1-.45-1-1V9.5c0-.55.45-1 1-1Z"
      />
    </svg>
  );
}
