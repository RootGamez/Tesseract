import { loadLibraryFromBlob, mergeLibraryItems } from '@excalidraw/excalidraw';
import type { LibraryPersistenceAdapter } from '@excalidraw/excalidraw/data/library';
import type { ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types';

// ── Persistencia de la biblioteca de Excalidraw ──────────────────────────────
// Guardamos los items de la biblioteca en IndexedDB (no localStorage) porque
// algunas bibliotecas con imágenes superan el límite de ~5MB de localStorage.
// El adaptador lo consume `useHandleLibrary`: cada vez que el usuario importa o
// borra una biblioteca, Excalidraw llama a save(); al montar el board, load().

const DB_NAME = 'tesseract-excalidraw';
const STORE = 'library';
const KEY = 'libraryItems';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Adaptador que `useHandleLibrary` usa para cargar/guardar la biblioteca. */
export const libraryAdapter: LibraryPersistenceAdapter = {
  async load() {
    const libraryItems = await idbGet<LibraryItems>(KEY);
    return libraryItems ? { libraryItems } : null;
  },
  async save(data) {
    await idbSet(KEY, data.libraryItems);
  },
};

// ── Bibliotecas por defecto (disponibles desde el inicio) ────────────────────
// Coloca archivos .excalidrawlib en `public/libraries/` y lístalos en
// `public/libraries/index.json` (un array de nombres de archivo). Se cargan una
// sola vez por navegador (bandera en localStorage) y se fusionan con lo que el
// usuario ya tenga, así no se duplican ni reaparecen si las borra a propósito.

const DEFAULTS_FLAG = 'tesseract-default-libs-loaded';

export async function loadDefaultLibraries(api: ExcalidrawImperativeAPI): Promise<void> {
  if (localStorage.getItem(DEFAULTS_FLAG)) return;

  try {
    const res = await fetch('/libraries/index.json');
    if (!res.ok) return; // no hay manifiesto: nada que cargar
    const files: string[] = await res.json();
    if (!Array.isArray(files) || files.length === 0) return;

    let items: LibraryItems = [];
    for (const file of files) {
      try {
        const blob = await fetch(`/libraries/${file}`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        });
        const libItems = await loadLibraryFromBlob(blob);
        items = mergeLibraryItems(items, libItems);
      } catch (err) {
        console.warn(`[board] no se pudo cargar la biblioteca "${file}":`, err);
      }
    }

    if (items.length > 0) {
      await api.updateLibrary({ libraryItems: items, merge: true });
    }
  } catch (err) {
    console.warn('[board] sin bibliotecas por defecto:', err);
  } finally {
    // Marcar como cargadas aunque falle, para no reintentar en cada montaje.
    localStorage.setItem(DEFAULTS_FLAG, '1');
  }
}
