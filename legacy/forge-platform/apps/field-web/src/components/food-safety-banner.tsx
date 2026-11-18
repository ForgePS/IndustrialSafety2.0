"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Soft Food Safety framing when opened via /sanitation/?focus=food */
export function FoodSafetyBanner() {
  const search = useSearchParams();
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(search.get("focus") === "food");
  }, [search]);
  if (!show) return null;
  return (
    <div className="ff-due-card" role="status">
      <strong>Food Safety</strong>
      <p className="ff-meta" style={{ margin: 0 }}>
        Pre-op, verification, and contamination checks use the Sanitation module. The Food Safety
        name is preserved.
      </p>
    </div>
  );
}
