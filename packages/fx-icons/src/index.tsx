import type { SVGProps } from "react";

export type FxIconProps = SVGProps<SVGSVGElement> & { title?: string };

const defaults = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconSearch({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconBell({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconMenu({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function IconChevronRight({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconPlus({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCheck({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function IconAlert({ title, ...props }: FxIconProps) {
  return (
    <svg
      {...defaults}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}
