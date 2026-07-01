import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { getEligibleFreelancers } from "../../services/rankingService";

export default async function registerRanking(app: FastifyInstance) {
  app.get(
    "/ranking/disponiveis",
    {
      schema: {
        tags: ["ranking"],
        summary: "Listar freelancers disponíveis e elegíveis",
        description: "Retorna a lista de inventariantes ativos (INATIVO = 'N', ID_CARGO = 13) para uma determinada filial, excluindo colaboradores bloqueados no momento.",
        query: {
          type: "object",
          required: ["id_filial"],
          properties: {
            id_filial: { type: "integer", minimum: 1, description: "ID da filial" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["rows"],
            properties: {
              rows: {
                type: "array",
                items: {
                  type: "object",
                  required: [
                    "id_funcionario", "nome", "cpf", "celular", "telefone",
                    "classificacao", "media_avaliacoes", "frequencia_real",
                    "taxa_resposta", "ranking_score", "bloqueado_ate"
                  ],
                  properties: {
                    id_funcionario: { type: "integer" },
                    nome: { type: "string" },
                    cpf: { type: "string" },
                    celular: { type: "string" },
                    telefone: { type: "string" },
                    classificacao: { type: "string" },
                    media_avaliacoes: { type: "number" },
                    frequencia_real: { type: "number" },
                    taxa_resposta: { type: "number" },
                    ranking_score: { type: "number" },
                    bloqueado_ate: { type: ["string", "null"] }
                  }
                }
              }
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
        const query = req.query as { id_filial: number };
        const idFilial = Number(query.id_filial);

        if (!Number.isInteger(idFilial) || idFilial <= 0) {
          reply.code(400);
          return { error: "id_filial deve ser um inteiro positivo" };
        }

        const rows = await getEligibleFreelancers(idFilial);
        reply.type("application/json");
        return { rows };
      } catch (err) {
        console.error("[registerRanking] Erro ao listar disponiveis:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );
}
