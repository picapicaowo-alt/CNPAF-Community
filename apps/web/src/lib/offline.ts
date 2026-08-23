const DB_NAME = "cnpaf-collect";
const DRAFTS = "drafts";
const OUTBOX = "outbox";

export type LocalDraft = {
  clientRecordId: string;
  localVersion: number;
  sourceKind: string;
  payload: Record<string, unknown>;
  updatedAt: string;
  syncStatus: "local_only" | "pending" | "synced" | "conflict";
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: "clientRecordId" });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalDraft(draft: LocalDraft) {
  await withStore(DRAFTS, "readwrite", (s) => s.put(draft));
}

export async function getLocalDraft(id: string) {
  return withStore<LocalDraft | undefined>(DRAFTS, "readonly", (s) => s.get(id));
}

export async function listLocalDrafts() {
  return withStore<LocalDraft[]>(DRAFTS, "readonly", (s) => s.getAll());
}

export async function queueOutbox(item: { id: string; method: string; url: string; body: unknown }) {
  await withStore(OUTBOX, "readwrite", (s) => s.put({ ...item, createdAt: Date.now() }));
}

export async function flushOutbox() {
  const items = await withStore<{ id: string; method: string; url: string; body: unknown }[]>(
    OUTBOX,
    "readonly",
    (s) => s.getAll(),
  );
  for (const item of items ?? []) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        await withStore(OUTBOX, "readwrite", (s) => s.delete(item.id));
      }
    } catch {
      break;
    }
  }
}

export function newId() {
  return crypto.randomUUID();
}
