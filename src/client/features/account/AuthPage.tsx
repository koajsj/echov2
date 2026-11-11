import { useRef,useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import type { Audience } from "../../../shared/contracts";
import { api } from "../../app/api";
export function AuthPage({ audience,onAuthenticated }: { audience: Audience; onAuthenticated: () => void }) {
  const [register,setRegister]=useState(false); const [pending,setPending]=useState(false); const [message,setMessage]=useState("");
  const registrationId=useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form=event.currentTarget; const data=new FormData(form);
    const username=String(data.get("username")); const password=String(data.get("password"));
    setPending(true); setMessage("");
    try {
      if (register) {
        const invitation=String(data.get("invitation") ?? "");
        await api("/v1/accounts",{ method: "POST",body: { operationId: registrationId.current,username,password,...(invitation ? { invitation } : {}) } });
        setMessage("注册已完成，请登录。登录不会自动建立设备信任。");setRegister(false);registrationId.current=crypto.randomUUID();
      } else {
        await api("/v1/sessions",{ method: "POST",audience,body: { username,password,audience } });
        onAuthenticated();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成，请核实后重试。"); }
    finally { form.reset();setPending(false); }
  }
  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">ECHO NATIVE · 第一阶段</p>
        <h1>让交流，回到彼此。</h1>
        <p>独立通信架构。客户端密钥。清晰的信任边界。</p>
        <p className="muted">MLS 尚未集成。本轮建设账号与服务基础，不提供未经验证的加密聊天。</p>
      </div>
      <div className="panel auth-form">
        <h2>{audience==="admin" ? "管理员登录" : register ? "创建账号" : "欢迎回来"}</h2>
        <form onSubmit={event=>{void submit(event);}}>
          <label>用户名
            <input name="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" autoComplete="username" />
          </label>
          <label>密码
            <input name="password" type="password" required minLength={12} maxLength={256} autoComplete={register ? "new-password" : "current-password"} />
          </label>
          {register && <label>邀请码（按注册模式）<input name="invitation" autoComplete="off" maxLength={128} /></label>}
          <Button type="submit" isPending={pending}>{register ? "注册" : "登录"}</Button>
        </form>
        {audience==="user" && (
          <Button variant="ghost" isDisabled={pending} onPress={()=>{setRegister(!register);setMessage("");}}>
            {register ? "已有账号，返回登录" : "创建新账号"}
          </Button>
        )}
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
