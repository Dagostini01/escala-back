import type { FastifyInstance } from "fastify";

export function registerContentParsers(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    { parseAs: "buffer" },
    (_req, payload, done) => {
      done(null, payload as Buffer);
    }
  );
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, payload, done) => {
      done(null, payload as Buffer);
    }
  );
}
