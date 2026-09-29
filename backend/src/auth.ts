import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.ts";

export type Role = "control" | "overlay";

function tokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const query = request.query as Record<string, unknown> | undefined;
  return typeof query?.token === "string" ? query.token : undefined;
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function roleFor(config: Config, request: FastifyRequest): Role | null {
  if (!config.controlToken) return "control";
  const token = tokenFrom(request);
  if (!token) return null;
  if (same(token, config.controlToken)) return "control";
  if (config.overlayToken && same(token, config.overlayToken)) return "overlay";
  return null;
}

export function requireRole(config: Config, allowed: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = roleFor(config, request);
    if (!role || !allowed.includes(role)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
