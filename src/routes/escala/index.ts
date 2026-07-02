import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { getPool, sql } from "../../db";
import { criarConviteManual, removerFuncionarioDaEscala } from "../../services/escalaService";
import { generateScalePdf } from "../../utils/pdfGenerator";

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
        if (msg === "COLABORADOR_JA_CONFIRMOU_PRESENCA") {
          reply.code(400);
          return { error: "Não é possível remover. Colaborador já confirmou presença via GPS/Portal." };
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

  // 7. GET /api/pontos-encontro
  app.get(
    "/api/pontos-encontro",
    async (req, reply) => {
      try {
        const query = req.query as { id_filial: string };
        const pool = await getPool();
        const result = await pool.request()
          .input("id_filial", sql.Int, Number(query.id_filial))
          .query(`
            SELECT CAST(id AS NVARCHAR(36)) AS id, id_filial, nome, latitude, longitude, raio_tolerancia_metros, criado_em
            FROM dbo.ESCALA_pontos_encontro
            WHERE id_filial = @id_filial
            ORDER BY nome ASC
          `);
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao buscar pontos de encontro" };
      }
    }
  );

  // 8. POST /api/pontos-encontro
  app.post(
    "/api/pontos-encontro",
    async (req, reply) => {
      try {
        const { id_filial, nome, latitude, longitude, raio_tolerancia_metros } = req.body as {
          id_filial: number;
          nome: string;
          latitude: number;
          longitude: number;
          raio_tolerancia_metros?: number;
        };

        const pool = await getPool();
        const uuid = randomUUID();
        await pool.request()
          .input("id", sql.UniqueIdentifier, uuid)
          .input("id_filial", sql.Int, id_filial)
          .input("nome", sql.VarChar(150), nome)
          .input("latitude", sql.Decimal(9, 6), latitude)
          .input("longitude", sql.Decimal(9, 6), longitude)
          .input("raio_tolerancia_metros", sql.Int, raio_tolerancia_metros ?? 100)
          .query(`
            INSERT INTO dbo.ESCALA_pontos_encontro (id, id_filial, nome, latitude, longitude, raio_tolerancia_metros, criado_em)
            VALUES (@id, @id_filial, @nome, @latitude, @longitude, @raio_tolerancia_metros, SYSUTCDATETIME())
          `);

        return { success: true, id: uuid };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao cadastrar ponto de encontro" };
      }
    }
  );

  // 9. POST /api/escalas/:id/ponto-encontro
  app.post(
    "/api/escalas/:id/ponto-encontro",
    async (req, reply) => {
      try {
        const { id } = req.params as { id: string };
        const { usar_ponto_encontro, id_ponto_encontro } = req.body as { usar_ponto_encontro: boolean; id_ponto_encontro: string | null };

        const pool = await getPool();
        await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .input("usar_ponto_encontro", sql.Bit, usar_ponto_encontro ? 1 : 0)
          .input("id_ponto_encontro", sql.UniqueIdentifier, id_ponto_encontro || null)
          .query(`
            UPDATE dbo.ESCALA_ordemservico
            SET usar_ponto_encontro = @usar_ponto_encontro, id_ponto_encontro = @id_ponto_encontro
            WHERE id_ordemservico = @id_ordemservico
          `);

        return { success: true };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao atualizar ponto de encontro" };
      }
    }
  );

  // 10. GET /api/escalas/monitoramento
  app.get(
    "/api/escalas/monitoramento",
    async (req, reply) => {
      try {
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT 
            v.numero_os,
            v.data_evento,
            v.cliente_nome,
            v.loja_nome,
            v.loja_numero,
            v.coordenador_nome,
            v.qtde_necessaria,
            v.qtde_confirmados,
            (SELECT COUNT(*) FROM dbo.ESCALA_ordemservico_funcionarios_convites c WHERE c.id_ordemservico = v.numero_os AND c.convite_aceito = 0 AND c.convite_recusado = 0 AND c.validade_convite > GETDATE()) AS qtde_convidados,
            v.qtde_recusados,
            v.pct_completamento,
            eo.latitude,
            eo.longitude,
            eo.raio_tolerancia_metros AS raio_tolerancia,
            CASE 
              WHEN v.pct_completamento >= 100 THEN 'Completa'
              WHEN eo.tipo_completamento_ultimo = 'Montagem Automática em Andamento' THEN 'Montagem Automática em Andamento'
              WHEN eo.tipo_completamento_ultimo = 'Sorteio' THEN 'Sorteio'
              ELSE 'Incompleta'
            END AS status_escala
          FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS v
          LEFT JOIN dbo.ESCALA_ordemservico eo ON eo.id_ordemservico = v.numero_os
          WHERE v.data_evento >= DATEADD(day, -2, CAST(GETDATE() AS DATE))
          ORDER BY v.data_evento DESC
        `);
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao buscar monitoramento das escalas" };
      }
    }
  );

  // 11. GET /api/escalas/:id/monitoramento-detalhes
  app.get(
    "/api/escalas/:id/monitoramento-detalhes",
    async (req, reply) => {
      try {
        const { id } = req.params as { id: string };
        const pool = await getPool();
        const result = await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .query(`
            SELECT 
              p.id_funcionario,
              p.funcionario_nome AS nome,
              p.funcionario_cpf AS cpf,
              COALESCE(p.funcionario_celular, p.funcionario_telefone, '') AS celular,
              CASE 
                WHEN f.compartilha_gps = 0 THEN CONCAT(COALESCE(NULLIF(TRIM(p.funcionario_classificacao), ''), 'C'), '-') 
                ELSE COALESCE(NULLIF(TRIM(p.funcionario_classificacao), ''), 'C') 
              END AS classificacao,
              p.status_pessoa,
              p.periodo,
              COALESCE(esc.func_confirmou, 0) AS func_confirmou,
              esc.ConfirmadoPorQuem,
              esc.dataora_saida,
              esc.justificativa_saida
            FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS p
            LEFT JOIN dbo.ESCALA_ordemservico_funcionarios esc ON esc.id_ordemservico = p.id_ordemservico AND esc.id_funcionario = p.id_funcionario
            LEFT JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = p.id_funcionario
            WHERE p.id_ordemservico = @id_ordemservico
          `);

        const rows = result.recordset ?? [];
        
        // confirmados: Alocados ou confirmados
        const confirmados = rows.filter(
          r => r.status_pessoa === 'ALOCADA SGS' || r.status_pessoa === 'CONFIRMADA SGS' || r.func_confirmou === 1
        );
        
        // pendentes: Convidados
        const pendentes = rows.filter(
          r => r.status_pessoa === 'CONVIDADA' && r.func_confirmou !== 1
        );

        return { confirmados, pendentes };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao buscar detalhes de monitoramento" };
      }
    }
  );

  // 12. POST /api/escalas/:id/confirmar-manual
  app.post(
    "/api/escalas/:id/confirmar-manual",
    async (req, reply) => {
      try {
        const { id } = req.params as { id: string };
        const { id_funcionario, justificativa } = req.body as { id_funcionario: number; justificativa: string };

        if (!id_funcionario || !justificativa || !justificativa.trim()) {
          reply.code(400);
          return { error: "ID do funcionário e justificativa são obrigatórios" };
        }

        const pool = await getPool();
        
        // Verifica se a pessoa está alocada na escala
        const checkResult = await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .input("id_funcionario", sql.Int, id_funcionario)
          .query(`
            SELECT 1 FROM dbo.ESCALA_ordemservico_funcionarios
            WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
          `);

        if (checkResult.recordset.length === 0) {
          reply.code(400);
          return { error: "Colaborador não está alocado na escala desta OS" };
        }

        const confirmadoPor = `Manual: ${justificativa.trim()}`;
        await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .input("id_funcionario", sql.Int, id_funcionario)
          .input("confirmado_por", sql.VarChar(150), confirmadoPor)
          .query(`
            UPDATE dbo.ESCALA_ordemservico_funcionarios
            SET func_confirmou = 1, ConfirmadoPorQuem = @confirmado_por, datahora_checkin = GETDATE()
            WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
          `);

        return { success: true };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao realizar confirmação manual" };
      }
    }
  );

  // 13. GET /api/escalas/:id/pdf-relatorio
  app.get(
    "/api/escalas/:id/pdf-relatorio",
    async (req, reply) => {
      try {
        const { id } = req.params as { id: string };
        const { filtro, mostrar_checkin, mostrar_sem_aceite } = req.query as {
          filtro?: string;
          mostrar_checkin?: string;
          mostrar_sem_aceite?: string;
        };

        const pool = await getPool();
        
        // 1. Busca dados da OS
        const osRes = await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .query(`
            SELECT numero_os, data_evento, cliente_nome, loja_nome, coordenador_nome
            FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS
            WHERE numero_os = @id_ordemservico
          `);

        const os = osRes.recordset[0];
        if (!os) {
          reply.code(404);
          return { error: "Ordem de serviço não encontrada" };
        }

        // 2. Busca pessoas escaladas
        const peopleRes = await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .query(`
            SELECT 
              p.funcionario_nome AS nome,
              p.funcionario_cpf AS cpf,
              CASE 
                WHEN f.compartilha_gps = 0 THEN CONCAT(COALESCE(NULLIF(TRIM(p.funcionario_classificacao), ''), 'C'), '-') 
                ELSE COALESCE(NULLIF(TRIM(p.funcionario_classificacao), ''), 'C') 
              END AS classificacao,
              p.status_pessoa,
              p.periodo,
              COALESCE(esc.func_confirmou, 0) AS func_confirmou,
              esc.datahora_checkin
            FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS p
            LEFT JOIN dbo.ESCALA_ordemservico_funcionarios esc ON esc.id_ordemservico = p.id_ordemservico AND esc.id_funcionario = p.id_funcionario
            LEFT JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = p.id_funcionario
            WHERE p.id_ordemservico = @id_ordemservico
          `);

        let members: any[] = peopleRes.recordset ?? [];

        // Filtra recusados e declinados
        members = members.filter(m => m.status_pessoa !== 'CONVITE RECUSADO' && m.status_pessoa !== 'DECLINADA SGS');

        if (filtro === "confirmados") {
          members = members.filter(m => m.func_confirmou === 1 || m.status_pessoa === 'CONFIRMADA SGS' || m.status_pessoa === 'ALOCADA SGS');
        } else {
          // todos - se mostrar_sem_aceite === '0', removemos os convidados pendentes
          if (mostrar_sem_aceite === "0") {
            members = members.filter(m => m.status_pessoa !== 'CONVIDADA');
          }
        }

        const reportData = {
          numero_os: os.numero_os,
          data_evento: os.data_evento,
          cliente_nome: os.cliente_nome,
          loja_nome: os.loja_nome,
          coordenador_nome: os.coordenador_nome,
          mostrar_checkin: mostrar_checkin !== "0",
          members: members.map(m => ({
            nome: m.nome,
            cpf: m.cpf,
            classificacao: m.classificacao,
            status_pessoa: m.status_pessoa,
            periodo: m.periodo,
            func_confirmou: m.func_confirmou,
            datahora_checkin: m.datahora_checkin ? m.datahora_checkin.toISOString() : null
          }))
        };

        reply.raw.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Relatorio_Escala_OS_${id}.pdf"`
        });

        generateScalePdf(reportData, reply.raw);
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao gerar relatório PDF" };
      }
    }
  );

  // 14. GET /public/escalas/:id/acompanhamento
  app.get(
    "/public/escalas/:id/acompanhamento",
    async (req, reply) => {
      try {
        const { id } = req.params as { id: string };
        const pool = await getPool();

        // 1. Busca dados da OS
        const osRes = await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .query(`
            SELECT numero_os, data_evento, cliente_nome, loja_nome, coordenador_nome, qtde_necessaria
            FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS
            WHERE numero_os = @id_ordemservico
          `);

        const os = osRes.recordset[0];
        if (!os) {
          reply.type("text/html").send("<h1>Ordem de serviço não encontrada</h1>");
          return;
        }

        // 2. Busca membros confirmados
        const peopleRes = await pool.request()
          .input("id_ordemservico", sql.Int, Number(id))
          .query(`
            SELECT 
              p.funcionario_nome AS nome,
              CASE 
                WHEN f.compartilha_gps = 0 THEN CONCAT(COALESCE(NULLIF(TRIM(p.funcionario_classificacao), ''), 'C'), '-') 
                ELSE COALESCE(NULLIF(TRIM(p.funcionario_classificacao), ''), 'C') 
              END AS classificacao,
              p.periodo,
              esc.datahora_checkin,
              COALESCE(esc.func_confirmou, 0) AS func_confirmou,
              esc.ConfirmadoPorQuem
            FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS p
            INNER JOIN dbo.ESCALA_ordemservico_funcionarios esc ON esc.id_ordemservico = p.id_ordemservico AND esc.id_funcionario = p.id_funcionario
            LEFT JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = p.id_funcionario
            WHERE p.id_ordemservico = @id_ordemservico
              AND esc.escala_declinada_pos_aceite = 0
              AND p.status_pessoa NOT IN ('CONVITE RECUSADO', 'DECLINADA SGS')
            ORDER BY p.funcionario_nome ASC
          `);

        const members = peopleRes.recordset ?? [];
        const confirmadosCount = members.filter(m => m.func_confirmou === 1).length;
        const totalCount = os.qtde_necessaria || 1;
        const pct = Math.round((confirmadosCount / totalCount) * 100);

        const dateStr = new Date(os.data_evento).toLocaleDateString("pt-BR", { timeZone: "UTC" });

        const rowsHtml = members.map(m => {
          const isConfirmed = m.func_confirmou === 1;
          const statusBadge = isConfirmed 
            ? `<span class="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">Confirmado (${m.ConfirmadoPorQuem || 'SGS'})</span>`
            : `<span class="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">Pendente</span>`;
          
          const timeStr = (isConfirmed && m.datahora_checkin)
            ? new Date(m.datahora_checkin).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })
            : "—";

          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/55 transition">
              <td class="px-6 py-4 text-sm font-semibold text-slate-800">${m.nome}</td>
              <td class="px-6 py-4 text-sm text-center font-bold text-slate-500">
                <span class="inline-block bg-slate-100 px-2 py-1 rounded text-xs">Classe ${m.classificacao}</span>
              </td>
              <td class="px-6 py-4 text-sm text-slate-650">${m.periodo || 'Integral'}</td>
              <td class="px-6 py-4 text-sm text-center text-slate-600 font-mono">${timeStr}</td>
              <td class="px-6 py-4 text-right">${statusBadge}</td>
            </tr>
          `;
        }).join("");

        const html = `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Datasite - Acompanhamento OS-${os.numero_os}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
              body {
                font-family: 'Outfit', sans-serif;
              }
            </style>
          </head>
          <body class="bg-slate-50 min-h-screen pb-12 text-slate-900 selection:bg-blue-500 selection:text-white">
            <!-- Header -->
            <header class="bg-blue-900 text-white shadow-lg shadow-blue-900/10">
              <div class="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
                <div>
                  <h1 class="text-2xl font-black tracking-tight">DATASITE</h1>
                  <p class="text-xs text-blue-200 uppercase tracking-widest font-semibold mt-0.5">Painel de Acompanhamento Público</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="flex h-3 w-3 relative">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span class="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Ao Vivo</span>
                </div>
              </div>
            </header>

            <main class="max-w-4xl mx-auto px-4 mt-8 space-y-6">
              <!-- OS Summary Card -->
              <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
                <div class="space-y-2">
                  <span class="bg-blue-50 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Ordem de Serviço</span>
                  <h2 class="text-2xl font-bold text-slate-800">OS-${os.numero_os}</h2>
                  <p class="text-sm font-semibold text-slate-500">${os.cliente_nome} — ${os.loja_nome}</p>
                  <p class="text-xs text-slate-400">📅 Data: ${dateStr} | Coordenador: ${os.coordenador_nome || 'Não definido'}</p>
                </div>

                <div class="w-full md:w-56 text-right space-y-2">
                  <div class="flex justify-between text-xs font-bold text-slate-500">
                    <span>Presenças: ${confirmadosCount}/${totalCount}</span>
                    <span>${pct}%</span>
                  </div>
                  <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/50">
                    <div class="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                  </div>
                </div>
              </div>

              <!-- Members Table -->
              <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-150 bg-slate-50/50">
                  <h3 class="font-bold text-slate-700 text-sm uppercase tracking-wider">Lista de Presença da Equipe</h3>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th class="px-6 py-3">Nome</th>
                        <th class="px-6 py-3 text-center">Ranking</th>
                        <th class="px-6 py-3">Período</th>
                        <th class="px-6 py-3 text-center">Hora Check-in</th>
                        <th class="px-6 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rowsHtml || `<tr><td colspan="5" class="px-6 py-8 text-center text-sm text-slate-400">Nenhum colaborador alocado nesta escala ainda.</td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          </body>
          </html>
        `;

        reply.type("text/html").send(html);
      } catch (err) {
        console.error(err);
        reply.code(500).type("text/html").send("<h1>Erro interno ao carregar acompanhamento</h1>");
      }
    }
  );

  // 15. GET /api/escalas/relatorios/frequencia
  app.get(
    "/api/escalas/relatorios/frequencia",
    async (req, reply) => {
      try {
        const query = req.query as {
          id_filial?: string;
          id_cliente?: string;
          data_inicio?: string;
          data_fim?: string;
        };

        const pool = await getPool();
        const request = pool.request();

        let whereClause = "WHERE id_funcionario IS NOT NULL";
        
        if (query.id_filial) {
          whereClause += " AND id_filial = @id_filial";
          request.input("id_filial", sql.Int, Number(query.id_filial));
        }
        if (query.id_cliente) {
          whereClause += " AND id_cliente = @id_cliente";
          request.input("id_cliente", sql.Int, Number(query.id_cliente));
        }
        if (query.data_inicio) {
          whereClause += " AND dia >= @data_inicio";
          request.input("data_inicio", sql.Date, query.data_inicio);
        }
        if (query.data_fim) {
          whereClause += " AND dia <= @data_fim";
          request.input("data_fim", sql.Date, query.data_fim);
        }

        const sqlQuery = `
          SELECT 
            id_funcionario,
            NOME AS nome_colaborador,
            COALESCE(FilialDatasite, 'Sem Base') AS base_nome,
            COALESCE(Cliente, 'Sem Cliente') AS cliente_nome,
            SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END) AS total_escalas,
            SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) AS comparecimentos,
            COALESCE(
              CAST(
                CAST(SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) AS float) 
                / NULLIF(SUM(CASE WHEN Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR faltou = 'S' OR Presenca = 'FALTOU' THEN 1 ELSE 0 END), 0) * 100 
                AS decimal(5,2)
              ), 
              0.0
            ) AS pct_presenca
          FROM dbo.VIEW_OS_PESSOAS
          \${whereClause}
          GROUP BY id_funcionario, NOME, FilialDatasite, Cliente
          ORDER BY NOME ASC, Cliente ASC
        `;

        const result = await request.query(sqlQuery);
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao gerar relatório de frequência" };
      }
    }
  );

  // 15b. GET /api/escalas/relatorios/desempenho
  app.get(
    "/api/escalas/relatorios/desempenho",
    async (req, reply) => {
      try {
        const query = req.query as {
          id_filial?: string;
          id_cliente?: string;
          data_inicio?: string;
          data_fim?: string;
        };

        const pool = await getPool();
        const request = pool.request();

        let whereClause = "WHERE p.id_funcionario IS NOT NULL";
        
        if (query.id_filial) {
          whereClause += " AND p.id_filial = @id_filial";
          request.input("id_filial", sql.Int, Number(query.id_filial));
        }
        if (query.id_cliente) {
          whereClause += " AND p.id_cliente = @id_cliente";
          request.input("id_cliente", sql.Int, Number(query.id_cliente));
        }
        if (query.data_inicio) {
          whereClause += " AND p.dia >= @data_inicio";
          request.input("data_inicio", sql.Date, query.data_inicio);
        }
        if (query.data_fim) {
          whereClause += " AND p.dia <= @data_fim";
          request.input("data_fim", sql.Date, query.data_fim);
        }

        const sqlQuery = `
          SELECT 
            p.id_funcionario,
            p.NOME AS nome_colaborador,
            COALESCE(p.FilialDatasite, 'Sem Base') AS base_nome,
            COALESCE(p.Cliente, 'Sem Cliente') AS cliente_nome,
            SUM(CASE WHEN p.Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR p.faltou = 'S' OR p.Presenca = 'FALTOU' THEN 1 ELSE 0 END) AS total_escalas,
            SUM(CASE WHEN p.Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) AS comparecimentos,
            COALESCE(
              CAST(
                CAST(SUM(CASE WHEN p.Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') THEN 1 ELSE 0 END) AS float) 
                / NULLIF(SUM(CASE WHEN p.Presenca IN ('PRESENTE', 'PRESENTE (JUSTIFICADO)') OR p.faltou = 'S' OR p.Presenca = 'FALTOU' THEN 1 ELSE 0 END), 0) * 100 
                AS decimal(5,2)
              ), 
              0.0
            ) AS pct_presenca,
            COALESCE(fa.media_pecas_hora, 0.0) AS media_produtividade
          FROM dbo.VIEW_OS_PESSOAS p
          LEFT JOIN dbo.ESCALA_funcionarios_avaliacao fa ON fa.id_funcionario = p.id_funcionario
          ${whereClause}
          GROUP BY p.id_funcionario, p.NOME, p.FilialDatasite, p.Cliente, fa.media_pecas_hora
          ORDER BY p.NOME ASC, p.Cliente ASC
        `;

        const result = await request.query(sqlQuery);
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao gerar relatório de desempenho" };
      }
    }
  );

  // 16. GET /api/clientes
  app.get(
    "/api/clientes",
    async (req, reply) => {
      try {
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT DISTINCT id_cliente, Cliente AS nome
          FROM dbo.VIEW_OS_PESSOAS
          WHERE id_cliente IS NOT NULL
          ORDER BY Cliente ASC
        `);
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao buscar clientes" };
      }
    }
  );
}