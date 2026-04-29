import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

function defaultServerUrl(): string {
  const publicUrl = process.env.PUBLIC_API_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}`;
}

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "escala-back",
        description:
          "API de importação de escala (XLSX), validação, autenticação por e-mail/senha com sessão Bearer e gestão de equipes.",
        version: "0.1.0"
      },
      servers: [{ url: defaultServerUrl(), description: "Servidor" }],
      tags: [
        { name: "health", description: "Saúde e diagnóstico" },
        { name: "auth", description: "Cadastro, login e sessão" },
        { name: "import", description: "Importação de planilhas" },
        { name: "validation", description: "Validação de escala" },
        { name: "equipes", description: "CRUD de equipes" },
        { name: "equipe-pessoas", description: "CRUD de pessoas vinculadas às equipes" }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "opaque",
            description: "Token retornado por `POST /auth/login` (valor opaco, não JWT)."
          }
        }
      }
    }
  });
}

export async function registerOpenApiUi(app: FastifyInstance): Promise<void> {
  await app.register(swaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    },
    staticCSP: true
  });
}
