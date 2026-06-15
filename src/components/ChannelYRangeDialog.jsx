import React, { useEffect, useState } from 'react'

function ChannelYRangeDialog({
  isOpen,
  channelLabel,
  initialMin,
  initialMax,
  onClose,
  onApply,
  onReset,
}) {
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setMinValue(String(initialMin))
    setMaxValue(String(initialMax))
    setError('')
  }, [isOpen, initialMin, initialMax])

  const handleApply = () => {
    const min = Number(minValue)
    const max = Number(maxValue)

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setError('Enter valid numbers for min and max')
      return
    }

    if (min >= max) {
      setError('Min must be less than max')
      return
    }

    onApply(min, max)
  }

  if (!isOpen) return null

  return (
    <div className="export-dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="export-dialog channel-yrange-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-yrange-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="export-dialog-header">
          <h3 id="channel-yrange-dialog-title">Y-Axis Range · {channelLabel}</h3>
          <button className="export-dialog-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="export-dialog-body">
          <p className="channel-yrange-dialog-hint">
            Set the visible value range for this channel. Scroll on the left strip to zoom,
            drag the center marker to shift the range, or right-click the channel to open this dialog.
          </p>

          <div className="channel-yrange-inputs">
            <label className="channel-yrange-field">
              <span>Min</span>
              <input
                type="number"
                step="any"
                value={minValue}
                onChange={(event) => setMinValue(event.target.value)}
                autoFocus
              />
            </label>
            <label className="channel-yrange-field">
              <span>Max</span>
              <input
                type="number"
                step="any"
                value={maxValue}
                onChange={(event) => setMaxValue(event.target.value)}
              />
            </label>
          </div>

          {error ? <p className="export-dialog-error">{error}</p> : null}
        </div>

        <div className="export-dialog-footer">
          <button className="btn btn-secondary btn-small" type="button" onClick={onReset}>
            Reset to auto
          </button>
          <div className="channel-yrange-dialog-actions">
            <button className="btn btn-secondary btn-small" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary btn-small" type="button" onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChannelYRangeDialog
