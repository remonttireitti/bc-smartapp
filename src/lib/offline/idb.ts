/** Pieni IndexedDB-kääre offline-välimuistille ja lähtevien muutosten jonolle. */
const DB_NAME = 'bc-smartapp-offline';
const DB_VERSION = 1;
export type StoreName = 'rows' | 'urls' | 'outbox' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('urls')) db.createObjectStore('urls', { keyPath: 'url' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  return wrap<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function idbPut<T>(store: StoreName, value: T): Promise<IDBValidKey> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const res = await wrap(tx.objectStore(store).put(value));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return res;
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  return wrap<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
