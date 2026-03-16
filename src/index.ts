import Fastify from "fastify";
import dotenv from "dotenv";
import registerImport from "./routes/import";
import registerHealth from "./routes/health";
import registerValidation from "./routes/validation";
import { registerContentParsers } from "./server/plugins/contentParsers";

dotenv.config();

const app = Fastify();

registerContentParsers(app);
registerImport(app);
registerHealth(app);
registerValidation(app);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .then((address) => {
    console.log("Server listening on", address);
  })
  .catch((err) => {
    console.error("Falha ao iniciar servidor:", err);
    process.exit(1);
  });
