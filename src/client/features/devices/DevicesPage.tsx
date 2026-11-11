import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@heroui/react";
import type { DeviceView,SessionView } from "../../../shared/contracts";
import { api } from "../../app/api";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import { ReauthenticationForm } from "../../components/ReauthenticationForm";
export function DevicesPage({session,onChanged}:{session:SessionView;onChanged:()=>void}) {
  const [revision,setRevision]=useState(0);const query=useApiQuery<{items:DeviceView[]}>("/v1/devices",revision,session.sessionId);
  const [pending,setPending]=useState(false);const [message,setMessage]=useState("");
  async function register(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending)return;const form=event.currentTarget;const data=new FormData(form);setPending(true);setMessage("");
    try{await api("/v1/devices",{method:"POST",sessionId:session.sessionId,body:{label:String(data.get("label"))}});setRevision(x=>x+1);onChanged();setMessage("设备已登记为 pending，未签发密码学凭证。");}
    catch(error){setMessage(error instanceof Error?error.message:"登记失败。");}finally{setPending(false);form.reset();}
  }
  async function revoke(id:string){
    if(pending || !window.confirm("撤销该设备的服务访问？群组将冻结，MLS 成员移除仍需可信客户端完成。"))return;
    setPending(true);setMessage("");
    try{await api(`/v1/devices/${id}/revoke`,{method:"POST",sessionId:session.sessionId});setRevision(x=>x+1);setMessage("服务访问已撤销；这不代表群组密码学移除完成。");if(id===session.deviceId)onChanged();}
    catch(error){setMessage(error instanceof Error?error.message:"撤销未确认。");}finally{setPending(false);}
  }
  return (
    <section>
      <header className="page-heading"><h1>设备与身份</h1><p>每台设备独立登记。密码登录不代表密钥可信。</p></header>
      <ServiceState {...query}/>
      {query.data && (
        <ul className="record-list">
          {query.data.items.map(device=>(
            <li key={device.id}>
              <div><strong>{device.label}</strong><small>{device.id}</small><span>{device.status}</span></div>
              <Button variant="secondary" isDisabled={pending || device.status==="revoked"} onPress={()=>{void revoke(device.id);}}>
                撤销服务访问
              </Button>
            </li>
          ))}
          {query.data.items.length===0 && <li>尚未登记设备。</li>}
        </ul>
      )}
      {!session.deviceId && (
        <form className="form panel" onSubmit={event=>{void register(event);}}>
          <h2>登记当前设备</h2>
          <label>设备名称<input name="label" required maxLength={80} placeholder="例如：我的 Mac"/></label>
          <Button type="submit" isPending={pending}>登记为待授权设备</Button>
        </form>
      )}
      <p role="status">{message}</p>
      <ReauthenticationForm audience="user" sessionId={session.sessionId}/>
      <p className="muted">首次根身份、可信设备授权、SAS/QR 与 MLS 入组未接入；没有可用的“已验证”假状态。</p>
    </section>
  );
}
