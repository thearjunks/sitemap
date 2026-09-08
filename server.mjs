import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "production";
const { startProdServer } = await import("vinext/server/prod-server");
await startProdServer({
  port: Number(process.env.PORT || 3000),
  host: "0.0.0.0",
  outDir: fileURLToPath(new URL("./dist", import.meta.url)),
});
