import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import type { Audience, SessionView } from "../../shared/contracts";
import { ApiError, api } from "./api";
import { useApiQuery } from "./use-api-query";
import { userNavigation, adminNavigation, pageTitle } from "./navigation";
import { Icon } from "../components/Icon";
import { Brand } from "../components/Brand";
import { ServiceState } from "../components/ServiceState";
import { AuthPage } from "../features/account/AuthPage";
import { Workspace } from "./Workspace";
function Realm({ audience, page }: { audience: Audience; page: string }) {
  const [revision, setRevision] = useState(0);
  const query = useApiQuery<SessionView>(
    `/v1/session?audience=${audience}`,
    revision,
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const changed = () => setRevision((value) => value + 1);
  async function logout() {
    if (pending || !query.data) return;
    setPending(true);
    setMessage("");
    try {
      await api(`/v1/sessions/current?audience=${audience}`, {
        method: "DELETE",
        audience,
        sessionId: query.data.sessionId,
      });
      changed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登出未确认。");
    } finally {
      setPending(false);
    }
  }
  if (query.error instanceof ApiError && query.error.status === 401)
    return <AuthPage audience={audience} onAuthenticated={changed} />;
  return (
    <>
      <ServiceState {...query} />
      {query.data && (
        <>
          <div className="session-bar">
            <span>
              {query.data.account.username} ·{" "}
              {audience === "admin" ? "管理员" : "用户"}
            </span>
            <Button
              variant="ghost"
              isPending={pending}
              onPress={() => {
                void logout();
              }}
            >
              登出
            </Button>
          </div>
          <Workspace
            key={`${query.data.account.id}:${revision}:${page}`}
            session={query.data}
            page={page}
            onChanged={changed}
          />
        </>
      )}
      <p role="status">{message}</p>
    </>
  );
}
export function App() {
  const [page, setPage] = useState(
    () => location.hash.slice(1) || "conversations",
  );
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [dark, setDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const desktop = matchMedia("(min-width: 761px)");
    const expand = () => {
      if (desktop.matches) setNavigationOpen(true);
    };
    desktop.addEventListener("change", expand);
    return () => desktop.removeEventListener("change", expand);
  }, []);
  useEffect(() => {
    const handler = () => setPage(location.hash.slice(1) || "conversations");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    document.title = `Echo Native · ${pageTitle(page)}`;
    document.getElementById("main")?.focus();
  }, [page]);
  const audience =
    page === "admin" || page.startsWith("admin/") ? "admin" : "user";
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        跳至内容
      </a>
      <aside className="sidebar">
        <Brand />
        <details
          className="navigation"
          open={navigationOpen}
          onToggle={(event) => setNavigationOpen(event.currentTarget.open)}
        >
          <summary>导航</summary>
          <nav aria-label={audience === "admin" ? "管理员导航" : "用户导航"}>
            {(audience === "admin" ? adminNavigation : userNavigation).map(
              (item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  aria-current={page === item.id ? "page" : undefined}
                >
                  <Icon name={item.symbol} />
                  {item.label}
                </a>
              ),
            )}
          </nav>
        </details>
        <a
          className="realm-link"
          href={audience === "admin" ? "#conversations" : "#admin"}
        >
          {audience === "admin" ? "返回用户端" : "独立管理员登录"}
        </a>
        <Button variant="ghost" onPress={() => setDark((value) => !value)}>
          {dark ? "浅色外观" : "深色外观"}
        </Button>
        <small>第三阶段 · MLS 准入未通过</small>
      </aside>
      <main id="main" tabIndex={-1}>
        <Realm key={audience} audience={audience} page={page} />
      </main>
    </div>
  );
}
