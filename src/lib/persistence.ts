/**
 * Локальная persistence демо-стенда (ТЗ-план, решение 3):
 * - настройки/сессия — localStorage;
 * - пользовательские правки данных — IndexedDB overlay поверх
 *   детерминированного генератора (заменённые сущности по id + добавленные +
 *   записи истории); сброс возвращает базовый набор.
 */

const DB_NAME = 'fleetops-demo'
const DB_VERSION = 1
const STORE = 'overlay'

export interface OverlayData {
  /** Заменённые сущности по id (инциденты, интервалы, работы …). */
  replaced: Record<string, Record<string, unknown>>
  /** Добавленные сущности по коллекции (incidents, downtimes, maintenance, …). */
  appended: Record<string, Array<Record<string, unknown>>>
  /** Записи истории, добавленные пользователем (по incidentId). */
  timelineAppend: Array<Record<string, unknown>>
  /** Версия схемы overlay. */
  schemaVersion: 1
}

export function emptyOverlay(): OverlayData {
  return { replaced: {}, appended: {}, timelineAppend: [], schemaVersion: 1 }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    tx.onabort = () => {
      console.error('[persistence] tx aborted:', tx.error)
      reject(tx.error ?? new Error('tx aborted'))
    }
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
    tx.oncomplete = () => db.close()
  })
}

export async function loadOverlay(): Promise<OverlayData> {
  try {
    const raw = await withStore<OverlayData | undefined>('readonly', (s) => s.get('data'))
    if (!raw) return emptyOverlay()
    if (raw.schemaVersion !== 1) return emptyOverlay()
    return raw
  } catch {
    // Приватный режим браузера и т.п. — работаем без persistence.
    return emptyOverlay()
  }
}

export async function saveOverlay(data: OverlayData): Promise<void> {
  try {
    // Vue reactive Proxy не подлежит structured clone (DataCloneError в IDB) —
    // сериализуем в plain object перед записью.
    const plain = JSON.parse(JSON.stringify(data)) as OverlayData
    await withStore('readwrite', (s) => s.put(plain, 'data'))
  } catch (e) {
    console.error('[persistence] saveOverlay failed:', e)
  }
}

export async function resetOverlay(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete('data'))
  } catch {
    /* ignore */
  }
}

// ─── localStorage helpers (настройки/сессия) ────────────────────────────────

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`fleetops-demo:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(`fleetops-demo:${key}`, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
