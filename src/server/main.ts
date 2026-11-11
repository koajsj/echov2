import { createApp } from "./app.js";
import { readConfig } from "./config.js";

try {
  const config=readConfig();
  const app=await createApp(config);
  for (const signal of ["SIGINT","SIGTERM"] as const) process.once(signal,() => {
    void app.close().catch(() => { process.exitCode=1; });
  });
  await app.listen({ host: config.host,port: config.port });
} catch {
  // URL/driver errors may carry credentials; never print the original exception.
  process.stderr.write("Echo Native could not start. Check protected configuration, dependencies and schema.\n");
  process.exitCode=1;
}
