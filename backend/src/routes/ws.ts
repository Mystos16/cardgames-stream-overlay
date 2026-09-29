import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { App } from "../app.ts";
import { requireRole } from "../auth.ts";

function pipe<T>(socket: WebSocket, subscribe: (listener: (message: T) => void) => () => void): void {
  const unsubscribe = subscribe((message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  });
  const ping = setInterval(() => socket.ping(), 25_000);
  socket.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
}

export async function wsRoutes(server: FastifyInstance, app: App): Promise<void> {
  server.get("/ws/overlay", { websocket: true, onRequest: requireRole(app.config, ["control", "overlay"]) }, (socket) => {
    const current = app.overlay.state();
    socket.send(JSON.stringify(current ?? { type: "hide" }));
    pipe(socket, (listener) => app.events.overlay.subscribe(listener));
  });

  server.get("/ws/control", { websocket: true, onRequest: requireRole(app.config, ["control"]) }, (socket) => {
    socket.send(JSON.stringify({ type: "overlay", message: app.overlay.state() }));
    for (const progress of app.preload.status()) socket.send(JSON.stringify({ type: "preload", progress }));
    pipe(socket, (listener) => app.events.control.subscribe(listener));
  });
}
