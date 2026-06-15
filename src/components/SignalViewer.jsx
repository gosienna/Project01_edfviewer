import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const CHANNEL_COLORS = [
  '#667eea', '#e53e3e', '#38a169', '#d69e2e', '#805ad5',
  '#319795', '#dd6b20', '#d53f8c', '#2b6cb0', '#718096',
]

const BINARY_MASK_COLOR = 'rgba(229, 62, 62, 0.25)'
const BINARY_MASK_STROKE = 'rgba(229, 62, 62, 0.6)'
const BINARY_EPS = 1e-6

const DEPICTION_FORMATS = {
  SEQUENCE: 'sequence',
  BINARY_MASK: 'binary_mask',
}

const DEPICTION_OPTIONS = [
  { value: DEPICTION_FORMATS.SEQUENCE, label: 'Sequence' },
  { value: DEPICTION_FORMATS.BINARY_MASK, label: 'Binary mask' },
]

const DEFAULT_CHANNELS = ['spo2', 'ihr', 'resp_norm', 'temperature', 'actigraphy']

const PLOT_PADDING = { top: 20, right: 20, bottom: 30, left: 70 }
const MIN_WINDOW_SECONDS = 5
const WHEEL_ZOOM_BASE = 1.15

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function getDefaultSelection(channels) {
  const preferred = channels
    .filter((ch) => DEFAULT_CHANNELS.includes(ch.label.toLowerCase()))
    .map((ch) => ch.id)

  if (preferred.length > 0) return preferred

  return channels
    .filter((ch) => !ch.label.toLowerCase().includes('annotation'))
    .slice(0, 5)
    .map((ch) => ch.id)
}

function isBinaryValue(value) {
  return Math.abs(value) <= BINARY_EPS || Math.abs(value - 1) <= BINARY_EPS
}

function isBinarySignal(data) {
  if (data.length === 0) return false
  for (let i = 0; i < data.length; i += 1) {
    if (!isBinaryValue(data[i])) return false
  }
  return true
}

function isActiveBinary(value) {
  return value > 0.5
}

function getBinaryMaskSegments(data, startIndex, endIndex, targetPoints) {
  const start = Math.max(0, Math.floor(startIndex))
  const end = Math.min(data.length, Math.ceil(endIndex))
  const length = end - start
  if (length <= 0) return []

  const points = Math.min(targetPoints, length)
  const segments = []
  let inSegment = false
  let segmentStart = 0

  for (let i = 0; i < points; i += 1) {
    const sliceStart = start + Math.floor((i * length) / points)
    const sliceEnd = start + Math.floor(((i + 1) * length) / points)
    let active = false

    for (let j = sliceStart; j < sliceEnd; j += 1) {
      if (isActiveBinary(data[j])) {
        active = true
        break
      }
    }

    const x = i / Math.max(points - 1, 1)
    if (active && !inSegment) {
      inSegment = true
      segmentStart = x
    } else if (!active && inSegment) {
      inSegment = false
      segments.push({ start: segmentStart, end: x })
    }
  }

  if (inSegment) {
    segments.push({ start: segmentStart, end: 1 })
  }

  return segments
}

function drawBinaryMaskSegments(ctx, segments, xLeft, plotWidth, yTop, yBottom, fillStyle, strokeStyle) {
  segments.forEach(({ start, end }) => {
    const x1 = xLeft + start * plotWidth
    const width = (end - start) * plotWidth
    ctx.fillStyle = fillStyle
    ctx.fillRect(x1, yTop, width, yBottom - yTop)
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle
      ctx.lineWidth = 1
      ctx.strokeRect(x1, yTop, width, yBottom - yTop)
    }
  })
}

function clampViewStart(start, windowSeconds, totalDuration) {
  return Math.max(0, Math.min(start, totalDuration - windowSeconds))
}

function downsampleRange(data, startIndex, endIndex, targetPoints) {
  const start = Math.max(0, Math.floor(startIndex))
  const end = Math.min(data.length, Math.ceil(endIndex))
  const length = end - start
  if (length <= 0) return []

  const points = Math.min(targetPoints, length)
  const result = new Array(points)

  for (let i = 0; i < points; i += 1) {
    const sliceStart = start + Math.floor((i * length) / points)
    const sliceEnd = start + Math.floor(((i + 1) * length) / points)
    let min = Infinity
    let max = -Infinity

    for (let j = sliceStart; j < sliceEnd; j += 1) {
      const value = data[j]
      if (value < min) min = value
      if (value > max) max = value
    }

    result[i] = { min, max }
  }

  return result
}

const SignalViewer = ({ edfData, onBack }) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [selectedChannels, setSelectedChannels] = useState(() =>
    getDefaultSelection(edfData.channels)
  )
  const [channelFormats, setChannelFormats] = useState({})
  const [windowSeconds, setWindowSeconds] = useState(60)
  const [viewStart, setViewStart] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 400 })

  const totalDuration = edfData.totalDuration
  const viewEnd = Math.min(viewStart + windowSeconds, totalDuration)
  const canvasHeight = Math.max(400, selectedChannels.length * 80)

  const binaryChannelIds = useMemo(
    () => new Set(edfData.channels.filter((ch) => isBinarySignal(ch.data)).map((ch) => ch.id)),
    [edfData]
  )

  const getChannelFormat = useCallback(
    (channelId) => channelFormats[channelId] ?? DEPICTION_FORMATS.SEQUENCE,
    [channelFormats]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const updateSize = () => {
      const width = container.clientWidth
      if (width > 0) {
        setCanvasSize({ width, height: canvasHeight })
      }
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [canvasHeight])

  const drawSignals = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const padding = PLOT_PADDING
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const activeChannels = edfData.channels.filter((ch) =>
      selectedChannels.includes(ch.id)
    )

    if (activeChannels.length === 0) {
      ctx.fillStyle = '#718096'
      ctx.font = '16px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Select one or more channels to view signals', width / 2, height / 2)
      return
    }

    const stripHeight = plotHeight / activeChannels.length

    const binaryMaskChannels = activeChannels.filter(
      (ch) => getChannelFormat(ch.id) === DEPICTION_FORMATS.BINARY_MASK
    )

    const binaryMaskSegmentsByChannel = binaryMaskChannels.map((channel) => ({
      channel,
      segments: getBinaryMaskSegments(
        channel.data,
        viewStart * channel.sampleRate,
        viewEnd * channel.sampleRate,
        plotWidth
      ),
    }))

    activeChannels.forEach((channel, stripIndex) => {
      const yTop = padding.top + stripIndex * stripHeight
      const yBottom = yTop + stripHeight
      const yMid = (yTop + yBottom) / 2
      const format = getChannelFormat(channel.id)

      ctx.strokeStyle = '#edf2f7'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padding.left, yMid)
      ctx.lineTo(width - padding.right, yMid)
      ctx.stroke()

      binaryMaskSegmentsByChannel.forEach(({ channel: maskChannel, segments }) => {
        if (maskChannel.id === channel.id && format === DEPICTION_FORMATS.BINARY_MASK) {
          return
        }

        drawBinaryMaskSegments(
          ctx,
          segments,
          padding.left,
          plotWidth,
          yTop + 2,
          yBottom - 2,
          BINARY_MASK_COLOR,
          maskChannel.id === channel.id ? BINARY_MASK_STROKE : null
        )
      })

      ctx.fillStyle = '#4a5568'
      ctx.font = '12px Inter, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const unit = channel.physicalDimension ? ` ${channel.physicalDimension}` : ''
      const formatLabel = format === DEPICTION_FORMATS.BINARY_MASK ? ' [mask]' : ''
      ctx.fillText(`${channel.label}${unit}${formatLabel}`, padding.left - 8, yMid)

      const startSample = viewStart * channel.sampleRate
      const endSample = viewEnd * channel.sampleRate

      if (format === DEPICTION_FORMATS.BINARY_MASK) {
        const ownSegments = getBinaryMaskSegments(channel.data, startSample, endSample, plotWidth)
        drawBinaryMaskSegments(
          ctx,
          ownSegments,
          padding.left,
          plotWidth,
          yTop + 2,
          yBottom - 2,
          'rgba(229, 62, 62, 0.4)',
          BINARY_MASK_STROKE
        )

        ctx.fillStyle = '#a0aec0'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('0 / 1 mask', padding.left + 4, yTop + 4)
        return
      }

      const samples = downsampleRange(channel.data, startSample, endSample, plotWidth)

      if (samples.length === 0) return

      let minVal = Infinity
      let maxVal = -Infinity
      samples.forEach(({ min, max }) => {
        if (min < minVal) minVal = min
        if (max > maxVal) maxVal = max
      })

      const range = maxVal - minVal || 1
      const color = CHANNEL_COLORS[stripIndex % CHANNEL_COLORS.length]

      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()

      samples.forEach((point, index) => {
        const x = padding.left + (index / Math.max(samples.length - 1, 1)) * plotWidth
        const yMin = yBottom - 8 - ((point.min - minVal) / range) * (stripHeight - 16)
        const yMax = yBottom - 8 - ((point.max - minVal) / range) * (stripHeight - 16)

        if (index === 0) {
          ctx.moveTo(x, yMin)
        } else {
          ctx.lineTo(x, yMin)
        }
        if (Math.abs(yMax - yMin) > 0.5) {
          ctx.lineTo(x, yMax)
        }
      })

      ctx.stroke()

      ctx.fillStyle = '#a0aec0'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(
        `${minVal.toFixed(1)} – ${maxVal.toFixed(1)}`,
        padding.left + 4,
        yTop + 4
      )
    })

    ctx.fillStyle = '#718096'
    ctx.font = '12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(
      `${viewStart.toFixed(0)}s – ${viewEnd.toFixed(0)}s  (${formatDuration(totalDuration)} total)`,
      width / 2,
      height - 20
    )
  }, [edfData, selectedChannels, channelFormats, getChannelFormat, viewStart, viewEnd, totalDuration, canvasSize.width, canvasSize.height])

  useEffect(() => {
    if (canvasSize.width > 0) {
      drawSignals()
    }
  }, [drawSignals, canvasSize])

  const handleChannelToggle = (channelId) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    )
  }

  const handleFormatChange = (channelId, format) => {
    setChannelFormats((prev) => ({
      ...prev,
      [channelId]: format,
    }))
  }

  const zoomIn = () => {
    setWindowSeconds((prev) => Math.max(MIN_WINDOW_SECONDS, prev / 2))
  }

  const zoomOut = () => {
    setWindowSeconds((prev) => Math.min(totalDuration, prev * 2))
  }

  const panLeft = () => {
    setViewStart((prev) => Math.max(0, prev - windowSeconds / 2))
  }

  const panRight = () => {
    setViewStart((prev) => Math.min(totalDuration - windowSeconds, prev + windowSeconds / 2))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const handleWheel = (event) => {
      event.preventDefault()

      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0) return

      const scaleX = canvas.width / rect.width
      const mouseX = (event.clientX - rect.left) * scaleX
      const plotWidth = canvas.width - PLOT_PADDING.left - PLOT_PADDING.right
      if (plotWidth <= 0) return

      const fraction = Math.max(0, Math.min(1, (mouseX - PLOT_PADDING.left) / plotWidth))
      const timeAtMouse = viewStart + fraction * windowSeconds
      const zoomFactor = WHEEL_ZOOM_BASE ** (-event.deltaY / 100)
      const newWindowSeconds = Math.max(
        MIN_WINDOW_SECONDS,
        Math.min(totalDuration, windowSeconds * zoomFactor)
      )

      if (newWindowSeconds === windowSeconds) return

      const newViewStart = clampViewStart(
        timeAtMouse - fraction * newWindowSeconds,
        newWindowSeconds,
        totalDuration
      )

      setWindowSeconds(newWindowSeconds)
      setViewStart(newViewStart)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [viewStart, windowSeconds, totalDuration])

  return (
    <section className="viewer-section">
      <div className="viewer-header">
        <div>
          <h2>Signal Viewer</h2>
          <p className="viewer-meta">
            {edfData.fileName} · {edfData.channels.length} channels · {formatDuration(totalDuration)}
            {edfData.isEdfPlus ? ' · EDF+' : ''}
          </p>
        </div>
        <div className="controls">
          <button className="btn btn-secondary" onClick={onBack} type="button">
            ← Back to Upload
          </button>
        </div>
      </div>

      <div className="viewer-content">
        <div className="channel-controls">
          <h3>Channel Selection</h3>
          <div className="channel-list">
            {edfData.channels.map((channel) => {
              const isBinary = binaryChannelIds.has(channel.id)
              const format = getChannelFormat(channel.id)

              return (
                <div key={channel.id} className="channel-item">
                  <label className="channel-item-header">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(channel.id)}
                      onChange={() => handleChannelToggle(channel.id)}
                    />
                    <span className="channel-label">{channel.label}</span>
                  </label>
                  <span className="channel-meta">
                    {channel.sampleRate.toFixed(1)} Hz
                    {channel.physicalDimension ? ` · ${channel.physicalDimension}` : ''}
                    {isBinary ? ' · binary' : ''}
                  </span>
                  <select
                    className="channel-depiction-select"
                    value={format}
                    onChange={(e) => handleFormatChange(channel.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    title={isBinary ? 'Choose depiction format' : 'Binary mask requires 0/1 signal values'}
                  >
                    {DEPICTION_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={
                          option.value === DEPICTION_FORMATS.BINARY_MASK && !isBinary
                        }
                      >
                        {option.label}
                        {option.value === DEPICTION_FORMATS.BINARY_MASK && !isBinary
                          ? ' (0/1 only)'
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </div>

        <div className="signal-display">
          <div className="signal-canvas-container" ref={containerRef}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="signal-canvas"
              title="Scroll to zoom on the time axis at the cursor"
            />
          </div>

          <div className="time-controls">
            <button className="btn btn-small" onClick={zoomIn} type="button">🔍+</button>
            <button className="btn btn-small" onClick={zoomOut} type="button">🔍-</button>
            <button className="btn btn-small" onClick={panLeft} type="button">←</button>
            <button className="btn btn-small" onClick={panRight} type="button">→</button>
            <span className="time-info">
              Window: {viewStart.toFixed(0)}s – {viewEnd.toFixed(0)}s ({windowSeconds}s)
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default SignalViewer
