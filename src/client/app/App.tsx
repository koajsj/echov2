import { useEffect,useState } from "react";
import { Button } from "@heroui/react";
import type { Audience,SessionView } from "../../shared/contracts";
import { ApiError,api } from "./api";
import { useApiQuery } from "./use-api-query";
import { Brand } from "../components/Brand";
import { ServiceState } from "../components/ServiceState";
import { AuthPage } from "../features/account/AuthPage";
import { Workspace } from "./Workspace";

function Realm({audience,page}:{audience:Audience;page:string}){
  const [revision,setRevision]=useState(0);const query=useApiQuery<SessionView>(`/v1/session?audience=${audience}`,revision);
  const [message,setMessage]=useState("");const [pending,setPending]=useState(false);
  const changed=()=>setRevision(value=>value+1);
  async function logout(){
    if(pending || !query.data)return;setPending(true);setMessage("");
    try{await api(`/v1/sessions/current?audience=${audience}`,{method:"DELETE",audience,sessionId:query.data.sessionId});changed();}
    catch(error){setMessage(error instanceof Error?error.message:"登出未确认。");}finally{setPending(false);}
  }
  if(query.error instanceof ApiError && query.error.status===401)return <AuthPage audience={audience} onAuthenticated={changed}/>;
  return (
    <>
      <ServiceState {...query}/>
      {query.data && (
        <>
          <div className="session-bar">
            <span>{query.data.account.username} · {audience==="admin"?"管理员":"用户"}</span>
            <Button variant="ghost" isPending={pending} onPress={()=>{void logout();}}>登出</Button>
          </div>
          <Workspace key={`${query.data.account.id}:${revision}:${page}`} session={query.data} page={page} onChanged={changed}/>
        </>
      )}
      <p role="status">{message}</p>
    </>
  );
}
export function App(){
  const [page,setPage]=useState(()=>location.hash.slice(1)||"conversations");
  const [dark,setDark]=useState(()=>matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(()=>{const handler=()=>setPage(location.hash.slice(1)||"conversations");window.addEventListener("hashchange",handler);return()=>window.removeEventListener("hashchange",handler);},[]);
  useEffect(()=>{document.documentElement.classList.toggle("dark",dark);document.documentElement.dataset.theme=dark?"dark":"light";},[dark]);
  useEffect(()=>{document.title=`Echo Native · ${page}`;document.getElementById("main")?.focus();},[page]);
  const audience=page==="admin"?"admin":"user";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main" onClick={event=>{event.preventDefault();document.getElementById("main")?.focus();}}>跳至内容</a>
      <aside className="sidebar">
        <Brand/>
        <nav aria-label="主导航">
          {[["conversations","会话"],["account","账户"],["devices","设备"],["data","安全与数据"],["admin","管理端"]].map(([id,label])=>(
            <a key={id} href={`#${id}`} aria-current={page===id?"page":undefined}>{label}</a>
          ))}
        </nav>
        <Button variant="ghost" onPress={()=>setDark(value=>!value)}>{dark?"浅色外观":"深色外观"}</Button>
        <small>Native foundation · MLS blocked</small>
      </aside>
      <main id="main" tabIndex={-1}><Realm key={audience} audience={audience} page={page}/></main>
    </div>
  );
}
