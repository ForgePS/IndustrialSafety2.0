"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Isolates a single workspace card so one failure cannot crash the grid.
 */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Workspace widget failed: ${this.props.title}`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="card h-100 border-danger">
          <div className="card-body p-3">
            <p className="mb-1 fw-semibold">{this.props.title}</p>
            <p className="text-muted small mb-2">Unable to render this workspace item.</p>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
