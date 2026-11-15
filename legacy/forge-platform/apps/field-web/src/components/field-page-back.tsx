"use client";

import { useRouter } from "next/navigation";
import { useFieldPathname } from "@/hooks/use-field-pathname";
import { resolvePageBack } from "@/lib/back-navigation";

function BackChevron() {
  return (
    <svg className="ff-back-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FieldPageBack() {
  const router = useRouter();
  const pathname = useFieldPathname();
  const back = resolvePageBack(pathname);

  if (!back) return null;

  return (
    <div className="ff-back-fixed">
      <button
        type="button"
        className="ff-back-btn ff-back-btn--prominent"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
          }
          router.push(back.href);
        }}
        aria-label={`Back to ${back.label}`}
      >
        <BackChevron />
        <span>Back to {back.label}</span>
      </button>
    </div>
  );
}
