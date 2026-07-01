import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { getPool, sql } from "../../db";

export default async function registerFuncionarios(app: FastifyInstance) {
  // 1. Buscar colaboradores ativos para Autocomplete
  app.get(
    "/api/funcionarios/search",
    {
      schema: {
        tags: ["funcionarios"],
        summary: "Pesquisar colaboradores freelancers",
        description: "Busca colaboradores ativos pelo nome para autocompletar.",
        query: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 1, description: "Termo de busca" }
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
                  required: ["id_funcionario", "nome", "classificacao", "ranking_score"],
                  properties: {
                    id_funcionario: { type: "integer" },
                    nome: { type: "string" },
                    classificacao: { type: "string" },
                    ranking_score: { type: "number" }
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
        const query = req.query as { q: string };
        const pool = await getPool();

        const result = await pool.request()
          .input("search", sql.VarChar(100), `%${query.q}%`)
          .query(`
            SELECT TOP 15
              ID_FUNCIONARIO AS id_funcionario,
              NOME AS nome,
              COALESCE(classificacao, 'C') AS classificacao,
              COALESCE(TRY_CONVERT(float, ranking_score), 0.0) AS ranking_score
            FROM dbo.t2_funcionarios
            WHERE ID_CARGO = 13 -- Freelancers/Inventariantes
              AND ISNULL(INATIVO, 'N') = 'N'
              AND NOME LIKE @search
            ORDER BY NOME ASC
          `);
        
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error("[registerFuncionarios] Erro ao buscar colaboradores:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 2. Histórico e Métricas do Colaborador
  app.get(
    "/api/funcionarios/:id/historico",
    {
      schema: {
        tags: ["funcionarios"],
        summary: "Métricas e histórico de escalas do colaborador",
        description: "Retorna o histórico de OSs e os índices de frequência/atraso e comparecimento.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer", description: "ID do funcionário" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["metrics", "os"],
            properties: {
              metrics: {
                type: "object",
                required: ["nome", "classificacao", "ranking_score", "frequencia_real", "taxa_resposta", "qtde_presencas", "qtde_atrasos"],
                properties: {
                  nome: { type: "string" },
                  classificacao: { type: "string" },
                  ranking_score: { type: "number" },
                  frequencia_real: { type: "number" },
                  taxa_resposta: { type: "number" },
                  qtde_presencas: { type: "integer" },
                  qtde_atrasos: { type: "integer" }
                }
              },
              os: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id_ordemservico", "data_os", "cliente_nome", "loja_nome", "status_pessoa"],
                  properties: {
                    id_ordemservico: { type: "integer" },
                    data_os: { type: "string" },
                    cliente_nome: { type: "string" },
                    loja_nome: { type: "string" },
                    status_pessoa: { type: "string" }
                  }
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
        const params = req.params as { id: number };
        const idFuncionario = Number(params.id);

        const pool = await getPool();

        // A. Busca as métricas de performance do t2_funcionarios e avaliacao
        const metricsRes = await pool.request()
          .input("id_funcionario", sql.Int, idFuncionario)
          .query(`
            SELECT 
              f.NOME AS nome,
              COALESCE(f.classificacao, 'C') AS classificacao,
              COALESCE(TRY_CONVERT(float, f.ranking_score), 0.0) AS ranking_score,
              COALESCE(TRY_CONVERT(float, f.frequencia_real), 0.0) AS frequencia_real,
              COALESCE(TRY_CONVERT(float, f.taxa_resposta), 0.0) AS taxa_resposta,
              COALESCE(ev.qtde_presencas, 0) AS qtde_presencas,
              COALESCE(ev.qtde_atrasos, 0) AS qtde_atrasos
            FROM dbo.t2_funcionarios f
            LEFT JOIN dbo.ESCALA_funcionarios_avaliacao ev ON ev.id_funcionario = f.ID_FUNCIONARIO
            WHERE f.ID_FUNCIONARIO = @id_funcionario
          `);

        const metrics = metricsRes.recordset[0];
        if (!metrics) {
          reply.code(400);
          return { error: "Colaborador não encontrado" };
        }

        // B. Busca o histórico de OSs do colaborador usando a VIEW_ESCALA_PESSOAS_ESCALADAS
        const osRes = await pool.request()
          .input("id_funcionario", sql.Int, idFuncionario)
          .query(`
            SELECT 
              id_ordemservico,
              data_os,
              cliente_nome,
              loja_nome,
              status_pessoa
            FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS
            WHERE id_funcionario = @id_funcionario
            ORDER BY data_os DESC
          `);

        return {
          metrics,
          os: osRes.recordset ?? []
        };

      } catch (err) {
        console.error("[registerFuncionarios] Erro ao carregar historico:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );
}
