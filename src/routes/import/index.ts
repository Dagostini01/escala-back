import type { FastifyInstance } from "fastify";
import { importPostSchema } from "../../schemas/routes";
import { importExcel } from "../../services/importService";

export default async function registerImport(app: FastifyInstance) {
  app.post("/import", { schema: importPostSchema }, async (req, reply) => {
    if (!(req.body instanceof Buffer)) {
      reply.code(415);
      return { message: "Content-Type inválido. Envie .xlsx em modo binário", details: { expected: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } };
    }
    const buffer = req.body as Buffer;

    try {
      const result = await importExcel(buffer);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "EMPTY_SHEET") {
        reply.code(400);
        return { error: "Planilha vazia" };
      }
      if (msg === "INVALID_HEADER") {
        reply.code(400);
        return { error: "Cabeçalho inválido. Esperado: id_ordemservico, id_funcionario, cpf_funcionario" };
      }
      if (msg === "NO_VALID_ROWS") {
        reply.code(400);
        return { error: "Nenhuma linha válida encontrada" };
      }
      reply.code(500);
      return { error: "Falha ao importar", detail: msg };
    }
  });
}
