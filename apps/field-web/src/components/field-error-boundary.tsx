"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { FIELD_PRODUCT_NAME } from "@/lib/brand";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render errors so a single bad screen does not blank the whole Field shell.
 * Offline queue lives in localStorage and is preserved across reload.
 */
export class FieldErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[FieldErrorBoundary]", error, info.componentStack);
    }
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ff-gate-message" role="alert">
        <h1 className="ff-page-title">Something went wrong</h1>
        <p className="ff-page-body">
          {FIELD_PRODUCT_NAME} hit an unexpected error. Your offline queue is still on this
          device — reload to continue.
        </p>
        <p className="ff-hint ff-hint--left">{this.state.error.message || "Unknown error"}</p>
        <button
          type="button"
          className="ff-btn"
          onClick={() => {
            this.setState({ error: null });
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
