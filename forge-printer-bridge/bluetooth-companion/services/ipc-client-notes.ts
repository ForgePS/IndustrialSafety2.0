/**
 * IPC client notes for the Forge Windows Service (.NET NamedPipeClientStream).
 * The companion is the pipe *server*; this module documents the client contract
 * for implementers and does not open TCP sockets.
 */
import { BLUETOOTH_NAMED_PIPE, CompanionRequest, CompanionResponse, toJsonLine } from "./protocol";

export { BLUETOOTH_NAMED_PIPE };

export function encodeRequest(request: CompanionRequest): string {
  return toJsonLine(request);
}

export function tryParseResponse(line: string): CompanionResponse | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CompanionResponse;
  } catch {
    return null;
  }
}
