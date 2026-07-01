import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { criarConviteManual, removerFuncionarioDaEscala } from "../../services/escalaService";
import { sql, getPool } from "../../db";

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
          return { error: "Este colaborador já confirmou presença no inventário e não pode ser removido." };
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

  // 7. Listar escalas para monitoramento (Hoje D e Amanhã D+1)
  app.get(
    "/api/escalas/monitoramento",
    async (req, reply) => {
      try {
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT 
            v.*,
            COALESCE(eo.id_filial, so.id_filial) AS id_filial,
            eo.latitude,
            eo.longitude,
            COALESCE(eo.raio_tolerancia_metros, 100) AS raio_tolerancia
          FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS v
          LEFT JOIN dbo.ESCALA_ordemservico eo ON eo.id_ordemservico = v.numero_os
          LEFT JOIN dbo.t2_ordemservico so ON so.id_ordemservico = v.numero_os
          WHERE v.data_evento >= CAST(DATEADD(day, -1, GETDATE()) AS DATE)
            AND v.data_evento <= CAST(DATEADD(day, 2, GETDATE()) AS DATE)
          ORDER BY v.data_evento ASC, v.numero_os ASC
        `);
        return { rows: result.recordset ?? [] };
      } catch (err) {
        console.error("[registerEscalaLocal] Erro ao buscar monitoramento:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 8. Obter detalhes de monitoramento da escala (Aceitos e Pendentes)
  app.get(
    "/api/escalas/:id/monitoramento-detalhes",
    async (req, reply) => {
      try {
        const params = req.params as { id: string };
        const idOrdemServico = Number(params.id);
        const pool = await getPool();
        
        // 1. Busca pessoas escaladas (confirmados/alocados)
        const alocadosRes = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query(`
            SELECT 
              f.id_funcionario,
              f.funcionario_nome AS nome,
              f.funcionario_cpf AS cpf,
              f.funcionario_celular AS celular,
              f.funcionario_classificacao AS classificacao,
              f.status_pessoa,
              f.periodo,
              ef.func_confirmou,
              ef.ConfirmadoPorQuem
            FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS f
            INNER JOIN dbo.ESCALA_ordemservico_funcionarios ef 
              ON ef.id_ordemservico = f.id_ordemservico AND ef.id_funcionario = f.id_funcionario
            WHERE f.id_ordemservico = @id_ordemservico
          `);

        // 2. Busca convites pendentes
        const convitesRes = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query(`
            SELECT 
              f.ID_FUNCIONARIO AS id_funcionario,
              f.NOME AS nome,
              f.CPF AS cpf,
              f.CELULAR AS celular,
              f.CLASSIFICACAO AS classificacao,
              'CONVIDADA' AS status_pessoa,
              c.convite_recusado,
              c.datahora_resposta_convite
            FROM dbo.ESCALA_ordemservico_funcionarios_convites c
            INNER JOIN dbo.t2_funcionarios f ON f.ID_FUNCIONARIO = c.id_funcionario
            WHERE c.id_ordemservico = @id_ordemservico
              AND c.convite_recusado = 0
              AND c.id_funcionario NOT IN (
                SELECT id_funcionario FROM dbo.ESCALA_ordemservico_funcionarios WHERE id_ordemservico = @id_ordemservico
              )
          `);

        return { 
          confirmados: alocadosRes.recordset ?? [],
          pendentes: convitesRes.recordset ?? []
        };
      } catch (err) {
        console.error("[registerEscalaLocal] Erro ao buscar detalhes de monitoramento:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 9. Confirmar check-in de forma manual com justificativa
  app.post(
    "/api/escalas/:id/confirmar-manual",
    async (req, reply) => {
      try {
        const params = req.params as { id: string };
        const idOrdemServico = Number(params.id);
        const { id_funcionario, justificativa } = req.body as { id_funcionario: number; justificativa: string };
        
        if (!justificativa || !justificativa.trim()) {
          reply.code(400);
          return { error: "A justificativa para a confirmação manual é obrigatória." };
        }

        const pool = await getPool();
        const result = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .input("id_funcionario", sql.Int, id_funcionario)
          .input("confirmado_por", sql.VarChar(150), `Manual: ${justificativa.trim()}`)
          .query(`
            UPDATE dbo.ESCALA_ordemservico_funcionarios
            SET func_confirmou = 1, ConfirmadoPorQuem = @confirmado_por
            WHERE id_ordemservico = @id_ordemservico AND id_funcionario = @id_funcionario
          `);
          
        return { success: true };
      } catch (err) {
        console.error("[registerEscalaLocal] Erro ao realizar confirmação manual:", err);
        const correlation_id = randomUUID();
        reply.code(500);
        return { message: "Falha interna", details: { correlation_id } };
      }
    }
  );

  // 10. Baixar relatório PDF da escala (Confirmados vs Todos)
  app.get(
    "/api/escalas/:id/pdf-relatorio",
    async (req, reply) => {
      try {
        const params = req.params as { id: string };
        const idOrdemServico = Number(params.id);
        const { filtro } = req.query as { filtro?: string };
        
        const pool = await getPool();
        
        const osRes = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query(`
            SELECT 
              v.numero_os,
              v.data_evento,
              v.cliente_nome,
              v.loja_nome,
              v.coordenador_nome
            FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS v
            WHERE v.numero_os = @id_ordemservico
          `);
        
        const os = osRes.recordset[0];
        if (!os) {
          reply.code(404);
          return { error: "Escala não encontrada" };
        }

        const queryMembers = `
          SELECT 
            f.funcionario_nome AS nome,
            f.funcionario_cpf AS cpf,
            f.funcionario_classificacao AS classificacao,
            f.status_pessoa,
            f.periodo,
            ef.func_confirmou
          FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS f
          INNER JOIN dbo.ESCALA_ordemservico_funcionarios ef 
            ON ef.id_ordemservico = f.id_ordemservico AND ef.id_funcionario = f.id_funcionario
          WHERE f.id_ordemservico = @id_ordemservico
            ${filtro === "confirmados" ? "AND ef.func_confirmou = 1" : ""}
        `;

        const membersRes = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query(queryMembers);

        const members = membersRes.recordset;

        reply.header("Content-Type", "application/pdf");
        reply.header("Content-Disposition", `attachment; filename="Relatorio_Escala_OS_${idOrdemServico}.pdf"`);

        const { generateScalePdf } = await import("../../utils/pdfGenerator");
        const stream = reply.raw;
        generateScalePdf({
          numero_os: os.numero_os,
          data_evento: os.data_evento,
          cliente_nome: os.cliente_nome,
          loja_nome: os.loja_nome,
          coordenador_nome: os.coordenador_nome,
          members
        }, stream);

        await reply;
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao gerar PDF do relatório" };
      }
    }
  );

  // 11. Link público de acompanhamento em tempo real para clientes
  app.get(
    "/public/escalas/:id/acompanhamento",
    async (req, reply) => {
      try {
        const params = req.params as { id: string };
        const idOrdemServico = Number(params.id);
        
        const pool = await getPool();
        
        const osRes = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query(`
            SELECT 
              v.numero_os,
              v.data_evento,
              v.cliente_nome,
              v.loja_nome,
              v.coordenador_nome
            FROM dbo.VIEW_ESCALA_SITUACAO_ESCALAS v
            WHERE v.numero_os = @id_ordemservico
          `);
        
        const os = osRes.recordset[0];
        if (!os) {
          reply.code(404);
          reply.type("text/html");
          return `<h3>Escala não encontrada ou inativa</h3>`;
        }

        const membersRes = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query(`
            SELECT 
              f.funcionario_nome AS nome,
              f.periodo
            FROM dbo.VIEW_ESCALA_PESSOAS_ESCALADAS f
            INNER JOIN dbo.ESCALA_ordemservico_funcionarios ef 
              ON ef.id_ordemservico = f.id_ordemservico AND ef.id_funcionario = f.id_funcionario
            WHERE f.id_ordemservico = @id_ordemservico
              AND ef.func_confirmou = 1
          `);

        const members = membersRes.recordset ?? [];
        const dateStr = new Date(os.data_evento).toLocaleDateString("pt-BR", { timeZone: "UTC" });

        reply.type("text/html");
        return `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Datasite - Acompanhamento OS-${os.numero_os}</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #f8fafc;
                color: #0f172a;
                margin: 0;
                padding: 20px;
              }
              .card {
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 24px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.04);
                padding: 32px;
              }
              .header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 24px;
              }
              .logo {
                background: #1e3a8a;
                color: #ffffff;
                font-weight: bold;
                padding: 8px 14px;
                border-radius: 12px;
                font-size: 16px;
              }
              .title {
                font-size: 18px;
                font-weight: bold;
                color: #1e3a8a;
              }
              .meta-box {
                background: #f1f5f9;
                border-radius: 16px;
                padding: 16px;
                margin-bottom: 24px;
                font-size: 13px;
              }
              .meta-line {
                margin: 6px 0;
                color: #475569;
              }
              .meta-val {
                font-weight: 600;
                color: #0f172a;
              }
              .badge {
                display: inline-block;
                background: #e0f2fe;
                color: #0369a1;
                font-size: 10px;
                font-weight: bold;
                padding: 4px 8px;
                border-radius: 9999px;
                margin-bottom: 20px;
                text-transform: uppercase;
              }
              .list-title {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 12px;
                color: #334155;
              }
              .member-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #f1f5f9;
                font-size: 14px;
              }
              .member-name {
                font-weight: 500;
              }
              .member-period {
                font-size: 12px;
                color: #64748b;
                background: #f8fafc;
                padding: 2px 8px;
                border-radius: 6px;
                border: 1px solid #e2e8f0;
              }
              .footer {
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
                margin-top: 32px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="logo">DS</div>
                <div>
                  <div class="title">Datasite Live Tracking</div>
                  <div style="font-size: 11px; color: #64748b;">Escala alocada em tempo real</div>
                </div>
              </div>

              <span class="badge">Atualizado Agora</span>

              <div class="meta-box">
                <div class="meta-line">Ordem de Serviço: <span class="meta-val">OS-${os.numero_os}</span></div>
                <div class="meta-line">Cliente: <span class="meta-val">${os.cliente_nome}</span></div>
                <div class="meta-line">Loja: <span class="meta-val">${os.loja_nome}</span></div>
                <div class="meta-line">Data do Inventário: <span class="meta-val">${dateStr}</span></div>
                <div class="meta-line">Coordenador: <span class="meta-val">${os.coordenador_nome || "Não definido"}</span></div>
              </div>

              <div class="list-title">Membros Confirmados (${members.length})</div>
              
              ${members.length === 0 ? `
                <div style="text-align: center; color: #94a3b8; font-size: 13px; padding: 20px 0;">
                  Aguardando confirmações de presença...
                </div>
              ` : members.map(m => `
                <div class="member-row">
                  <div class="member-name">${m.nome || "Não informado"}</div>
                  <div class="member-period">${m.periodo || "Integral"}</div>
                </div>
              `).join("")}

              <div class="footer">
                © ${new Date().getFullYear()} Datasite Serviços de Inventário. Link de segurança pública temporário.
              </div>
            </div>
          </body>
          </html>
        `;
      } catch (err) {
        console.error(err);
        reply.code(500);
        return `<h3>Erro interno ao carregar acompanhamento</h3>`;
      }
    }
  );

  // 12. Listar pontos de encontro por filial
  app.get(
    "/api/pontos-encontro",
    async (req, reply) => {
      try {
        const { id_filial } = req.query as { id_filial: string };
        if (!id_filial) {
          reply.code(400);
          return { error: "ID Filial é obrigatório" };
        }

        const pool = await getPool();
        const result = await pool.request()
          .input("id_filial", sql.Int, Number(id_filial))
          .query(`
            SELECT 
              CAST(id AS NVARCHAR(36)) AS id,
              id_filial,
              nome,
              latitude,
              longitude,
              raio_tolerancia_metros
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

  // 13. Criar ponto de encontro
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

        if (!id_filial || !nome || latitude === undefined || longitude === undefined) {
          reply.code(400);
          return { error: "Parâmetros inválidos. id_filial, nome, latitude e longitude são obrigatórios." };
        }

        const pool = await getPool();
        const id = randomUUID();
        const raio = raio_tolerancia_metros ?? 100;

        await pool.request()
          .input("id", sql.UniqueIdentifier, id)
          .input("id_filial", sql.Int, id_filial)
          .input("nome", sql.NVarChar(150), nome.trim())
          .input("latitude", sql.Decimal(9, 6), latitude)
          .input("longitude", sql.Decimal(9, 6), longitude)
          .input("raio", sql.Int, raio)
          .query(`
            INSERT INTO dbo.ESCALA_pontos_encontro (id, id_filial, nome, latitude, longitude, raio_tolerancia_metros)
            VALUES (@id, @id_filial, @nome, @latitude, @longitude, @raio)
          `);

        return { success: true, id };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao cadastrar ponto de encontro" };
      }
    }
  );

  // 14. Configurar ponto de encontro de uma escala
  app.post(
    "/api/escalas/:id/ponto-encontro",
    async (req, reply) => {
      try {
        const params = req.params as { id: string };
        const idOrdemServico = Number(params.id);
        const { usar_ponto_encontro, id_ponto_encontro } = req.body as {
          usar_ponto_encontro: boolean;
          id_ponto_encontro: string | null;
        };

        const pool = await getPool();
        
        // Garante que a OS está inicializada em ESCALA_ordemservico
        const osCheck = await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .query("SELECT 1 FROM dbo.ESCALA_ordemservico WHERE id_ordemservico = @id_ordemservico");

        if (osCheck.recordset.length === 0) {
          // Se não existir na escala (legacy OS ainda não alterada), faz insert inicial importando da legacy t2_ordemservico
          await pool.request()
            .input("id_ordemservico", sql.Int, idOrdemServico)
            .query(`
              INSERT INTO dbo.ESCALA_ordemservico (id_ordemservico, id_filial, verificar_OS, OS_nova, raio_tolerancia_metros)
              SELECT id_ordemservico, id_filial, 1, 1, 100
              FROM dbo.t2_ordemservico
              WHERE id_ordemservico = @id_ordemservico
            `);
        }

        const queryPonto = id_ponto_encontro ? id_ponto_encontro : null;

        await pool.request()
          .input("id_ordemservico", sql.Int, idOrdemServico)
          .input("usar_ponto", sql.Bit, usar_ponto_encontro ? 1 : 0)
          .input("id_ponto", sql.UniqueIdentifier, queryPonto)
          .query(`
            UPDATE dbo.ESCALA_ordemservico
            SET usar_ponto_encontro = @usar_ponto, id_ponto_encontro = @id_ponto
            WHERE id_ordemservico = @id_ordemservico
          `);

        return { success: true };
      } catch (err) {
        console.error(err);
        reply.code(500);
        return { error: "Erro ao salvar parâmetros de ponto de encontro da escala" };
      }
    }
  );
}
