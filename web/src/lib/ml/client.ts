import type { Op } from "./worker";
import type { TabularData } from "./types";

export class Cancelled extends Error {}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: unknown) => void;
}

/** Promise-based wrapper around one ML Web Worker. */
export class MLWorker {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(data: TabularData) {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<{ id: number; kind: string; payload: unknown }>) => {
      const { id, kind, payload } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      if (kind === "progress") return p.onProgress?.(payload);
      this.pending.delete(id);
      if (kind === "result") p.resolve(payload);
      else if (kind === "cancelled") p.reject(new Cancelled());
      else p.reject(new Error(String(payload)));
    };
    this.call({ op: "init", data }).catch(() => {});
  }

  call<T = unknown, P = unknown>(msg: Op, onProgress?: (p: P) => void): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress: onProgress as (p: unknown) => void });
      this.worker.postMessage({ id, ...msg });
    });
  }

  terminate() {
    this.worker.terminate();
    this.pending.forEach((p) => p.reject(new Cancelled()));
  }
}

export const isCancelled = (e: unknown) => e instanceof Cancelled;
