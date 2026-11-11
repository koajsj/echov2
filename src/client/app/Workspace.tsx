import type { SessionView } from "../../shared/contracts";
import { AccountPage } from "../features/account/AccountPage";
import { DevicesPage } from "../features/devices/DevicesPage";
import { ConversationsPage } from "../features/messaging/ConversationsPage";
import { DataPage } from "../features/data/DataPage";
import { AdminPage } from "../features/admin/AdminPage";
export function Workspace({session,page,onChanged}:{session:SessionView;page:string;onChanged:()=>void}){
  if(session.audience==="admin")return <AdminPage sessionId={session.sessionId}/>;
  if(page==="account")return <AccountPage session={session} onChanged={onChanged}/>;
  if(page==="devices")return <DevicesPage session={session} onChanged={onChanged}/>;
  if(page==="data")return <DataPage sessionId={session.sessionId}/>;
  return <ConversationsPage/>;
}
