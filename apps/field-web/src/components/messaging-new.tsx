"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { fieldMessagingApi } from "@/lib/messaging-api";
import {
  messagingParticipantLine,
  type MessagingParticipant,
} from "@/lib/messaging";

export function MessagingNewChat() {
  const router = useRouter();
  const { moduleEnabled } = useFieldPermissions();
  const enabled = moduleEnabled("MESSAGING");
  const [participants, setParticipants] = useState<MessagingParticipant[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fieldMessagingApi.listParticipants();
      setParticipants(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load people");
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants.slice(0, 60);
    return participants
      .filter((person) => {
        const hay = [
          person.label,
          person.email,
          person.employeeNumber,
          person.siteLabel,
          person.departmentName,
          person.divisionName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 60);
  }, [participants, query]);

  async function onStart(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const thread = await fieldMessagingApi.createThread({
        threadType: "DIRECT",
        memberUserIds: [selectedId],
      });
      router.replace(`/messaging/${encodeURIComponent(thread.id)}/`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start conversation");
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <EmptyState
        title="Messages unavailable"
        message="Messaging is not enabled for this organization."
      />
    );
  }

  return (
    <>
      <h1 className="ff-page-title">New message</h1>
      <p className="ff-page-body">Choose a teammate to start a direct conversation.</p>

      {loading ? <LoadingState label="Loading people…" /> : null}
      {!loading && error && participants.length === 0 ? (
        <ErrorState title="Directory unavailable" message={error} onRetry={() => void refresh()} />
      ) : null}

      {!loading ? (
        <form className="ff-msg-new" onSubmit={(event) => void onStart(event)}>
          <label className="ff-label" htmlFor="ff-msg-people-search">
            Search people
          </label>
          <input
            id="ff-msg-people-search"
            className="ff-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, email, or employee #"
            autoComplete="off"
          />

          <div className="ff-msg-people" role="listbox" aria-label="People">
            {filtered.length === 0 ? (
              <EmptyState title="No matches" message="Try a different search." />
            ) : (
              filtered.map((person) => {
                const selected = person.id === selectedId;
                return (
                  <button
                    key={person.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={[
                      "ff-msg-people-row",
                      selected ? "ff-msg-people-row--selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedId(person.id)}
                  >
                    <span className="ff-msg-people-name">{messagingParticipantLine(person)}</span>
                    {person.isOnline ? <span className="ff-msg-online">Online</span> : null}
                  </button>
                );
              })
            )}
          </div>

          {error && participants.length > 0 ? <p className="ff-msg-send-error">{error}</p> : null}

          <button
            type="submit"
            className="ff-btn ff-btn-primary"
            disabled={!selectedId || saving}
          >
            {saving ? "Starting…" : "Start chat"}
          </button>
        </form>
      ) : null}
    </>
  );
}
