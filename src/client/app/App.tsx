import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { UserApp } from "./UserApp";
import { AdminApp } from "./AdminApp";
import { pageTitle } from "./navigation";
export function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) || "login");
  const [dark, setDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const handler = () => setPage(location.hash.slice(1) || "login");
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
  return (
    <>
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
      <div className="theme-control">
        <Button variant="ghost" onPress={() => setDark((value) => !value)}>
          {dark ? "浅色外观" : "深色外观"}
        </Button>
      </div>
      {location.pathname.startsWith("/admin") ? (
        <AdminApp page={page} />
      ) : (
        <UserApp page={page} />
      )}
    </>
  );
}
