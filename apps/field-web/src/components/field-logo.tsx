"use client";

import { FIELD_PRODUCT_LOGO_ALT, FIELD_PRODUCT_LOGO_SRC } from "@/lib/brand";

type FieldLogoProps = {
  /** login = hero mark; compact = shell / loading */
  size?: "login" | "compact" | "inline";
  className?: string;
};

export function FieldLogo({ size = "compact", className }: FieldLogoProps) {
  const sizeClass =
    size === "login"
      ? "ff-product-logo--login"
      : size === "inline"
        ? "ff-product-logo--inline"
        : "ff-product-logo--compact";
  return (
    <img
      className={["ff-product-logo", sizeClass, className].filter(Boolean).join(" ")}
      src={FIELD_PRODUCT_LOGO_SRC}
      alt={FIELD_PRODUCT_LOGO_ALT}
      width={size === "login" ? 280 : size === "inline" ? 120 : 160}
      height={size === "login" ? 280 : size === "inline" ? 120 : 160}
      decoding="async"
    />
  );
}
