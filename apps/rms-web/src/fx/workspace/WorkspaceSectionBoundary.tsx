"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { FxWorkspaceError } from "./FxWorkspaceError";

type Props = {
  title: string;
  children: ReactNode;
};

type State = { error: Error | null };

/** Isolates a workspace section failure so the rest of the workspace continues. */
export class WorkspaceSectionBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[rms-fx-workspace] section failed",
        this.props.title,
        error,
        info.componentStack,
      );
    }
  }

  override render() {
    if (this.state.error) {
      return (
        <FxWorkspaceError
          title={`${this.props.title} unavailable`}
          description={this.state.error.message || "Unexpected workspace section error."}
        />
      );
    }
    return this.props.children;
  }
}
