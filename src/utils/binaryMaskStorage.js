import { BINARY_MASK_EDITS_STORE, openDb } from './edfDb'

function isMissingStoreError(error) {
  return error?.name === 'NotFoundError' || error?.name === 'InvalidStateError'
}

export async function saveBinaryMaskEdit(recordId, channelLabel, maskBuffer) {
  if (!recordId || !channelLabel || !(maskBuffer instanceof ArrayBuffer)) {
    throw new Error('Invalid binary mask edit')
  }

  const db = await openDb()

  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(BINARY_MASK_EDITS_STORE)) {
      db.close()
      reject(new Error('Binary mask store is not available. Reload the page to upgrade IndexedDB.'))
      return
    }

    const tx = db.transaction(BINARY_MASK_EDITS_STORE, 'readwrite')
    const store = tx.objectStore(BINARY_MASK_EDITS_STORE)
    const request = store.put({
      recordId,
      channelLabel,
      maskBuffer,
      updatedAt: Date.now(),
    })

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getBinaryMaskEdits(recordId) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(BINARY_MASK_EDITS_STORE)) {
      db.close()
      resolve([])
      return
    }

    const tx = db.transaction(BINARY_MASK_EDITS_STORE, 'readonly')
    const store = tx.objectStore(BINARY_MASK_EDITS_STORE)
    const index = store.index('recordId')
    const request = index.getAll(recordId)

    request.onsuccess = () => resolve(request.result ?? [])
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteBinaryMaskEdit(recordId, channelLabel) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(BINARY_MASK_EDITS_STORE)) {
      db.close()
      resolve()
      return
    }

    const tx = db.transaction(BINARY_MASK_EDITS_STORE, 'readwrite')
    const store = tx.objectStore(BINARY_MASK_EDITS_STORE)
    const request = store.delete([recordId, channelLabel])

    request.onsuccess = () => resolve()
    request.onerror = () => {
      if (isMissingStoreError(request.error)) {
        resolve()
        return
      }
      reject(request.error)
    }
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      if (isMissingStoreError(tx.error)) {
        resolve()
        return
      }
      reject(tx.error)
    }
  })
}

export async function deleteBinaryMaskEditsForRecord(recordId) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(BINARY_MASK_EDITS_STORE)) {
      db.close()
      resolve()
      return
    }

    const tx = db.transaction(BINARY_MASK_EDITS_STORE, 'readwrite')
    const store = tx.objectStore(BINARY_MASK_EDITS_STORE)
    const index = store.index('recordId')
    const request = index.getAllKeys(recordId)

    request.onsuccess = () => {
      const keys = request.result ?? []
      if (keys.length === 0) {
        resolve()
        return
      }

      let remaining = keys.length
      keys.forEach((key) => {
        const deleteRequest = store.delete(key)
        deleteRequest.onerror = () => {
          if (isMissingStoreError(deleteRequest.error)) {
            remaining -= 1
            if (remaining === 0) resolve()
            return
          }
          reject(deleteRequest.error)
        }
        deleteRequest.onsuccess = () => {
          remaining -= 1
          if (remaining === 0) resolve()
        }
      })
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      if (isMissingStoreError(tx.error)) {
        resolve()
        return
      }
      reject(tx.error)
    }
  })
}
