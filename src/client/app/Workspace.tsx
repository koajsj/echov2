import type { SessionView } from "../../shared/contracts";
import { SessionPanel } from "../features/devices/SessionPanel";
import { AccountPage } from "../features/account/AccountPage";
import { PrivacyPage } from "../features/account/PrivacyPage";
import { DevicesPage } from "../features/devices/DevicesPage";
import { RecoveryPage } from "../features/devices/RecoveryPage";
import { ConversationsPage } from "../features/messaging/ConversationsPage";
import { ContactsPage } from "../features/contacts/ContactsPage";
import { SavedPage } from "../features/personal/SavedPage";
import { TrashPage } from "../features/personal/TrashPage";
import { DataPage } from "../features/data/DataPage";
import { ReauthenticationForm } from "../components/ReauthenticationForm";
export function Workspace({
  session,
  page,
  onChanged,
}: {
  session: SessionView;
  page: string;
  onChanged: () => void;
}) {
  const sessionId = session.sessionId;
  if (page === "account" || page === "settings")
    return (
      <>
        <AccountPage session={session} onChanged={onChanged} />
        <ReauthenticationForm audience="user" sessionId={sessionId} />
        <SessionPanel sessionId={sessionId} />
        <section className="panel">
          <h2>注销账号与导出</h2>
          <p>
            BLOCKED · 群组 Owner 交接、Remove
            Commit、删除传播和备份防复活未闭环，不执行只删账号行的伪注销。
          </p>
          <a href="#data">查看数据与备份边界</a>
        </section>
      </>
    );
  if (page === "privacy") return <PrivacyPage />;
  if (page === "devices")
    return <DevicesPage session={session} onChanged={onChanged} />;
  if (page === "recovery") return <RecoveryPage sessionId={sessionId} />;
  if (page === "contacts") return <ContactsPage sessionId={sessionId} />;
  if (page === "saved") return <SavedPage />;
  if (page === "trash") return <TrashPage sessionId={sessionId} />;
  if (page === "data") return <DataPage session={session} />;
  if (page === "conversations") return <ConversationsPage session={session} />;
  return (
    <section>
      <h1>页面不存在</h1>
      <a href="#conversations">返回聊天</a>
    </section>
  );
}
