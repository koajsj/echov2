import type { WebSocket } from "ws";

interface Connection {
  socket: WebSocket;
  sessionId: string;
  userId: string;
  expiresAt: number;
}
export class ConnectionHub {
  private readonly connections = new Set<Connection>();
  attach(socket: WebSocket, sessionId: string, userId: string): void {
    if (
      this.connections.size >= 500 ||
      [...this.connections].filter((c) => c.userId === userId).length >= 10
    ) {
      socket.close(1013, "Connection limit");
      return;
    }
    const connection = {
      socket,
      sessionId,
      userId,
      expiresAt: Date.now() + 60000,
    };
    this.connections.add(connection);
    socket.on("close", () => this.connections.delete(connection));
    socket.on("error", () => this.connections.delete(connection));
    // Notification-only socket. Client messages never become persisted chat messages.
    socket.on("message", () => socket.close(1008, "Use HTTPS for writes"));
    socket.send(JSON.stringify({ type: "connected", syncRequired: true }));
  }
  notify(userId: string): void {
    for (const connection of this.connections) {
      if (connection.userId !== userId) continue;
      if (
        connection.expiresAt <= Date.now() ||
        connection.socket.readyState !== 1 ||
        connection.socket.bufferedAmount > 65536
      ) {
        this.connections.delete(connection);
        connection.socket.terminate();
        continue;
      }
      connection.socket.send(JSON.stringify({ type: "sync-required" }));
    }
  }
  onlineSessions(): number {
    return new Set(
      [...this.connections]
        .filter((c) => c.socket.readyState === 1 && c.expiresAt > Date.now())
        .map((c) => c.sessionId),
    ).size;
  }
  closeSession(sessionId: string): void {
    for (const c of this.connections)
      if (c.sessionId === sessionId) {
        this.connections.delete(c);
        c.socket.close(1008, "Session revoked");
        c.socket.terminate();
      }
  }
  expire(): void {
    for (const c of this.connections)
      if (Date.now() >= c.expiresAt) {
        this.connections.delete(c);
        c.socket.close(1000, "Reauthenticate and resync");
        c.socket.terminate();
      }
  }
  close(): void {
    for (const c of this.connections) c.socket.terminate();
    this.connections.clear();
  }
}
