import type { FastifyInstance } from "fastify";
import { validateEscala } from "../../services/validationService";
import { randomUUID } from "crypto";

export default async function registerValidation(app: FastifyInstance) {
  app.post("/validate", async (req, reply) => {
    try {
      const body = (typeof req.body === "object" && req.body) ? (req.body as any) : {};
      const p = Number(body.page) > 0 ? Number(body.page) : 1;
      const ps = Number(body.page_size) > 0 ? Number(body.page_size) : 50;

      const all = await validateEscala();
      const count = all.length;
      const start = (p - 1) * ps;
      const sliced = all.slice(start, start + ps);

      const normalizeCpf = (s: any) => String(s ?? "").replace(/\D+/g, "");
      const asBool = (v: any) => v === true || v === 1 || v === "1";

      const rows = sliced.map((r: any) => ({
        id_importacao: String(r.id_importacao ?? ""),
        id_ordemservico: Number(r.id_ordemservico ?? 0),
        id_funcionario: Number(r.id_funcionario ?? 0),
        cpf_funcionario: normalizeCpf(r.cpf_funcionario),
        avaliado: asBool(r.avaliado),
        escalado: asBool(r.escalado),
        forabase: asBool(r.forabase),
        disponibilidade: asBool(r.disponibilidade),
        observacao: String(r.observacao ?? "")
      }));

      reply.type("application/json");
      return { rows, meta: { count, page: p, page_size: ps } };
    } catch {
      const correlation_id = randomUUID();
      reply.code(500);
      reply.type("application/json");
      return { message: "Falha interna", details: { correlation_id } };
    }
  });
}
