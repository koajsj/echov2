import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import { api } from "../../app/api";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import { ReauthenticationForm } from "../../components/ReauthenticationForm";
interface Overview { counts: Record<string,string>; registration: { registration_mode:string;version:string };trafficBytes:null;regions:null }
interface User {id:string;username:string;status:string}
export function AdminPage({sessionId}:{sessionId:string}){
  const [revision,setRevision]=useState(0);const [after,setAfter]=useState("");
  const overview=useApiQuery<Overview>("/v1/admin/overview",revision,sessionId);
  const users=useApiQuery<{items:User[];next:string|null}>(`/v1/admin/users${after?`?after=${encodeURIComponent(after)}`:""}`,revision,sessionId);
  const [pending,setPending]=useState(false);const [message,setMessage]=useState("");
  async function settings(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending || !overview.data)return;const form=event.currentTarget;const data=new FormData(form);setPending(true);setMessage("");
    try{
      await api("/v1/admin/registration",{method:"PATCH",audience:"admin",sessionId,body:{mode:String(data.get("mode")),version:overview.data.registration.version}});
      setMessage("注册模式已更新并记录审计。");setRevision(x=>x+1);
    }catch(error){setMessage(error instanceof Error?error.message:"设置未完成。");}finally{setPending(false);form.reset();}
  }
  async function suspend(user:User){
    if(pending || !window.confirm(`${user.status==="active"?"暂停":"恢复"} ${user.username} 的服务访问？暂停会冻结相关群组，不等同于 MLS 移除。`))return;
    setPending(true);setMessage("");
    try{await api(`/v1/admin/users/${user.id}/status`,{method:"POST",audience:"admin",sessionId,body:{suspended:user.status==="active"}});setRevision(x=>x+1);setMessage("服务状态已更新。密码学撤权仍需授权客户端完成。");}
    catch(error){setMessage(error instanceof Error?error.message:"操作未确认，请刷新核实。");}finally{setPending(false);}
  }
  return (
    <section>
      <header className="page-heading"><h1>管理工作台</h1><p>业务元数据，真实来源。管理员不能读取通信明文。</p></header>
      <ServiceState {...overview}/>
      {overview.data && (
        <div className="metrics">
          {Object.entries(overview.data.counts).map(([name,value])=><div key={name}><span>{name}</span><strong>{value}</strong></div>)}
          <div><span>全站流量 / 地区</span><strong className="unknown">未知</strong></div>
        </div>
      )}
      <ReauthenticationForm audience="admin" sessionId={sessionId}/>
      {overview.data && (
        <form className="form panel" onSubmit={event=>{void settings(event);}}>
          <h2>注册管理</h2>
          <label>模式
            <select name="mode" defaultValue={overview.data.registration.registration_mode}>
              <option value="closed">关闭</option><option value="invite">邀请</option><option value="open">开放</option>
            </select>
          </label>
          <Button type="submit" isPending={pending}>保存并审计</Button>
        </form>
      )}
      <h2>用户</h2>
      <ServiceState {...users}/>
      {users.data && (
        <>
          <div className="table-scroll">
            <table>
              <caption>按永久 ID 分页的账号元数据</caption>
              <thead><tr><th>用户名</th><th>User ID</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {users.data.items.map(user=>(
                  <tr key={user.id}>
                    <td>{user.username}</td><td>{user.id}</td><td>{user.status}</td>
                    <td>
                      <Button variant="secondary" isDisabled={pending || !["active","suspended"].includes(user.status)} onPress={()=>{void suspend(user);}}>
                        {user.status==="active"?"暂停服务":"恢复服务"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.data.items.length===0 && <p>此页没有用户。</p>}
          <div className="actions">
            <Button variant="ghost" isDisabled={!after || pending} onPress={()=>setAfter("")}>第一页</Button>
            <Button variant="secondary" isDisabled={!users.data.next || pending} onPress={()=>setAfter(users.data!.next!)}>下一页</Button>
          </div>
        </>
      )}
      <p role="status">{message}</p>
      <p className="muted">统计数是服务端已接受 envelope 数，不是已完成密码学验证的聊天数。没有流量/GeoIP来源时不补零；备份执行器未接入，不提供假任务按钮。</p>
    </section>
  );
}
