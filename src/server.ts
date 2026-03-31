import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./lib/db/client.js";
import { registerRoutes } from "./routes/index.js";
import { startAgentWorker } from "./workers/agent-worker.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const message = (error as { message?: string }).message ?? "Internal Server Error";
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal Server Error" : message,
      statusCode,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: "Not Found", statusCode: 404 });
  });

  registerRoutes(app);

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\nFindX API server → http://${HOST}:${PORT}`);

    // Start agent pipeline worker
    startAgentWorker();
    console.log("Agent pipeline worker started");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
