import Fastify from "fastify";
import dotenv from "dotenv";
import registerImport from "./routes/import";
import registerHealth from "./routes/health";
import registerValidation from "./routes/validation";
import registerAuth from "./routes/auth";
import { registerContentParsers } from "./server/plugins/contentParsers";
import { registerOpenApi, registerOpenApiUi } from "./server/plugins/swagger";

dotenv.config();

async function main() {
  const app = Fastify();

  await registerOpenApi(app);
  registerContentParsers(app);
  registerImport(app);
  registerHealth(app);
  registerValidation(app);
  registerAuth(app);
  await registerOpenApiUi(app);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log("Server listening on", app.server.address());
    console.log("OpenAPI UI:", `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/documentation`);
  } catch (err) {
    console.error("Falha ao iniciar servidor:", err);
    process.exit(1);
  }
}

main();
