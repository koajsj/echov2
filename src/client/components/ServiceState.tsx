export function ServiceState({ loading,error }: { loading: boolean; error: Error | null }) {
  if (loading) return <p role="status">正在读取服务数据…</p>;
  return error ? <p className="error" role="alert">{error.message}</p> : null;
}
