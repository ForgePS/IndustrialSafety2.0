"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { DashboardErrorState } from "./DashboardStates";
import {
  DashboardWidgetBody,
  DashboardWidgetFooter,
  DashboardWidgetHeader,
} from "./DashboardWidgetChrome";

type Props = {
  title: string;
  children: ReactNode;
};

type State = { error: Error | null };

export class WidgetErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[rms-fx-dashboard] widget failed",
        this.props.title,
        error,
        info.componentStack,
      );
    }
  }

  override render() {
    if (this.state.error) {
      return (
        <article className="rms-fx-widget">
          <DashboardWidgetHeader title={this.props.title} />
          <DashboardWidgetBody>
            <DashboardErrorState
              description={this.state.error.message || "Unexpected widget error."}
            />
          </DashboardWidgetBody>
          <DashboardWidgetFooter />
        </article>
      );
    }
    return this.props.children;
  }
}
