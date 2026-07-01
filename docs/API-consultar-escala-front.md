# Front - Consultar Escalas (integracao com API)

Documento para o time de frontend integrar a tela Consultar Escalas com as views disponibilizadas no banco.

## Base URL

Configurar via variavel de ambiente, por exemplo `VITE_API_URL` ou `NEXT_PUBLIC_API_URL`:

```text
http://localhost:3000
```

## Autenticacao

Mesmo padrao das demais rotas do modulo escala:

```http
Authorization: Bearer <access_token>
```

Token obtido em `POST /auth/login`. Estes endpoints seguem o padrao atual das rotas de consulta do backend.

## 1. Lista principal da tela Consultar Escalas

```http
GET /consultar-escala/situacao-escalas
```

Origem dos dados: `dbo.VIEW_ESCALA_SITUACAO_ESCALAS`.

### Resposta 200

```json
{
  "rows": [
    {
      "id_ordemservico": 123,
      "situacao": "Escalada"
    }
  ]
}
```

Os campos dentro de cada item de `rows` sao os campos retornados pela view. O backend nao renomeia as colunas para evitar divergencia com o contrato definido no banco.

### Erros

`500`

```json
{
  "message": "Falha interna",
  "details": {
    "correlation_id": "00000000-0000-0000-0000-000000000000"
  }
}
```

## 2. Pessoas escaladas na OS

```http
GET /consultar-escala/pessoas-escaladas?id_ordemservico={number}
```

Origem dos dados: `dbo.VIEW_ESCALA_PESSOAS_ESCALADAS`, filtrando a coluna `id_ordemservico`.

### Query params

`id_ordemservico` e obrigatorio e deve ser um inteiro positivo.

### Exemplo

```http
GET /consultar-escala/pessoas-escaladas?id_ordemservico=123
```

### Resposta 200

```json
{
  "rows": [
    {
      "id_ordemservico": 123,
      "id_funcionario": 456,
      "nome_funcionario": "Maria Santos"
    }
  ]
}
```

Os campos dentro de cada item de `rows` sao os campos retornados pela view.

### Erros

`400`

```json
{
  "error": "id_ordemservico deve ser um inteiro positivo"
}
```

`500`

```json
{
  "message": "Falha interna",
  "details": {
    "correlation_id": "00000000-0000-0000-0000-000000000000"
  }
}
```

## Tipos sugeridos no front

```ts
export type ConsultarEscalaViewRow = Record<string, unknown>;

export type ConsultarEscalaResponse = {
  rows: ConsultarEscalaViewRow[];
};
```

## Servico sugerido no front

```ts
import { api } from "./api";
import type { ConsultarEscalaResponse } from "../types/consultarEscala";

export async function listarSituacaoEscalas(): Promise<ConsultarEscalaResponse> {
  const { data } = await api.get<ConsultarEscalaResponse>("/consultar-escala/situacao-escalas");
  return data;
}

export async function listarPessoasEscaladas(idOrdemServico: number): Promise<ConsultarEscalaResponse> {
  const { data } = await api.get<ConsultarEscalaResponse>("/consultar-escala/pessoas-escaladas", {
    params: { id_ordemservico: idOrdemServico }
  });
  return data;
}
```

## Documentacao OpenAPI

Com o backend rodando:

```text
http://localhost:3000/documentation
```

Tag: `consultar-escala`.
