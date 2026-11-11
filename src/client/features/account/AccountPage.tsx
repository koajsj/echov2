import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import type { SessionView } from "../../../shared/contracts";
import { api } from "../../app/api";
export function AccountPage({ session,onChanged }: { session: SessionView; onChanged: () => void }) {
  const [message,setMessage]=useState(""); const [pending,setPending]=useState(false);
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending)return;const form=event.currentTarget;const data=new FormData(form);setPending(true);setMessage("");
    try {
      await api("/v1/sessions/reauthenticate",{method:"POST",sessionId:session.sessionId,body:{password:String(data.get("password")),audience:"user"}});
      await api("/v1/account/username",{method:"PATCH",sessionId:session.sessionId,body:{username:String(data.get("username")),version:session.account.version}});
      setMessage("用户名已更新，永久身份不变。");onChanged();
    } catch(error){setMessage(error instanceof Error?error.message:"修改未完成。");}
    finally{form.reset();setPending(false);}
  }
  return (
    <section>
      <header className="page-heading"><h1>账户</h1><p>用户名可以修改，身份不随名字改变。</p></header>
      <dl className="details">
        <dt>永久 User ID</dt><dd>{session.account.id}</dd>
        <dt>用户名</dt><dd>{session.account.username}</dd>
        <dt>设备绑定</dt><dd>{session.deviceId ?? "未登记"}</dd>
      </dl>
      <form className="panel form" onSubmit={event=>{void rename(event);}}>
        <h2>修改用户名</h2>
        <label>新用户名<input name="username" required pattern="[a-zA-Z0-9_]{3,32}" maxLength={32} defaultValue={session.account.username}/></label>
        <label>重新输入密码<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="current-password"/></label>
        <Button type="submit" isPending={pending}>确认修改</Button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
