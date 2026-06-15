import React, { useEffect } from 'react'

function formatSavedAt(timestamp) {
  return new Date(timestamp).toLocaleString()
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SaveEdfConflictDialog({
  isOpen,
  fileName,
  duplicates,
  isSaving,
  onReplace,
  onSaveAsNew,
  onCancel,
}) {
  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="export-dialog-backdrop" onClick={onCancel} role="presentation">
      <div
        className="export-dialog save-edf-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-edf-conflict-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="export-dialog-header">
          <h3 id="save-edf-conflict-title">File already in IndexedDB</h3>
          <button className="export-dialog-close" type="button" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="export-dialog-body">
          <p className="save-edf-conflict-message">
            <strong>{fileName}</strong> is already saved in IndexedDB. What would you like to do?
          </p>

          <ul className="save-edf-conflict-list">
            {duplicates.map((record) => (
              <li key={record.id} className="save-edf-conflict-item">
                <span className="save-edf-conflict-item-meta">
                  Saved {formatSavedAt(record.savedAt)} · {formatFileSize(record.fileSizeBytes)}
                  {record.summary?.channelCount ? ` · ${record.summary.channelCount} channels` : ''}
                </span>
              </li>
            ))}
          </ul>

          <p className="save-edf-conflict-hint">
            Replace updates the existing IndexedDB copy with your current file and mask edits.
            Save as new keeps the old copy and adds another entry.
          </p>
        </div>

        <div className="export-dialog-footer">
          <button className="btn btn-secondary" type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onSaveAsNew}
            disabled={isSaving}
          >
            Save as new copy
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={onReplace}
            disabled={isSaving}
            autoFocus
          >
            {isSaving ? 'Saving...' : 'Replace existing'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaveEdfConflictDialog
