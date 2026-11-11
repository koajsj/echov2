import { Pool } from "pg";
import type { PoolClient } from "pg";

export function createDatabase(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 15000,
    application_name: "echo-native",
  });
}
export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let inTransaction = false;
  let released = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const result = await work(client);
    await client.query("COMMIT");
    inTransaction = false;
    return result;
  } catch (error) {
    // Destroy a broken connection rather than returning an unknown transaction to the pool.
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        client.release(true);
        released = true;
        throw error;
      }
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}
