import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

function allowedOrigins(): Set<string> | null {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return null;
  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export async function registerCors(app: FastifyInstance): Promise<void> {
  const origins = allowedOrigins();

  await app.register(cors, {
    origin(origin, cb) {
      // Requests sem Origin (health check, curl, server-to-server) devem continuar funcionando.
      if (!origin || origins === null || origins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}
