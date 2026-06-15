import { openDb, VIEW_PRESETS_STORE } from './edfDb'

const STORE_NAME = VIEW_PRESETS_STORE

export async function listViewPresets() {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const presets = request.result.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(presets)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function saveViewPreset(name, params) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Preset name is required')
  }

  const db = await openDb()
  const now = Date.now()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('name')
    const lookup = index.getAll(trimmedName)

    lookup.onsuccess = () => {
      const existing = lookup.result[0]
      const record = {
        ...(existing ?? {}),
        name: trimmedName,
        params,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }

      const writeRequest = existing
        ? store.put({ ...record, id: existing.id })
        : store.add(record)

      writeRequest.onsuccess = () => resolve(writeRequest.result ?? existing.id)
      writeRequest.onerror = () => reject(writeRequest.error)
    }

    lookup.onerror = () => reject(lookup.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export async function updateViewPresetById(id, params) {
  const db = await openDb()
  const now = Date.now()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const existing = getRequest.result
      if (!existing) {
        reject(new Error('Preset not found'))
        return
      }

      const putRequest = store.put({
        ...existing,
        params,
        updatedAt: now,
      })

      putRequest.onsuccess = () => resolve(id)
      putRequest.onerror = () => reject(putRequest.error)
    }

    getRequest.onerror = () => reject(getRequest.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteViewPreset(id) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}
