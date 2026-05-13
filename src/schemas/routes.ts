import type { FastifySchema } from "fastify";

const erroSimples = {
  type: "object",
  properties: { error: { type: "string" } },
  required: ["error"]
} as const;

const falhaInterna = {
  type: "object",
  properties: {
    message: { type: "string" },
    details: {
      type: "object",
      properties: { correlation_id: { type: "string", format: "uuid" } },
      required: ["correlation_id"]
    }
  },
  required: ["message", "details"]
} as const;

export const healthGetSchema: FastifySchema = {
  tags: ["health"],
  summary: "Liveness",
  description: "Indica que o processo HTTP está no ar.",
  response: {
    200: {
      type: "object",
      properties: { status: { type: "string", enum: ["ok"] } },
      required: ["status"]
    }
  }
};

export const healthDbGetSchema: FastifySchema = {
  tags: ["health"],
  summary: "Conexão com banco e tabelas de autenticação",
  description: "Executa `SELECT 1` e verifica se `ESCALA_api_usuario` e `ESCALA_api_sessao` existem em `dbo`.",
  response: {
    200: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok"] },
        database: { type: "string", enum: ["connected"] },
        auth_tables: { type: "string", enum: ["ok"] }
      },
      required: ["status", "database", "auth_tables"]
    },
    503: {
      description: "Banco indisponível ou tabelas de auth ausentes",
      type: "object",
      properties: {
        status: { type: "string", enum: ["error", "degraded"] },
        database: { type: "string", enum: ["unavailable", "connected"] },
        auth_tables: { type: "string", enum: ["missing"] },
        hint: { type: "string" }
      }
    }
  }
};

export const authRegisterSchema: FastifySchema = {
  tags: ["auth"],
  summary: "Cadastro",
  description: "Cria usuário com e-mail e senha em texto (mesmas regras do servidor para confirmação).",
  body: {
    type: "object",
    required: ["email", "senha", "confirmar_senha"],
    properties: {
      email: { type: "string", minLength: 1, description: "Será normalizado em minúsculas no servidor." },
      senha: { type: "string", minLength: 1 },
      confirmar_senha: { type: "string", minLength: 1 }
    }
  },
  response: {
    201: {
      type: "object",
      properties: {
        usuario: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string" }
          },
          required: ["id", "email"]
        }
      },
      required: ["usuario"]
    },
    400: { description: "Validação", ...erroSimples },
    409: { description: "E-mail duplicado", ...erroSimples },
    500: { description: "Erro interno", ...falhaInterna }
  }
};

export const authLoginSchema: FastifySchema = {
  tags: ["auth"],
  summary: "Login",
  description: "Retorna `access_token` opaco (Bearer) e data de expiração da sessão.",
  body: {
    type: "object",
    required: ["email", "senha"],
    properties: {
      email: { type: "string", minLength: 1 },
      senha: { type: "string", minLength: 1 }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        access_token: { type: "string", description: "Token hexadecimal (64 caracteres)" },
        token_type: { type: "string", enum: ["Bearer"] },
        expira_em: { type: "string", format: "date-time" },
        usuario: {
          type: "object",
          properties: { email: { type: "string" } },
          required: ["email"]
        }
      },
      required: ["access_token", "token_type", "expira_em", "usuario"]
    },
    401: { description: "Credenciais inválidas", ...erroSimples },
    500: { description: "Erro interno", ...falhaInterna }
  }
};

export const authLogoutSchema: FastifySchema = {
  tags: ["auth"],
  summary: "Logout",
  description:
    "Invalida a sessão do token atual. Recomenda-se `Content-Type: application/json` e corpo `{}` (sem isso, alguns clientes recebem 415).",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: { ok: { type: "boolean", enum: [true] } },
      required: ["ok"]
    },
    400: { ...erroSimples },
    401: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const authMeSchema: FastifySchema = {
  tags: ["auth"],
  summary: "Usuário da sessão",
  description: "Valida o Bearer token e devolve o e-mail associado.",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: {
        usuario: {
          type: "object",
          properties: { email: { type: "string" } },
          required: ["email"]
        }
      },
      required: ["usuario"]
    },
    401: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const importPostSchema: FastifySchema = {
  tags: ["import"],
  summary: "Importar planilha XLSX",
  description:
    "Corpo da requisição = arquivo binário (.xlsx). Use `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` ou `application/octet-stream`. Cabeçalho esperado: id_ordemservico, id_funcionario, cpf_funcionario.",
  consumes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
  response: {
    200: {
      type: "object",
      properties: {
        inserted: { type: "integer", minimum: 0 },
        invalid: { type: "integer", minimum: 0 }
      },
      required: ["inserted", "invalid"]
    },
    400: { ...erroSimples },
    415: {
      type: "object",
      properties: {
        message: { type: "string" },
        details: { type: "object", additionalProperties: true }
      }
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
        detail: { type: "string" }
      }
    }
  }
};

const linhaValidadaFix = {
  type: "object",
  properties: {
    id_importacao: { type: "string" },
    id_ordemservico: { type: "number" },
    id_funcionario: { type: "number" },
    cpf_funcionario: { type: "string" },
    avaliado: { type: "boolean" },
    escalado: { type: "boolean" },
    forabase: { type: "boolean" },
    disponibilidade: { type: "boolean" },
    observacao: { type: "string" }
  },
  required: [
    "id_importacao",
    "id_ordemservico",
    "id_funcionario",
    "cpf_funcionario",
    "avaliado",
    "escalado",
    "forabase",
    "disponibilidade",
    "observacao"
  ]
};

export const limparCargaPostSchema: FastifySchema = {
  tags: ["validation"],
  summary: "Limpar tabela de carga da escala",
  description:
    "Executa `dbo.sp_ESCALA_LimpaCarga`, que limpa a tabela de dados usada na tela de carregamento de escala. Body opcional `{}`.",
  body: {
    type: "object",
    additionalProperties: true
  },
  response: {
    200: {
      type: "object",
      properties: { ok: { type: "boolean", enum: [true] } },
      required: ["ok"]
    },
    500: { ...falhaInterna }
  }
};

export const validatePostSchema: FastifySchema = {
  tags: ["validation"],
  summary: "Validar escala (paginado no JSON de resposta)",
  description:
    "Body opcional: `page` e `page_size` (padrão 1 e 50). A lista completa é obtida no servidor e fatiada na resposta.",
  body: {
    type: "object",
    properties: {
      page: { type: "number", minimum: 1, default: 1 },
      page_size: { type: "number", minimum: 1, default: 50 }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: { type: "array", items: linhaValidadaFix },
        meta: {
          type: "object",
          properties: {
            count: { type: "integer", minimum: 0 },
            page: { type: "number" },
            page_size: { type: "number" }
          },
          required: ["count", "page", "page_size"]
        }
      },
      required: ["rows", "meta"]
    },
    500: { ...falhaInterna }
  }
};

const equipe = {
  type: "object",
  properties: {
    equipe_id: { type: "string", format: "uuid" },
    coordenador_id: { type: "integer" },
    coordenador_nome: { type: "string" },
    equipe_qtde_inventariantes: { type: "integer", minimum: 0 }
  },
  required: ["equipe_id", "coordenador_id", "coordenador_nome", "equipe_qtde_inventariantes"]
} as const;

const equipeBody = {
  type: "object",
  required: ["coordenador_id", "coordenador_nome", "equipe_qtde_inventariantes"],
  properties: {
    coordenador_id: { type: "integer", minimum: 1 },
    coordenador_nome: { type: "string", minLength: 1, maxLength: 500 },
    equipe_qtde_inventariantes: { type: "integer", minimum: 0 }
  }
} as const;

const equipeParams = {
  type: "object",
  required: ["equipe_id"],
  properties: {
    equipe_id: { type: "string", minLength: 1, maxLength: 40 }
  }
} as const;

export const equipeGetSchema: FastifySchema = {
  tags: ["equipes"],
  summary: "Listar equipes",
  response: {
    200: {
      type: "object",
      properties: { rows: { type: "array", items: equipe } },
      required: ["rows"]
    },
    500: { ...falhaInterna }
  }
};

export const equipeGetByIdSchema: FastifySchema = {
  tags: ["equipes"],
  summary: "Buscar equipe",
  params: equipeParams,
  response: {
    200: {
      type: "object",
      properties: { equipe },
      required: ["equipe"]
    },
    400: { ...erroSimples },
    404: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipePostSchema: FastifySchema = {
  tags: ["equipes"],
  summary: "Criar equipe",
  body: equipeBody,
  response: {
    201: {
      type: "object",
      properties: { equipe },
      required: ["equipe"]
    },
    400: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipePutSchema: FastifySchema = {
  tags: ["equipes"],
  summary: "Atualizar equipe",
  params: equipeParams,
  body: equipeBody,
  response: {
    200: {
      type: "object",
      properties: { equipe },
      required: ["equipe"]
    },
    400: { ...erroSimples },
    404: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipeDeleteSchema: FastifySchema = {
  tags: ["equipes"],
  summary: "Remover equipe",
  params: equipeParams,
  response: {
    204: {
      type: "null",
      description: "Equipe removida"
    },
    400: { ...erroSimples },
    404: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

const equipePessoa = {
  type: "object",
  properties: {
    equipe_pessoa_id: {
      type: "integer",
      description: "Gerado automaticamente pela API no POST usando o maior ID existente + 1."
    },
    equipe_id: { type: "string" },
    funcionario_id: { type: "integer" }
  },
  required: ["equipe_pessoa_id", "equipe_id", "funcionario_id"]
} as const;

const equipePessoaBody = {
  type: "object",
  required: ["equipe_id", "funcionario_id"],
  properties: {
    equipe_id: { type: "string", minLength: 1, maxLength: 40 },
    funcionario_id: { type: "integer", minimum: 1 }
  }
} as const;

const equipePessoaParams = {
  type: "object",
  required: ["equipe_pessoa_id"],
  properties: {
    equipe_pessoa_id: { type: "integer", minimum: 1 }
  }
} as const;

export const equipePessoaGetSchema: FastifySchema = {
  tags: ["equipe-pessoas"],
  summary: "Listar pessoas de equipe",
  querystring: {
    type: "object",
    properties: {
      equipe_id: { type: "string", minLength: 1, maxLength: 40 }
    }
  },
  response: {
    200: {
      type: "object",
      properties: { rows: { type: "array", items: equipePessoa } },
      required: ["rows"]
    },
    400: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipePessoaGetByIdSchema: FastifySchema = {
  tags: ["equipe-pessoas"],
  summary: "Buscar pessoa de equipe",
  params: equipePessoaParams,
  response: {
    200: {
      type: "object",
      properties: { pessoa: equipePessoa },
      required: ["pessoa"]
    },
    400: { ...erroSimples },
    404: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipePessoaPostSchema: FastifySchema = {
  tags: ["equipe-pessoas"],
  summary: "Criar pessoa de equipe",
  description:
    "Cria vínculo entre equipe e funcionário. O campo `equipe_pessoa_id` não deve ser enviado; a API calcula automaticamente `MAX(equipe_pessoa_id) + 1` no banco.",
  body: equipePessoaBody,
  response: {
    201: {
      type: "object",
      properties: { pessoa: equipePessoa },
      required: ["pessoa"]
    },
    400: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipePessoaPutSchema: FastifySchema = {
  tags: ["equipe-pessoas"],
  summary: "Atualizar pessoa de equipe",
  params: equipePessoaParams,
  body: equipePessoaBody,
  response: {
    200: {
      type: "object",
      properties: { pessoa: equipePessoa },
      required: ["pessoa"]
    },
    400: { ...erroSimples },
    404: { ...erroSimples },
    500: { ...falhaInterna }
  }
};

export const equipePessoaDeleteSchema: FastifySchema = {
  tags: ["equipe-pessoas"],
  summary: "Remover pessoa de equipe",
  params: equipePessoaParams,
  response: {
    204: {
      type: "null",
      description: "Pessoa removida da equipe"
    },
    400: { ...erroSimples },
    404: { ...erroSimples },
    500: { ...falhaInterna }
  }
};
