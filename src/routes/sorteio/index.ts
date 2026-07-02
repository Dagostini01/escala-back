import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { aceitarVagaSorteio } from "../../services/sorteioService";

export default async function registerSorteio(app: FastifyInstance) {
  app.post(
    "/api/escalas/:id/aceitar-sorteio",
    {
      schema: {
        tags: ["sorteio"],
        summary: "Aceitar vaga de sorteio/leilão",
        description: "Permite ao freelancer aceitar uma vaga em modo sorteio de forma atômica (corrida por vaga).",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer", description: "ID da Ordem de Serviço (id_ordemservico)" }
          }
        },
        body: {
          type: "object",
          required: ["id_funcionario"],
          properties: {
            id_funcionario: { type: "integer", description: "ID do funcionário/colaborador" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["success", "message"],
            properties: {
              success: { type: "boolean" },
              message: { type: "string" }
            }
          },
          400: {
            type: "object",
            required: ["error"],
            properties: {
              error: { type: "string" }
            }
          },
          500: {
            type: "object",
            required: ["message", "details"],
            properties: {
              message: { type: "string" },
              details: {
                type: "object",
                required: ["correlation_id"],
                properties: {
                  correlation_id: { type: "string", format: "uuid" }
                }
              }
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const params = req.params as { id: number };
        const body = req.body as { id_funcionario: number };
        
        const idOrdemServico = Number(params.id);
        const idFuncionario = Number(body.id_funcionario);

        await aceitarVagaSorteio(idOrdemServico, idFuncionario);
        
        return { success: true, message: "Vaga aceita e confirmada com sucesso!" };
      } catch (err) {
        const msg = (err as Error).message;
        
        if (msg === "ORDEM_SERVICO_NAO_ENCONTRADA") {
          reply.code(400);
          return { error: "Ordem de serviço não encontrada" };
        }
        if (msg === "VAGAS_ESGOTADAS") {
          reply.code(400);
          return { error: "Corrida encerrada! Todas as vagas já foram preenchidas por outros colaboradores." };
        }
        if (msg === "CONVITE_INEXISTENTE_OU_EXPIRADO") {
          reply.code(400);
          return { error: "Você não possui um convite pendente ativo para esta escala ou a validade expirou." };
        }

        console.error("[registerSorteio] Erro ao aceitar sorteio:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna no processamento do aceite", details: { correlation_id } };
      }
    }
  );
}
