import type { SessionView } from "../../shared/contracts";
import { DashboardPage } from "../features/admin/DashboardPage";
import { UsersPage } from "../features/admin/UsersPage";
import { RegistrationPage } from "../features/admin/RegistrationPage";
import { AdminRecordsPage } from "../features/admin/AdminRecordsPage";
import { AdminSettingsPage } from "../features/admin/AdminSettingsPage";
import { ReauthenticationForm } from "../components/ReauthenticationForm";
export function AdminWorkspace({
  session,
  page,
}: {
  session: SessionView;
  page: string;
}) {
  const sessionId = session.sessionId;
  return (
    <>
      <details className="admin-reauth">
        <summary>敏感操作认证 · 五分钟有效</summary>
        <ReauthenticationForm audience="admin" sessionId={sessionId} />
      </details>
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
      ) : page === "admin/deletions" ? (
        <AdminRecordsPage kind="deletions" sessionId={sessionId} />
      ) : page === "admin/backups" ? (
        <AdminRecordsPage kind="backups" sessionId={sessionId} />
      ) : page === "admin/analytics" ? (
        <DashboardPage analytics sessionId={sessionId} />
      ) : page === "admin/regions" ? (
        <section>
          <header className="page-heading">
            <h1>地区分布</h1>
            <p>
              未知 · 没有合法本地 GeoIP 数据和可信采集来源，不绘制假地图或零值。
            </p>
          </header>
        </section>
      ) : page === "admin/settings" ? (
        <AdminSettingsPage sessionId={sessionId} />
      ) : (
        <p>页面不存在。</p>
      )}
    </>
  );
}
