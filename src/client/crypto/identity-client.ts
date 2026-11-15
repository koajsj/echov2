import type { IdentityCommand } from "./identity-engine";
export class IdentityClient {
  private closed = false;
  private readonly worker = new Worker(
    new URL("./identity-worker.ts", import.meta.url),
    { type: "module" },
  );
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = (
      event: MessageEvent<{ id: string; result?: unknown; error?: string }>,
    ) => {
      const p = this.pending.get(event.data.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(event.data.id);
      if (event.data.error) p.reject(new Error(event.data.error));
      else p.resolve(event.data.result);
    };
    this.worker.onerror = () => this.close();
  }
  run<T>(command: IdentityCommand): Promise<T> {
    if (this.closed) return Promise.reject(new Error("身份执行器已关闭。"));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("身份操作结果未知，请核实状态后重试。"));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.worker.postMessage({ id, command });
    });
  }
  close(): void {
    this.closed = true;
    this.worker.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("身份执行器已关闭，操作结果需重新核实。"));
    }
    this.pending.clear();
  }
}
