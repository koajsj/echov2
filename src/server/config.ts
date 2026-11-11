export interface ServerConfig {
  origin: string;
  host: string;
  port: number;
  databaseUrl: string;
  mediaPath: string;
  logLevel: "info" | "warn" | "error";
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origin = new URL(required(env, "PUBLIC_ORIGIN"));
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin");
  const db = new URL(required(env, "DATABASE_URL"));
  if (
    db.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) ||
    db.username !== "echo_native_api" ||
    db.pathname !== "/echo_native" ||
    db.search ||
    db.hash
  )
    throw new Error(
      "Use a local echo_native database with echo_native_api and no URL options",
    );
  const host = env.HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1")
    throw new Error("The bundled Caddy target requires HOST=127.0.0.1");
  const port = Number(env.PORT ?? "3001");
  if (port !== 3001)
    throw new Error("The bundled Caddy target requires PORT=3001");
  const mediaPath = required(env, "MEDIA_PATH");
  if (
    !mediaPath.startsWith("/") ||
    mediaPath === "/" ||
    mediaPath.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error(
      "MEDIA_PATH requires an absolute path without dot segments; ownership and symlinks must be checked before media is enabled",
    );
  const logLevel = env.LOG_LEVEL ?? "info";
  if (logLevel !== "info" && logLevel !== "warn" && logLevel !== "error")
    throw new Error("Invalid LOG_LEVEL");
  return {
    origin: origin.origin,
    host,
    port,
    databaseUrl: db.toString(),
    mediaPath,
    logLevel,
  };
}
function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
