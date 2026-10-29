"use client";

import { Suspense, type ReactNode } from "react";
import { FxButton } from "@forge/fx-ui";
import { DashboardLoadingState } from "./DashboardStates";
import {
  DashboardWidgetBody,
  DashboardWidgetFooter,
  DashboardWidgetHeader,
} from "./DashboardWidgetChrome";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { widgetColumnSpan, widgetMinHeight } from "./WidgetSizing";
import type { WidgetSize } from "./types";

export function DashboardWidget({
  title,
  size,
  href,
  linkLabel,
  timestamp,
  refreshable,
  onRefresh,
  children,
}: {
  title: string;
  size: WidgetSize;
  href?: string;
  linkLabel?: string;
  timestamp?: string | null;
  refreshable?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const span = widgetColumnSpan(size);
  return (
    <div
      className={`rms-fx-dashboard__cell rms-fx-span-${span}`}
      style={{ minHeight: widgetMinHeight(size) }}
    >
      <WidgetErrorBoundary title={title}>
        <article className="rms-fx-widget">
          <DashboardWidgetHeader
            title={title}
            actions={
              refreshable && onRefresh ? (
                <FxButton tone="ghost" aria-label={`Refresh ${title}`} onClick={onRefresh}>
                  Refresh
                </FxButton>
              ) : null
            }
          />
          <DashboardWidgetBody>
            <Suspense fallback={<DashboardLoadingState label={`Loading ${title}`} />}>
              {children}
            </Suspense>
          </DashboardWidgetBody>
          <DashboardWidgetFooter
            {...(timestamp !== undefined ? { timestamp } : {})}
            {...(href ? { href } : {})}
            {...(linkLabel ? { linkLabel } : {})}
          />
        </article>
      </WidgetErrorBoundary>
    </div>
  );
}

export function DashboardGrid({ children }: { children: ReactNode }) {
  return <div className="rms-fx-dashboard__grid">{children}</div>;
}
