import type { FastifyInstance } from "fastify";

export default async function registerHealth(app: FastifyInstance) {
  app.get("/health", async () => {
    return { status: "ok" };
  });
}
