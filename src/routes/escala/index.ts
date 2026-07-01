import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { criarConviteManual, removerFuncionarioDaEscala } from "../../services/escalaService";

export default async function registerEscalaLocal(app: FastifyInstance) {
  // 1. Enviar convite manual
  app.post(
    "/api/escalas/:id/convidar",
    {
      schema: {
        tags: ["escala"],
        summary: "Criar convite manual local",
        description: "Envia um convite de escala manual a um colaborador para a OS especificada.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer", description: "ID da Ordem de Serviço" }
          }
        },
        body: {
          type: "object",
          required: ["id_funcionario"],
          properties: {
            id_funcionario: { type: "integer", description: "ID do funcionário" }
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

        await criarConviteManual(idOrdemServico, idFuncionario);
        return { success: true, message: "Convite manual enviado com sucesso!" };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "ORDEM_SERVICO_NAO_ENCONTRADA") {
          reply.code(400);
          return { error: "Ordem de serviço não encontrada" };
        }
        if (msg === "VINCULO_JA_EXISTENTE") {
          reply.code(400);
          return { error: "Colaborador já possui vínculo ativo ou convite enviado para esta OS." };
        }

        console.error("[registerEscalaLocal] Erro ao enviar convite manual:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna ao criar convite", details: { correlation_id } };
      }
    }
  );

  // 2. Remover da escala / recusar convite
  app.post(
    "/api/escalas/:id/remover",
    {
      schema: {
        tags: ["escala"],
        summary: "Remover colaborador da escala/convite",
        description: "Deleta o colaborador da escala ou define o convite como recusado.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer", description: "ID da Ordem de Serviço" }
          }
        },
        body: {
          type: "object",
          required: ["id_funcionario"],
          properties: {
            id_funcionario: { type: "integer", description: "ID do funcionário" }
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

        await removerFuncionarioDaEscala(idOrdemServico, idFuncionario);
        return { success: true, message: "Colaborador removido da escala com sucesso." };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "VINCULO_NAO_ENCONTRADO") {
          reply.code(400);
          return { error: "Vínculo ou convite ativo não encontrado para este colaborador." };
        }

        console.error("[registerEscalaLocal] Erro ao remover colaborador:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna ao remover colaborador", details: { correlation_id } };
      }
    }
  );

  // 3. Processar Escala Automática
  app.post(
    "/api/escalas/auto",
    {
      schema: {
        tags: ["escala"],
        summary: "Processar auto-escala por ranking",
        description: "Preenche as vagas das ordens de serviço selecionadas de forma autônoma baseada nos parâmetros operacionais e mix de equipes.",
        body: {
          type: "object",
          required: ["ids_ordemservico", "min_classificacao", "mix_percent_a", "mix_percent_b", "mix_percent_c"],
          properties: {
            ids_ordemservico: { type: "array", items: { type: "integer" } },
            min_classificacao: { type: "string" },
            max_distancia: { type: "number" },
            min_presenca: { type: "number" },
            max_atraso: { type: "number" },
            min_resposta: { type: "number" },
            min_aceite: { type: "number" },
            mix_percent_a: { type: "integer" },
            mix_percent_b: { type: "integer" },
            mix_percent_c: { type: "integer" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["success", "results"],
            properties: {
              success: { type: "boolean" },
              results: { type: "object", additionalProperties: true }
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
        const { processarEscalaAutomatica } = await import("../../services/autoEscalaService");
        const body = req.body as any;
        const results = await processarEscalaAutomatica(body);
        return { success: true, results };
      } catch (err) {
        console.error("[registerEscalaLocal] Erro na auto-escala:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna ao executar auto-escala", details: { correlation_id } };
      }
    }
  );

  // 4. Iniciar Sorteio
  app.post(
    "/api/escalas/sortear",
    {
      schema: {
        tags: ["escala"],
        summary: "Iniciar sorteio/leilão competitivo",
        description: "Envia convites massivos para todos os colaboradores disponíveis qualificados nas OSs selecionadas.",
        body: {
          type: "object",
          required: ["ids_ordemservico", "min_classificacao"],
          properties: {
            ids_ordemservico: { type: "array", items: { type: "integer" } },
            min_classificacao: { type: "string" },
            max_distancia: { type: "number" },
            min_presenca: { type: "number" },
            max_atraso: { type: "number" },
            min_resposta: { type: "number" },
            min_aceite: { type: "number" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["success", "results"],
            properties: {
              success: { type: "boolean" },
              results: { type: "object", additionalProperties: true }
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
        const { iniciarSorteioLote } = await import("../../services/escalaService");
        const body = req.body as any;
        const results = await iniciarSorteioLote(body);
        return { success: true, results };
      } catch (err) {
        console.error("[registerEscalaLocal] Erro ao iniciar sorteio:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna ao iniciar sorteio", details: { correlation_id } };
      }
    }
  );

  // 5. Obter equipe do coordenador da OS
  app.get(
    "/api/escalas/:id/equipe-coordenador",
    {
      schema: {
        tags: ["escala"],
        summary: "Obter equipe vinculada ao coordenador desta OS",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer", description: "ID da Ordem de Serviço" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["temEquipe", "membros"],
            properties: {
              temEquipe: { type: "boolean" },
              equipe_id: { type: "string" },
              membros: { type: "array", items: { type: "integer" } }
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const { obterEquipeCoordenadorPorOS } = await import("../../services/escalaService");
        const params = req.params as { id: number };
        const result = await obterEquipeCoordenadorPorOS(Number(params.id));
        return result;
      } catch (err) {
        console.error("[registerEscalaLocal] Erro ao obter equipe do coordenador:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 6. Salvar lista da escala atual como equipe do coordenador
  app.post(
    "/api/escalas/:id/salvar-equipe-coordenador",
    {
      schema: {
        tags: ["escala"],
        summary: "Salvar lista de membros como equipe do coordenador desta OS",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer", description: "ID da Ordem de Serviço" }
          }
        },
        body: {
          type: "object",
          required: ["membros_ids"],
          properties: {
            membros_ids: { type: "array", items: { type: "integer" } }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["success", "equipe_id"],
            properties: {
              success: { type: "boolean" },
              equipe_id: { type: "string" }
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        const { salvarEquipeCoordenadorPorOS } = await import("../../services/escalaService");
        const params = req.params as { id: number };
        const body = req.body as { membros_ids: number[] };
        const result = await salvarEquipeCoordenadorPorOS(Number(params.id), body.membros_ids);
        return result;
      } catch (err) {
        console.error("[registerEscalaLocal] Erro ao salvar equipe do coordenador:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );
}
