import { apiFetchRaw, ApiError, apiGet, apiSend } from "@forge/web-kit";
import type {
  MessagingAttachment,
  MessagingMessage,
  MessagingParticipant,
  MessagingThread,
} from "@/lib/messaging";

const MESSAGING_API = "/api/v1/industrial/messaging";

type ListResponse<T> = { items?: T[] };

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as ListResponse<T>).items)) {
    return (payload as ListResponse<T>).items ?? [];
  }
  return [];
}

export function isFieldMessagingImage(
  attachment: Pick<MessagingAttachment, "attachmentType" | "mimeType">,
): boolean {
  if (attachment.attachmentType === "IMAGE") return true;
  const mime = attachment.mimeType?.trim().toLowerCase() ?? "";
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}

export async function loadFieldMessagingAttachmentObjectUrl(attachmentId: string): Promise<string> {
  const res = await apiFetchRaw(
    `${MESSAGING_API}/attachments/${encodeURIComponent(attachmentId)}/content`,
  );
  if (!res.ok) {
    throw new ApiError(`Unable to load attachment (${res.status})`, res.status);
  }
  return URL.createObjectURL(await res.blob());
}

export const fieldMessagingApi = {
  listThreads: async () => {
    const result = await apiGet<ListResponse<MessagingThread> | MessagingThread[]>(
      `${MESSAGING_API}/threads`,
    );
    return asItems<MessagingThread>(result);
  },

  getThread: async (
    threadId: string,
    query?: { since?: string; before?: string; limit?: number },
  ) => {
    const params: Record<string, string> = {};
    if (query?.since) params.since = query.since;
    if (query?.before) params.before = query.before;
    if (query?.limit != null) params.limit = String(query.limit);
    return apiGet<MessagingThread>(
      `${MESSAGING_API}/threads/${encodeURIComponent(threadId)}`,
      Object.keys(params).length ? { query: params } : undefined,
    );
  },

  createThread: (body: {
    threadType: "DIRECT" | "GROUP";
    title?: string;
    description?: string;
    memberUserIds: string[];
  }) => apiSend<MessagingThread>(`${MESSAGING_API}/threads`, "POST", body),

  markRead: (threadId: string) =>
    apiSend<{ ok?: boolean }>(
      `${MESSAGING_API}/threads/${encodeURIComponent(threadId)}/read`,
      "POST",
      {},
    ),

  sendMessage: (
    threadId: string,
    body: {
      body?: string;
      attachmentIds?: string[];
      links?: Array<{ url: string; title?: string }>;
      replyToMessageId?: string;
    },
  ) =>
    apiSend<MessagingMessage>(
      `${MESSAGING_API}/threads/${encodeURIComponent(threadId)}/messages`,
      "POST",
      body,
    ),

  uploadImage: async (threadId: string, file: File) => {
    const mimeType = file.type.trim().toLowerCase().startsWith("image/")
      ? file.type.trim().toLowerCase()
      : "image/jpeg";
    const filename = file.name.trim() && file.name.includes(".") ? file.name.trim() : "photo.jpg";
    const init = await apiSend<{
      attachmentId: string;
      uploadUrl: string;
      mimeType?: string;
    }>(`${MESSAGING_API}/attachments/upload-url`, "POST", {
      threadId,
      filename,
      mimeType,
      contentLength: file.size,
    });
    const contentType = init.mimeType?.trim() || mimeType;
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", init.uploadUrl);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.setRequestHeader("x-amz-server-side-encryption", "aws:kms");
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        reject(new Error(`Upload to storage failed (${xhr.status}). Please try again.`));
      };
      xhr.onerror = () => reject(new Error("Upload blocked by the browser. Try again."));
      xhr.send(file);
    });
    await apiSend(
      `${MESSAGING_API}/attachments/${encodeURIComponent(init.attachmentId)}/complete`,
      "POST",
      {},
    );
    return init.attachmentId;
  },

  listParticipants: async () => {
    const result = await apiGet<ListResponse<MessagingParticipant> | MessagingParticipant[]>(
      `${MESSAGING_API}/participants`,
    );
    return asItems<MessagingParticipant>(result);
  },
};
