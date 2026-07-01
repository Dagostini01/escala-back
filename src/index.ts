import Fastify from "fastify";
import dotenv from "dotenv";
import { Server } from "socket.io";
import registerImport from "./routes/import";
import registerHealth from "./routes/health";
import registerValidation from "./routes/validation";
import registerLimparCarga from "./routes/limpar-carga";
import registerAuth from "./routes/auth";
import registerEquipes from "./routes/equipes";
import registerEquipePessoas from "./routes/equipe-pessoas";
import registerCatalogo from "./routes/catalogo";
import registerConsultarEscala from "./routes/consultar-escala";
import registerRanking from "./routes/ranking";
import registerPenalidades from "./routes/penalidades";
import registerSorteio from "./routes/sorteio";
import registerEscalaLocal from "./routes/escala";
import registerFuncionarios from "./routes/funcionarios";
import { registerCors } from "./server/plugins/cors";





import { registerContentParsers } from "./server/plugins/contentParsers";
import { registerOpenApi, registerOpenApiUi } from "./server/plugins/swagger";
import { startSyncOsJob } from "./jobs/syncOsJob";
import { startJanela24hJob } from "./jobs/verificarJanela24h";



dotenv.config();

async function main() {
  const app = Fastify();

  await registerCors(app);
  await registerOpenApi(app);
  registerContentParsers(app);
  registerImport(app);
  registerHealth(app);
  registerValidation(app);
  registerLimparCarga(app);
  registerAuth(app);
  registerEquipes(app);
  registerEquipePessoas(app);
  registerCatalogo(app);
  registerConsultarEscala(app);
  registerRanking(app);
  registerPenalidades(app);
  registerSorteio(app);
  registerEscalaLocal(app);
  registerFuncionarios(app);
  await registerOpenApiUi(app);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log("Server listening on", app.server.address());
    console.log("OpenAPI UI:", `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/documentation`);
    
    // Configura o Socket.io Server para Chat em Tempo Real
    const io = new Server(app.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    io.on("connection", (socket) => {
      console.log("Chat client connected:", socket.id);
      
      socket.on("join_room", (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room: ${room}`);
      });

      socket.on("send_message", (data) => {
        // Envia a mensagem para a sala (sala = id_funcionario)
        io.to(data.room).emit("receive_message", data);
      });

      socket.on("disconnect", () => {
        console.log("Chat client disconnected:", socket.id);
      });
    });

    // Inicia o job de batimento de OS (sincronização automática a cada 5 minutos)
    startSyncOsJob();
    // Inicia o job de checagem da janela de 24h críticas (a cada 5 minutos)
    startJanela24hJob();
  } catch (err) {
    console.error("Falha ao iniciar servidor:", err);
    process.exit(1);
  }
}

main();
