import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import {
  registrarNoShow,
  desbloquearFuncionario,
  listPenalidadesLogs
} from "../../services/penalidades";

export default async function registerPenalidades(app: FastifyInstance) {
  // 1. Registrar No-Show
  app.post(
    "/penalidades/registrar-noshow",
    {
      schema: {
        tags: ["penalidades"],
        summary: "Registrar falta/No-Show de funcionário",
        description: "Aplica o bloqueio progressivo por no-show (5, 10, 20, 30 dias) e adiciona ao log de auditoria.",
        body: {
          type: "object",
          required: ["id_funcionario"],
          properties: {
            id_funcionario: { type: "integer" },
            data_falta: { type: "string", format: "date-time" },
            justificativa: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              log: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  id_funcionario: { type: "integer" },
                  data_falta: { type: ["string", "null"] },
                  dias_suspensao: { type: "integer" },
                  bloqueado_ate: { type: "string" },
                  justificativa: { type: ["string", "null"] },
                  criado_em: { type: "string" }
                }
              }
            }
          },
          500: {
            type: "object",
            required: ["message", "details"],
            properties: {
              message: { type: "string" },
              details: {
                type: "object",
                properties: { correlation_id: { type: "string", format: "uuid" } }
              }
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const body = req.body as { id_funcionario: number; data_falta?: string; justificativa?: string };
        const dataFalta = body.data_falta ? new Date(body.data_falta) : undefined;
        
        const log = await registrarNoShow(body.id_funcionario, dataFalta, body.justificativa);
        return { success: true, log };
      } catch (err) {
        console.error("[registerPenalidades] Erro ao registrar no-show:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 2. Desbloquear Funcionário
  app.post(
    "/penalidades/desbloquear",
    {
      schema: {
        tags: ["penalidades"],
        summary: "Desbloquear funcionário suspenso",
        description: "Remove o bloqueio de escala de um funcionário antes do tempo e registra a justificativa no log.",
        body: {
          type: "object",
          required: ["id_funcionario", "justificativa"],
          properties: {
            id_funcionario: { type: "integer" },
            justificativa: { type: "string", minLength: 1 }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              log: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  id_funcionario: { type: "integer" },
                  data_falta: { type: ["string", "null"] },
                  dias_suspensao: { type: "integer" },
                  bloqueado_ate: { type: "string" },
                  justificativa: { type: ["string", "null"] },
                  criado_em: { type: "string" }
                }
              }
            }
          },
          400: {
            type: "object",
            properties: { error: { type: "string" } }
          },
          500: {
            type: "object",
            required: ["message", "details"],
            properties: {
              message: { type: "string" },
              details: {
                type: "object",
                properties: { correlation_id: { type: "string", format: "uuid" } }
              }
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const body = req.body as { id_funcionario: number; justificativa: string };
        if (!body.justificativa || body.justificativa.trim() === "") {
          reply.code(400);
          return { error: "Justificativa de liberação é obrigatória" };
        }

        const log = await desbloquearFuncionario(body.id_funcionario, body.justificativa);
        return { success: true, log };
      } catch (err) {
        if ((err as Error).message === "JUSTIFICATIVA_OBRIGATORIA") {
          reply.code(400);
          return { error: "Justificativa de liberação é obrigatória" };
        }
        console.error("[registerPenalidades] Erro ao desbloquear funcionário:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 3. Listar Logs de Auditoria
  app.get(
    "/penalidades/logs",
    {
      schema: {
        tags: ["penalidades"],
        summary: "Obter logs de auditoria de penalidades",
        description: "Lista o histórico de no-shows e liberações manuais, opcionalmente filtrando por funcionário.",
        query: {
          type: "object",
          properties: {
            id_funcionario: { type: "integer" }
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
                  properties: {
                    id: { type: "string" },
                    id_funcionario: { type: "integer" },
                    data_falta: { type: ["string", "null"] },
                    dias_suspensao: { type: "integer" },
                    bloqueado_ate: { type: "string" },
                    justificativa: { type: ["string", "null"] },
                    criado_em: { type: "string" }
                  }
                }
              }
            }
          },
          500: {
            type: "object",
            required: ["message", "details"],
            properties: {
              message: { type: "string" },
              details: {
                type: "object",
                properties: { correlation_id: { type: "string", format: "uuid" } }
              }
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const query = req.query as { id_funcionario?: number };
        const rows = await listPenalidadesLogs(query.id_funcionario);
        return { rows };
      } catch (err) {
        console.error("[registerPenalidades] Erro ao listar logs:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );
}
