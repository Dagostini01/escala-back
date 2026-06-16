# Front — Cadastro de Equipe (integração com API)

Documento para o time de **frontend** integrar a tela **Cadastro de equipe** (`/cadastro-equipe`) com os endpoints já disponíveis no backend.

---

## Contexto

A tela usa **dropdowns** filtrados pela **base operacional (filial)** selecionada, em vez de IDs/nomes digitados manualmente.

| Área da tela | Componente | Endpoint |
|--------------|------------|----------|
| Topo | Base operacional | `GET /bases-operacionais` |
| Nova equipe / Editar equipe | Coordenador | `GET /funcionarios-por-cargo?id_filial={id}&id_cargo=1` |
| Pessoas na equipe | Inventariante | `GET /funcionarios-por-cargo?id_filial={id}&id_cargo=13` |

**Fluxo:**

1. Carregar bases → usuário seleciona uma → guardar `id_filial`.
2. Com `id_filial`, carregar coordenadores (`id_cargo = 1`) e inventariantes (`id_cargo = 13`).
3. Criar equipe → `POST /equipes` (contrato atual).
4. Vincular pessoa → `POST /equipe-pessoas` (contrato atual).

---

## Base URL

Configurar via variável de ambiente (ex.: `VITE_API_URL` / `NEXT_PUBLIC_API_URL`):

```
http://localhost:3000   # desenvolvimento
```

---

## Autenticação

Mesmo padrão das demais rotas do módulo escala (se o front já envia token nas chamadas de `/equipes`):

```http
Authorization: Bearer <access_token>
```

Token obtido em `POST /auth/login`. Hoje `/equipes` e os novos endpoints de catálogo **não exigem** token no backend; manter o header se já estiver padronizado no `apiClient`.

---

## 1. Listar bases operacionais

```http
GET /bases-operacionais
```

### Resposta (200)

```json
{
  "rows": [
    { "id_filial": 1, "nome": "São Paulo - Matriz" },
    { "id_filial": 2, "nome": "Rio de Janeiro" }
  ]
}
```

| Campo | Tipo | Uso no front |
|-------|------|--------------|
| `id_filial` | `number` | `value` do select de base |
| `nome` | `string` | `label` do select |

### Erros

| Status | Body |
|--------|------|
| `500` | `{ "message": "Falha interna", "details": { "correlation_id": "..." } }` |

---

## 2. Buscar funcionários por cargo e filial

```http
GET /funcionarios-por-cargo?id_filial={number}&id_cargo={number}
```

### Query params

| Parâmetro | Obrigatório | Valores |
|-----------|-------------|---------|
| `id_filial` | Sim | `id_filial` da base selecionada |
| `id_cargo` | Sim | `1` = coordenador · `13` = inventariante |

### Exemplos

```http
GET /funcionarios-por-cargo?id_filial=1&id_cargo=1
GET /funcionarios-por-cargo?id_filial=1&id_cargo=13
```

### Resposta (200)

```json
{
  "rows": [
    { "id_funcionario": 29, "nome": "Paulo José Silva" },
    { "id_funcionario": 45, "nome": "Maria Santos" }
  ]
}
```

| Campo | Tipo | Uso no front |
|-------|------|--------------|
| `id_funcionario` | `number` | `coordenador_id` no POST `/equipes` · `funcionario_id` no POST `/equipe-pessoas` |
| `nome` | `string` | label do dropdown; para coordenador, também `coordenador_nome` no POST `/equipes` |

### Erros

| Status | Body |
|--------|------|
| `400` | `{ "error": "id_filial deve ser um inteiro positivo" }` ou mensagem equivalente para `id_cargo` |
| `500` | `{ "message": "Falha interna", "details": { "correlation_id": "..." } }` |

---

## Contratos existentes (sem alteração)

### Equipes

| Método | Rota | Body (criar/atualizar) |
|--------|------|------------------------|
| `GET` | `/equipes` | — |
| `GET` | `/equipes/:equipeId` | — |
| `POST` | `/equipes` | `{ "coordenador_id": number, "coordenador_nome": string, "equipe_qtde_inventariantes": number }` |
| `PUT` | `/equipes/:equipeId` | mesmo body do POST |
| `DELETE` | `/equipes/:equipeId` | — |

### Pessoas na equipe

| Método | Rota | Body (criar) |
|--------|------|--------------|
| `GET` | `/equipe-pessoas?equipe_id={uuid}` | — |
| `POST` | `/equipe-pessoas` | `{ "equipe_id": string, "funcionario_id": number }` |
| `PUT` | `/equipe-pessoas/:equipePessoaId` | mesmo body do POST |
| `DELETE` | `/equipe-pessoas/:equipePessoaId` | — |

---

## Tipos sugeridos (`src/types/catalogo.ts`)

```ts
export const CARGO_COORDENADOR = 1;
export const CARGO_INVENTARIANTE = 13;

export type BaseOperacional = {
  id_filial: number;
  nome: string;
};

export type FuncionarioPorCargo = {
  id_funcionario: number;
  nome: string;
};

export type BasesOperacionaisResponse = {
  rows: BaseOperacional[];
};

export type FuncionariosPorCargoResponse = {
  rows: FuncionarioPorCargo[];
};
```

---

## Serviço sugerido (`src/services/catalogoService.ts`)

```ts
import { api } from "./api"; // seu client HTTP
import type {
  BasesOperacionaisResponse,
  FuncionariosPorCargoResponse
} from "../types/catalogo";

export async function listarBasesOperacionais(): Promise<BasesOperacionaisResponse> {
  const { data } = await api.get<BasesOperacionaisResponse>("/bases-operacionais");
  return data;
}

export async function listarFuncionariosPorCargo(
  idFilial: number,
  idCargo: number
): Promise<FuncionariosPorCargoResponse> {
  const { data } = await api.get<FuncionariosPorCargoResponse>("/funcionarios-por-cargo", {
    params: { id_filial: idFilial, id_cargo: idCargo }
  });
  return data;
}
```

> O backend já normaliza colunas da SP (`ID_FILIAL`, `NOME_FILIAL`, etc.) para `id_filial` / `nome`. **Não é necessário** mapear variações de nome no front, salvo fallback defensivo.

---

## Comportamento da UI (`/cadastro-equipe`)

1. **Mount:** `GET /bases-operacionais` → popular select de base.
2. **Ao selecionar base:** disparar em paralelo:
   - `GET /funcionarios-por-cargo?id_filial=X&id_cargo=1`
   - `GET /funcionarios-por-cargo?id_filial=X&id_cargo=13`
3. **Coordenador selecionado:** preencher `coordenador_id` e `coordenador_nome` no formulário de equipe.
4. **Inventariante selecionado:** usar `id_funcionario` no `POST /equipe-pessoas`.
5. **Trocar base:** limpar seleções de coordenador/inventariante e recarregar listas.
6. **Estados:** loading por dropdown, lista vazia amigável, toast/alert em 400/500.

---

## Documentação OpenAPI

Com o backend rodando:

```
http://localhost:3000/documentation
```

Tag: **catalogo** (`GET /bases-operacionais`, `GET /funcionarios-por-cargo`).

---

## Checklist de entrega (front)

- [ ] `catalogoService` com as duas chamadas GET
- [ ] Tipos e constantes `CARGO_COORDENADOR` / `CARGO_INVENTARIANTE`
- [ ] Select de base operacional no topo da tela
- [ ] Dropdowns de coordenador e inventariante dependentes de `id_filial`
- [ ] `POST /equipes` e `POST /equipe-pessoas` usando IDs/nomes dos dropdowns
- [ ] Tratamento de erro ao carregar listas (tela não quebra em silêncio)
- [ ] Teste manual com base real após firewall Azure liberado para dev

---

## Observações

- `id_filial` hoje é **filtro na UI**; não é persistido em `ESCALA_equipe` (evolução futura se produto exigir).
- Se alguma base/funcionário não aparecer, pedir ao backend conferir colunas retornadas pela SP (linhas sem mapeamento são omitidas).
- Em dev local, erro 500 nas listas costuma ser **firewall do Azure SQL** — validar `GET /health/db` antes de debugar o front.
