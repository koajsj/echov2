import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { normalizeUsername } from "../src/shared/validation.js";
import { passwordHash } from "../src/server/accounts/passwords.js";
import { transaction } from "../src/server/storage/database.js";

// Offline operator action only. Never imported by the server or executed at startup.
try {
  const username=process.env.ADMIN_USERNAME;
  const passwordFile=process.env.ADMIN_PASSWORD_FILE;
  const connection=process.env.ADMIN_DATABASE_URL;
  if(!username || !passwordFile || !connection)throw new Error("Missing protected provisioning inputs");
  normalizeUsername(username);
  const url=new URL(connection);
  if(url.protocol!=="postgresql:" || !["127.0.0.1","localhost","[::1]"].includes(url.hostname) || url.username!=="echo_native_owner" || url.pathname!=="/echo_native" || url.search || url.hash)throw new Error("Invalid provisioning database role");
  const file=await open(passwordFile,constants.O_RDONLY|constants.O_NOFOLLOW);
  let password: string;
  try {
    const stat=await file.stat();
    if(!stat.isFile() || (stat.mode & 0o077)!==0 || stat.uid!==process.getuid?.() || stat.size>1024)throw new Error("Password file must be private and owned by the operator");
    password=(await file.readFile("utf8")).replace(/\r?\n$/,"" );
  } finally { await file.close(); }
  if(password.length<12 || password.length>256)throw new Error("Invalid password length");
  const encoded=await passwordHash(password);
  const pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:5000});
  try {
    await transaction(pool,async db=>{
      const row=await db.query<{superadmin_user_id:string|null}>("SELECT superadmin_user_id FROM echo.site_settings WHERE singleton FOR UPDATE");
      if(!row.rows[0] || row.rows[0].superadmin_user_id)throw new Error("Admin already bound or schema missing");
      const id=randomUUID();
      await db.query("INSERT INTO echo.users(id,username,password_hash) VALUES($1,$2,$3)",[id,username,encoded]);
      await db.query("UPDATE echo.site_settings SET superadmin_user_id=$1,version=version+1 WHERE singleton AND superadmin_user_id IS NULL",[id]);
      await db.query("INSERT INTO echo.admin_audit_logs(actor_user_id,action,target_id) VALUES($1,'admin-bind',$1)",[id]);
    });
    process.stdout.write("Superadministrator created and bound. No MLS identity was created.\n");
  } finally {await pool.end();}
} catch {
  process.stderr.write("Provisioning failed or result unknown. Inspect authoritative state before retrying; protected inputs were not logged.\n");process.exitCode=1;
}
