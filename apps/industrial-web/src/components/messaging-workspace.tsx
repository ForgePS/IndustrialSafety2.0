"use client";
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type Thread = { id: string; title?: string; threadType: string; lastMessageAt?: string };
type Message = { id: string; body: string; senderName?: string; createdAt: string };

export function MessagingWorkspace({ moduleName }: { moduleName: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadThreads() {
    setLoading(true);
    try {
      const r = await apiGet<{ items: Thread[] }>("/api/v1/industrial/messaging/threads");
      setThreads(r.items);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load conversations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadThreads();
  }, []);

  async function open(id: string) {
    const thread = await apiGet<Thread & { messages: Message[] }>(
      `/api/v1/industrial/messaging/threads/${id}`,
    );
    setSelected(id);
    setMessages(thread.messages);
    await apiSend(`/api/v1/industrial/messaging/threads/${id}/read`, "POST", {});
  }

  async function send() {
    if (!selected || !body.trim()) return;
    await apiSend(`/api/v1/industrial/messaging/threads/${selected}/messages`, "POST", { body });
    setBody("");
    await open(selected);
  }

  return (
    <section aria-labelledby="messaging-title">
      <ModuleWorkspaceHeader
        id="messaging-title"
        eyebrow="Coordination"
        title={moduleName}
        description="Tenant-scoped direct and group conversations."
        onRefresh={() => void loadThreads()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="row g-4">
        <div className="col-md-4">
          <div className="card border shadow-none h-100">
            <div className="card-header">
              <h6 className="card-title mb-0">Conversations</h6>
            </div>
            <div className="list-group list-group-flush" aria-label="Conversations">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`list-group-item list-group-item-action${selected === t.id ? " active" : ""}`}
                  onClick={() => void open(t.id)}
                >
                  {t.title ?? t.threadType}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="col-md-8">
          <div className="card border shadow-none h-100">
            <div className="card-body d-flex flex-column" aria-live="polite">
              <div className="flex-grow-1 mb-3">
                {messages.map((m) => (
                  <div key={m.id} className="mb-3 pb-3 border-bottom">
                    <strong>{m.senderName ?? "User"}</strong>
                    <p className="mb-0 mt-1">{m.body}</p>
                  </div>
                ))}
                {messages.length === 0 ? (
                  <p className="text-muted mb-0">Select a conversation to view messages.</p>
                ) : null}
              </div>
              {selected ? (
                <div className="row g-2 align-items-end">
                  <div className="col">
                    <label className="form-label" htmlFor="message-body">
                      Message
                    </label>
                    <input
                      id="message-body"
                      className="form-control form-control-sm"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                  </div>
                  <div className="col-auto">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void send()}>
                      Send
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
