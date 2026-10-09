import { existsSync } from "node:fs";
import { buildServer } from "./app.ts";
import { loadConfig } from "./config.ts";

const envFile = new URL("../../.env", import.meta.url).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const { server } = await buildServer(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.log.info({ signal }, "shutting down");
    server.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await server.listen({ port: config.port, host: config.host });
