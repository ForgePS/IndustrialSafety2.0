import * as net from "net";
import {
  BLUETOOTH_NAMED_PIPE,
  CompanionRequest,
  CompanionResponse,
  parseJsonLine,
  toJsonLine,
} from "../services/protocol";

export type NamedPipeRequestHandler = (
  request: CompanionRequest
) => Promise<CompanionResponse>;

/**
 * Windows named-pipe JSON-lines server (main process only).
 * Path: \\.\pipe\ForgePrinterBridgeBluetooth — never bind a public TCP port.
 */
export class NamedPipeServer {
  private server: net.Server | null = null;
  private readonly clients = new Set<net.Socket>();
  private readonly startedAt = Date.now();

  constructor(private readonly onRequest: NamedPipeRequestHandler) {}

  get uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  start(pipePath: string = BLUETOOTH_NAMED_PIPE): Promise<void> {
    if (this.server) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.handleClient(socket));

      server.on("error", (err) => {
        if (!this.server) {
          reject(err);
        } else {
          console.error("[named-pipe] server error:", err);
        }
      });

      server.listen(pipePath, () => {
        this.server = server;
        console.log(`[named-pipe] listening on ${pipePath}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    const server = this.server;
    this.server = null;
    if (!server) return;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  /** Push an unsolicited status event to all connected clients. */
  broadcast(response: CompanionResponse): void {
    const line = toJsonLine(response);
    for (const client of this.clients) {
      if (!client.destroyed) {
        client.write(line);
      }
    }
  }

  private handleClient(socket: net.Socket): void {
    this.clients.add(socket);
    let buffer = "";

    socket.setEncoding("utf8");

    socket.on("data", async (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await this.processLine(socket, line);
        newlineIndex = buffer.indexOf("\n");
      }
    });

    socket.on("error", (err) => {
      console.error("[named-pipe] client error:", err.message);
    });

    socket.on("close", () => {
      this.clients.delete(socket);
    });
  }

  private async processLine(socket: net.Socket, line: string): Promise<void> {
    const request = parseJsonLine(line);
    if (!request) {
      socket.write(
        toJsonLine({
          type: "ERROR",
          code: "INVALID_REQUEST",
          message: "Expected a JSON object with a type field per line.",
        })
      );
      return;
    }

    try {
      const response = await this.onRequest(request);
      if (!socket.destroyed) {
        socket.write(toJsonLine(response));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!socket.destroyed) {
        socket.write(
          toJsonLine({
            type: "ERROR",
            code: "INTERNAL_ERROR",
            message,
            requestId: request.requestId,
          })
        );
      }
    }
  }
}
