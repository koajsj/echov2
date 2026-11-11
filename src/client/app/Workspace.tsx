import type { SessionView } from "../../shared/contracts";
import { AccountPage } from "../features/account/AccountPage";
import { PrivacyPage } from "../features/account/PrivacyPage";
import { DevicesPage } from "../features/devices/DevicesPage";
import { RecoveryPage } from "../features/devices/RecoveryPage";
import { ConversationsPage } from "../features/messaging/ConversationsPage";
import { ContactsPage } from "../features/contacts/ContactsPage";
import { SavedPage } from "../features/personal/SavedPage";
import { TrashPage } from "../features/personal/TrashPage";
import { DataPage } from "../features/data/DataPage";
import { DashboardPage } from "../features/admin/DashboardPage";
import { UsersPage } from "../features/admin/UsersPage";
import { RegistrationPage } from "../features/admin/RegistrationPage";
import { AdminRecordsPage } from "../features/admin/AdminRecordsPage";
import { AdminSettingsPage } from "../features/admin/AdminSettingsPage";
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
  if (session.audience === "admin")
    return (
      <>
        <ReauthenticationForm audience="admin" sessionId={sessionId} />
        {page === "admin" ? (
          <DashboardPage sessionId={sessionId} />
        ) : page === "admin/users" ? (
          <UsersPage sessionId={sessionId} />
        ) : page === "admin/registration" ? (
          <RegistrationPage sessionId={sessionId} />
        ) : page === "admin/devices" ? (
          <AdminRecordsPage kind="devices" sessionId={sessionId} />
        ) : page === "admin/logins" ? (
          <AdminRecordsPage kind="logins" sessionId={sessionId} />
        ) : page === "admin/security" ? (
          <AdminRecordsPage kind="security" sessionId={sessionId} />
        ) : page === "admin/audit" ? (
          <AdminRecordsPage kind="audit" sessionId={sessionId} />
        ) : page === "admin/backups" ? (
          <AdminRecordsPage kind="backups" sessionId={sessionId} />
        ) : page === "admin/analytics" ? (
          <DashboardPage analytics sessionId={sessionId} />
        ) : page === "admin/regions" ? (
          <section>
            <header className="page-heading">
              <h1>地区分布</h1>
              <p>
                未知 · 没有合法本地 GeoIP
                数据和可信采集来源，不绘制假地图或零值。
              </p>
            </header>
          </section>
        ) : page === "admin/settings" ? (
          <AdminSettingsPage />
        ) : (
          <p>页面不存在。</p>
        )}
      </>
    );
  if (page === "account" || page === "settings")
    return (
      <>
        <AccountPage session={session} onChanged={onChanged} />
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
  if (page === "data") return <DataPage sessionId={sessionId} />;
  if (page === "conversations") return <ConversationsPage session={session} />;
  return (
    <section>
      <h1>页面不存在</h1>
      <a href="#conversations">返回聊天</a>
    </section>
  );
}
