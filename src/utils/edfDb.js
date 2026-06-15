export const DB_NAME = 'edfviewer'
export const DB_VERSION = 4
export const VIEW_PRESETS_STORE = 'viewPresets'
export const EDF_RECORDS_STORE = 'edfRecords'
export const BINARY_MASK_EDITS_STORE = 'binaryMaskEdits'

export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (!db.objectStoreNames.contains(VIEW_PRESETS_STORE)) {
        const store = db.createObjectStore(VIEW_PRESETS_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('name', 'name', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(EDF_RECORDS_STORE)) {
        const store = db.createObjectStore(EDF_RECORDS_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('fileName', 'fileName', { unique: false })
        store.createIndex('savedAt', 'savedAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(BINARY_MASK_EDITS_STORE)) {
        const store = db.createObjectStore(BINARY_MASK_EDITS_STORE, {
          keyPath: ['recordId', 'channelLabel'],
        })
        store.createIndex('recordId', 'recordId', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
  })
}
