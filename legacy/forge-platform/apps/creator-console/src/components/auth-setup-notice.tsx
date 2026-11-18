"use client";

import { friendlyAuthMessage, isAuthSetupMessage } from "@/lib/auth-messages";

export function AuthSetupNotice({ message }: { message: string | null | undefined }) {
  if (!message) return null;

  const setup = isAuthSetupMessage(message);

  return (
    <div className="creator-setup-hint mb-3" role="status">
      <i className={`icon-base bx ${setup ? "bx-cog" : "bx-info-circle"}`} aria-hidden />
      <div>
        {setup ? <div className="creator-setup-hint__title">Sign-in setup needed</div> : null}
        <p className="mb-0">{setup ? friendlyAuthMessage(message) : message}</p>
      </div>
    </div>
  );
}
