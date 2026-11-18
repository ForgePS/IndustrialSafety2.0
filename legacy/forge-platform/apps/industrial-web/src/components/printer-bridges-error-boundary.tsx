"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Local boundary so Printer Bridges failures show a usable message
 * instead of only the generic app-level "unexpected error" screen.
 */
export class PrinterBridgesErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[printer-bridges]", error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="ind-state" role="alert">
        <h1>Printer Bridges failed to load</h1>
        <p className="ind-muted">{error.name || "Error"}</p>
        <p className="ind-muted">
          {error.message?.trim() || "An unexpected error occurred while loading Printer Bridges."}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </section>
    );
  }
}
