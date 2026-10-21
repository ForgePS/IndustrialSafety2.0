"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardCardOpts } from "@/lib/dashboard-layout";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";

export function DashboardShortcuts({
  permissions,
  isPlatformAdmin = false,
  activeProducts = [],
  activeModules = [],
}: {
  permissions: readonly string[];
} & DashboardCardOpts) {
  const router = useRouter();
  const { ready, pinnedCards, addableCards, pin, unpin, move } = useDashboardLayout(permissions, {
    isPlatformAdmin,
    activeProducts,
    activeModules,
  });
  const [customizing, setCustomizing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!ready) return null;

  return (
    <section className="ff-section" aria-labelledby="dashboard-shortcuts-heading">
      <div className="ff-section-head">
        <h2 id="dashboard-shortcuts-heading" className="ff-section-title ff-section-title--inline">
          My Shortcuts
        </h2>
        <button
          type="button"
          className="ff-link-btn"
          onClick={() => {
            setPickerOpen(false);
            setCustomizing((value) => !value);
          }}
        >
          {customizing ? "Done" : "Customize"}
        </button>
      </div>

      <div className={`ff-action-grid${customizing ? " ff-action-grid--edit" : ""}`}>
        {pinnedCards.map((card, index) => (
          <div key={card.id} className="ff-dashboard-card">
            {customizing ? (
              <div className="ff-dashboard-card__controls" aria-label={`Reorder ${card.label}`}>
                <button
                  type="button"
                  className="ff-dashboard-card__control"
                  disabled={index === 0}
                  aria-label={`Move ${card.label} up`}
                  onClick={() => move(card.id, "up")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ff-dashboard-card__control"
                  disabled={index === pinnedCards.length - 1}
                  aria-label={`Move ${card.label} down`}
                  onClick={() => move(card.id, "down")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="ff-dashboard-card__control ff-dashboard-card__control--remove"
                  aria-label={`Remove ${card.label} from home`}
                  onClick={() => unpin(card.id)}
                >
                  ×
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="ff-action-tile"
              onClick={() => {
                if (!customizing) router.push(card.href);
              }}
            >
              {card.label}
              {customizing && card.source === "more" ? <span>From Me</span> : null}
            </button>
          </div>
        ))}
      </div>

      {customizing ? (
        <div className="ff-dashboard-customize">
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => setPickerOpen((open) => !open)}
          >
            {pickerOpen ? "Hide shortcuts" : "Add shortcut"}
          </button>
          {pickerOpen ? (
            <div className="ff-dashboard-picker">
              {addableCards.length === 0 ? (
                <p className="ff-page-body">All available shortcuts are already on your home screen.</p>
              ) : (
                <div className="ff-action-grid">
                  {addableCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="ff-action-tile"
                      onClick={() => {
                        pin(card.id);
                        setPickerOpen(false);
                      }}
                    >
                      {card.label}
                      <span>{card.source === "more" ? "From Me" : "Quick action"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
