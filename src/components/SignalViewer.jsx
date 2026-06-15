import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { deleteViewPreset, listViewPresets, saveViewPreset, updateViewPresetById } from '../utils/viewPresets'
import { buildEdfSummary, saveEdfRecord } from '../utils/edfStorage'

const CHANNEL_COLORS = [
  '#667eea', '#e53e3e', '#38a169', '#d69e2e', '#805ad5',
  '#319795', '#dd6b20', '#d53f8c', '#2b6cb0', '#718096',
]

const BINARY_MASK_COLORS = [
  { fill: 'rgba(229, 62, 62, 0.25)', stroke: 'rgba(229, 62, 62, 0.65)', strong: 'rgba(229, 62, 62, 0.42)' },
  { fill: 'rgba(56, 161, 105, 0.25)', stroke: 'rgba(56, 161, 105, 0.65)', strong: 'rgba(56, 161, 105, 0.42)' },
  { fill: 'rgba(214, 158, 46, 0.25)', stroke: 'rgba(214, 158, 46, 0.65)', strong: 'rgba(214, 158, 46, 0.42)' },
  { fill: 'rgba(128, 90, 213, 0.25)', stroke: 'rgba(128, 90, 213, 0.65)', strong: 'rgba(128, 90, 213, 0.42)' },
  { fill: 'rgba(49, 151, 149, 0.25)', stroke: 'rgba(49, 151, 149, 0.65)', strong: 'rgba(49, 151, 149, 0.42)' },
  { fill: 'rgba(221, 107, 32, 0.25)', stroke: 'rgba(221, 107, 32, 0.65)', strong: 'rgba(221, 107, 32, 0.42)' },
  { fill: 'rgba(213, 63, 140, 0.25)', stroke: 'rgba(213, 63, 140, 0.65)', strong: 'rgba(213, 63, 140, 0.42)' },
  { fill: 'rgba(43, 108, 176, 0.25)', stroke: 'rgba(43, 108, 176, 0.65)', strong: 'rgba(43, 108, 176, 0.42)' },
]
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

const VIEWER_TABS = {
  VIEWER: 'viewer',
  CURRENT_VIEW: 'current-view',
  CHANNELS: 'channels',
}

const VIEWER_TAB_ITEMS = [
  { id: VIEWER_TABS.VIEWER, label: 'Signal Viewer' },
  { id: VIEWER_TABS.CURRENT_VIEW, label: 'View Format' },
  { id: VIEWER_TABS.CHANNELS, label: 'Channel Select' },
]

const PLOT_PADDING = { top: 20, right: 20, bottom: 30, left: 70 }
const MIN_WINDOW_SECONDS = 5
const WHEEL_ZOOM_BASE = 1.15
const DEFAULT_CHANNEL_STRIP_HEIGHT = 80
const MIN_CHANNEL_STRIP_HEIGHT = 40
const MIN_PANEL_HEIGHT = 200
const DEFAULT_PANEL_HEIGHT = 450
const PANEL_RESIZE_HANDLE_HEIGHT = 10
const Y_VALUE_REGION_WIDTH = 88
const Y_WHEEL_ZOOM_BASE = 1.15
const MIN_Y_ZOOM = 0.25
const MAX_Y_ZOOM = 32
const DEFAULT_Y_ZOOM = 1
const OVERVIEW_STRIP_HEIGHT = 56

function getDetailChannelsTop() {
  return PLOT_PADDING.top + OVERVIEW_STRIP_HEIGHT
}

function getDefaultOverviewChannelId(channels, preferredIds = []) {
  const preferred = preferredIds.find((id) => channels.some((ch) => ch.id === id))
  if (preferred !== undefined) return preferred

  const defaultSelection = getDefaultSelection(channels)
  if (defaultSelection.length > 0) return defaultSelection[0]

  return channels[0]?.id ?? null
}

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

function getBinaryMaskColor(index) {
  return BINARY_MASK_COLORS[index % BINARY_MASK_COLORS.length]
}

function getDefaultBinaryMaskOverlayTargets(channelId, selectedChannels, channelFormats) {
  return selectedChannels.filter(
    (id) =>
      id !== channelId &&
      (channelFormats[id] ?? DEPICTION_FORMATS.SEQUENCE) === DEPICTION_FORMATS.SEQUENCE
  )
}

function mapOverlayIdsToLabels(overlayRecord, channelById) {
  const byLabel = {}
  Object.entries(overlayRecord ?? {}).forEach(([maskId, targetIds]) => {
    const maskLabel = channelById[maskId]?.label ?? channelById[Number(maskId)]?.label
    if (!maskLabel) return

    byLabel[maskLabel] = targetIds
      .map((targetId) => channelById[targetId]?.label ?? channelById[Number(targetId)]?.label)
      .filter(Boolean)
      .sort()
  })
  return byLabel
}

function normalizeOverlayLabelRecord(record) {
  return Object.fromEntries(
    Object.entries(record ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, targets]) => [label, [...targets].sort()])
  )
}

function clampViewStart(start, windowSeconds, totalDuration) {
  return Math.max(0, Math.min(start, totalDuration - windowSeconds))
}

function getChannelStripHeight(channelStripHeights, channelId) {
  return channelStripHeights[channelId] ?? DEFAULT_CHANNEL_STRIP_HEIGHT
}

function reorderArray(array, fromIndex, toIndex) {
  if (fromIndex === toIndex) return array
  const next = [...array]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function getChannelIndexAtCanvasY(clientY, canvas, channels, channelStripHeights) {
  const rect = canvas.getBoundingClientRect()
  if (rect.height <= 0 || channels.length === 0) return 0

  const scaleY = canvas.height / rect.height
  const canvasY = (clientY - rect.top) * scaleY
  let offset = getDetailChannelsTop()

  for (let i = 0; i < channels.length; i += 1) {
    const height = getChannelStripHeight(channelStripHeights, channels[i].id)
    if (canvasY < offset + height / 2) return i
    offset += height
  }

  return channels.length - 1
}

function drawOverviewStrip(ctx, {
  channel,
  format,
  padding,
  plotWidth,
  width,
  yTop,
  stripHeight,
  totalDuration,
  viewStart,
  viewEnd,
}) {
  const yBottom = yTop + stripHeight
  const plotTop = yTop + 4
  const plotBottom = yBottom - 4
  const innerHeight = plotBottom - plotTop

  ctx.strokeStyle = '#cbd5e0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padding.left, yBottom)
  ctx.lineTo(width - padding.right, yBottom)
  ctx.stroke()

  clipToChannelStrip(ctx, padding.left, plotWidth, yTop, stripHeight)

  if (format === DEPICTION_FORMATS.BINARY_MASK) {
    const segments = getBinaryMaskSegments(channel.data, 0, channel.data.length, plotWidth)
    drawBinaryMaskSegments(
      ctx,
      segments,
      padding.left,
      plotWidth,
      plotTop,
      plotBottom,
      'rgba(229, 62, 62, 0.35)',
      'rgba(229, 62, 62, 0.6)'
    )
  } else {
    const samples = downsampleRange(channel.data, 0, channel.data.length, plotWidth)
    if (samples.length > 0) {
      let minVal = Infinity
      let maxVal = -Infinity
      samples.forEach(({ min, max }) => {
        if (min < minVal) minVal = min
        if (max > maxVal) maxVal = max
      })
      const range = maxVal - minVal || 1

      ctx.strokeStyle = '#718096'
      ctx.lineWidth = 1
      ctx.beginPath()
      samples.forEach((point, index) => {
        const x = padding.left + (index / Math.max(samples.length - 1, 1)) * plotWidth
        const yMin = plotBottom - ((point.min - minVal) / range) * innerHeight
        const yMax = plotBottom - ((point.max - minVal) / range) * innerHeight

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
    }
  }

  const x1 = padding.left + (viewStart / totalDuration) * plotWidth
  const x2 = padding.left + (viewEnd / totalDuration) * plotWidth
  const highlightWidth = Math.max(x2 - x1, 2)

  ctx.fillStyle = 'rgba(102, 126, 234, 0.18)'
  ctx.fillRect(x1, plotTop, highlightWidth, innerHeight)
  ctx.strokeStyle = '#667eea'
  ctx.lineWidth = 2
  ctx.strokeRect(x1, plotTop, highlightWidth, innerHeight)

  ctx.restore()
}

function getCanvasHeightForPanel(panelHeight) {
  return Math.max(
    MIN_PANEL_HEIGHT - PANEL_RESIZE_HANDLE_HEIGHT,
    panelHeight - PANEL_RESIZE_HANDLE_HEIGHT
  )
}

function getPlotHeightForPanel(panelHeight) {
  return Math.max(
    0,
    getCanvasHeightForPanel(panelHeight)
      - PLOT_PADDING.top
      - PLOT_PADDING.bottom
      - OVERVIEW_STRIP_HEIGHT
  )
}

function distributeChannelStripHeights(activeChannels, channelStripHeights, targetPlotHeight) {
  if (activeChannels.length === 0) return channelStripHeights

  const weights = activeChannels.map((channel) =>
    Math.max(MIN_CHANNEL_STRIP_HEIGHT, getChannelStripHeight(channelStripHeights, channel.id))
  )
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const minTotal = activeChannels.length * MIN_CHANNEL_STRIP_HEIGHT
  const plotHeight = Math.max(targetPlotHeight, minTotal)

  const next = { ...channelStripHeights }
  let assigned = 0

  activeChannels.forEach((channel, index) => {
    if (index === activeChannels.length - 1) {
      next[channel.id] = Math.max(MIN_CHANNEL_STRIP_HEIGHT, plotHeight - assigned)
      return
    }

    const height = Math.max(
      MIN_CHANNEL_STRIP_HEIGHT,
      (weights[index] / weightSum) * plotHeight
    )
    next[channel.id] = height
    assigned += height
  })

  return next
}

function getVisibleValueRange(minVal, maxVal, yZoom) {
  const dataCenter = (minVal + maxVal) / 2
  const dataRange = maxVal - minVal || 1
  const visibleRange = dataRange / yZoom
  return {
    displayMin: dataCenter - visibleRange / 2,
    displayMax: dataCenter + visibleRange / 2,
    displayRange: visibleRange,
  }
}

function clipToChannelStrip(ctx, xLeft, plotWidth, yTop, stripHeight) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(xLeft, yTop, plotWidth, stripHeight)
  ctx.clip()
}

function getChannelStripLayouts(activeChannels, channelStripHeights, canvasHeight) {
  if (activeChannels.length === 0 || canvasHeight <= 0) return []

  let offset = getDetailChannelsTop()
  return activeChannels.map((channel) => {
    const height = getChannelStripHeight(channelStripHeights, channel.id)
    const layout = {
      channel,
      topPercent: (offset / canvasHeight) * 100,
      heightPercent: (height / canvasHeight) * 100,
    }
    offset += height
    return layout
  })
}

function getOverviewStripLayout(canvasHeight) {
  if (canvasHeight <= 0) return null

  return {
    topPercent: (PLOT_PADDING.top / canvasHeight) * 100,
    heightPercent: (OVERVIEW_STRIP_HEIGHT / canvasHeight) * 100,
  }
}

function getChannelBoundaryPercents(activeChannels, channelStripHeights, canvasHeight) {
  if (activeChannels.length < 2 || canvasHeight <= 0) return []

  let offset = getDetailChannelsTop()
  const boundaries = []

  for (let i = 0; i < activeChannels.length - 1; i += 1) {
    offset += getChannelStripHeight(channelStripHeights, activeChannels[i].id)
    boundaries.push({
      channelIndex: i,
      percent: (offset / canvasHeight) * 100,
    })
  }

  return boundaries
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

function mapIdsToLabels(idRecord, channelById) {
  const byLabel = {}
  Object.entries(idRecord ?? {}).forEach(([id, value]) => {
    const label = channelById[id]?.label ?? channelById[Number(id)]?.label
    if (label) byLabel[label] = value
  })
  return byLabel
}

function normalizeChannelLabelRecord(record) {
  return Object.fromEntries(
    Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b))
  )
}

function buildViewParams({
  edfData,
  selectedChannels,
  channelFormats,
  binaryMaskOverlays,
  channelStripHeights,
  channelYZoom,
  overviewChannelId,
  windowSeconds,
  viewStart,
  panelHeight,
  activeTab,
}) {
  const channelById = Object.fromEntries(edfData.channels.map((ch) => [ch.id, ch]))

  const selectedChannelLabels = selectedChannels
    .map((id) => channelById[id]?.label)
    .filter(Boolean)

  const channelFormatsByLabel = {}
  Object.entries(channelFormats).forEach(([id, format]) => {
    const label = channelById[Number(id)]?.label ?? channelById[id]?.label
    if (label) channelFormatsByLabel[label] = format
  })

  const resolvedOverlays = { ...binaryMaskOverlays }
  selectedChannels.forEach((id) => {
    if ((channelFormats[id] ?? DEPICTION_FORMATS.SEQUENCE) !== DEPICTION_FORMATS.BINARY_MASK) return
    if (!resolvedOverlays[id]?.length) {
      resolvedOverlays[id] = getDefaultBinaryMaskOverlayTargets(id, selectedChannels, channelFormats)
    }
  })

  return {
    selectedChannelLabels,
    channelDisplayOrderLabels: selectedChannelLabels,
    overviewChannelLabel: channelById[overviewChannelId]?.label ?? null,
    channelFormats: channelFormatsByLabel,
    binaryMaskOverlaysByLabel: mapOverlayIdsToLabels(resolvedOverlays, channelById),
    channelStripHeightsByLabel: mapIdsToLabels(channelStripHeights, channelById),
    channelYZoomByLabel: mapIdsToLabels(channelYZoom, channelById),
    windowSeconds,
    viewStart,
    panelHeight,
    activeTab,
  }
}

function resolveActiveTab(params) {
  if (params.activeTab && Object.values(VIEWER_TABS).includes(params.activeTab)) {
    return params.activeTab
  }
  return params.channelPanelOpen === false ? VIEWER_TABS.VIEWER : VIEWER_TABS.CHANNELS
}

function normalizeViewParams(params) {
  const channelDisplayOrderLabels = [
    ...(params.channelDisplayOrderLabels ?? params.selectedChannelLabels ?? []),
  ]

  return {
    selectedChannelLabels: [...(params.selectedChannelLabels ?? [])],
    channelDisplayOrderLabels,
    overviewChannelLabel: params.overviewChannelLabel ?? null,
    channelFormats: normalizeChannelLabelRecord(params.channelFormats),
    binaryMaskOverlaysByLabel: normalizeOverlayLabelRecord(params.binaryMaskOverlaysByLabel),
    channelStripHeightsByLabel: normalizeChannelLabelRecord(params.channelStripHeightsByLabel),
    channelYZoomByLabel: normalizeChannelLabelRecord(params.channelYZoomByLabel),
    windowSeconds: params.windowSeconds,
    viewStart: params.viewStart,
    panelHeight: params.panelHeight ?? DEFAULT_PANEL_HEIGHT,
    activeTab: resolveActiveTab(params),
  }
}

function resolveFullViewParams(params, edfData, totalDuration) {
  const applied = applyViewParams(params, edfData, totalDuration)
  return buildViewParams({
    edfData,
    selectedChannels: applied.selectedChannels,
    channelFormats: applied.channelFormats,
    binaryMaskOverlays: applied.binaryMaskOverlays,
    channelStripHeights: applied.channelStripHeights,
    channelYZoom: applied.channelYZoom,
    overviewChannelId: applied.overviewChannelId,
    windowSeconds: applied.windowSeconds,
    viewStart: applied.viewStart,
    panelHeight: applied.panelHeight,
    activeTab: applied.activeTab,
  })
}

function areViewParamsEqual(a, b, edfData, totalDuration) {
  const resolvedA = normalizeViewParams(resolveFullViewParams(a, edfData, totalDuration))
  const resolvedB = normalizeViewParams(resolveFullViewParams(b, edfData, totalDuration))
  return JSON.stringify(resolvedA) === JSON.stringify(resolvedB)
}

function applyViewParams(params, edfData, totalDuration) {
  const labelToId = Object.fromEntries(edfData.channels.map((ch) => [ch.label, ch.id]))
  const binaryChannelIds = new Set(
    edfData.channels.filter((ch) => isBinarySignal(ch.data)).map((ch) => ch.id)
  )

  const orderLabels = (params.channelDisplayOrderLabels?.length
    ? params.channelDisplayOrderLabels
    : params.selectedChannelLabels) ?? []

  const selected = orderLabels
    .map((label) => labelToId[label])
    .filter((id) => id !== undefined)

  const formats = {}
  Object.entries(params.channelFormats ?? {}).forEach(([label, format]) => {
    const id = labelToId[label]
    if (id === undefined) return
    if (format === DEPICTION_FORMATS.BINARY_MASK && !binaryChannelIds.has(id)) return
    formats[id] = format
  })

  const binaryMaskOverlays = {}
  Object.entries(params.binaryMaskOverlaysByLabel ?? {}).forEach(([maskLabel, targetLabels]) => {
    const maskId = labelToId[maskLabel]
    if (maskId === undefined) return
    if ((formats[maskId] ?? DEPICTION_FORMATS.SEQUENCE) !== DEPICTION_FORMATS.BINARY_MASK) return

    const targetIds = (targetLabels ?? [])
      .map((label) => labelToId[label])
      .filter((id) => id !== undefined && id !== maskId)

    if (targetIds.length > 0) {
      binaryMaskOverlays[maskId] = targetIds
    }
  })

  const stripHeights = {}
  Object.entries(params.channelStripHeightsByLabel ?? {}).forEach(([label, height]) => {
    const id = labelToId[label]
    if (id === undefined) return
    stripHeights[id] = Math.max(MIN_CHANNEL_STRIP_HEIGHT, height)
  })

  const yZoom = {}
  Object.entries(params.channelYZoomByLabel ?? {}).forEach(([label, zoom]) => {
    const id = labelToId[label]
    if (id === undefined) return
    yZoom[id] = Math.max(MIN_Y_ZOOM, Math.min(MAX_Y_ZOOM, zoom))
  })

  const nextWindowSeconds = Math.max(
    MIN_WINDOW_SECONDS,
    Math.min(totalDuration, params.windowSeconds ?? 60)
  )
  const nextViewStart = clampViewStart(
    params.viewStart ?? 0,
    nextWindowSeconds,
    totalDuration
  )

  const selectedChannelsResult = selected.length > 0 ? selected : getDefaultSelection(edfData.channels)

  let overviewChannelId = params.overviewChannelLabel
    ? labelToId[params.overviewChannelLabel]
    : undefined
  if (overviewChannelId === undefined) {
    overviewChannelId = getDefaultOverviewChannelId(edfData.channels, selectedChannelsResult)
  }

  Object.entries(formats).forEach(([id, format]) => {
    if (format !== DEPICTION_FORMATS.BINARY_MASK) return
    const channelId = Number(id)
    if (!binaryMaskOverlays[channelId]?.length) {
      binaryMaskOverlays[channelId] = getDefaultBinaryMaskOverlayTargets(
        channelId,
        selectedChannelsResult,
        formats
      )
    }
  })

  return {
    selectedChannels: selectedChannelsResult,
    channelFormats: formats,
    binaryMaskOverlays,
    channelStripHeights: stripHeights,
    channelYZoom: yZoom,
    overviewChannelId,
    windowSeconds: nextWindowSeconds,
    viewStart: nextViewStart,
    panelHeight: Math.max(MIN_PANEL_HEIGHT, params.panelHeight ?? DEFAULT_PANEL_HEIGHT),
    activeTab: resolveActiveTab(params),
  }
}

const SignalViewer = ({ edfData, onBack }) => {
  const canvasRef = useRef(null)
  const canvasWrapRef = useRef(null)
  const containerRef = useRef(null)
  const [selectedChannels, setSelectedChannels] = useState(() =>
    getDefaultSelection(edfData.channels)
  )
  const [channelFormats, setChannelFormats] = useState({})
  const [binaryMaskOverlays, setBinaryMaskOverlays] = useState({})
  const [windowSeconds, setWindowSeconds] = useState(60)
  const [viewStart, setViewStart] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 400 })
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT)
  const [channelStripHeights, setChannelStripHeights] = useState({})
  const [channelYZoom, setChannelYZoom] = useState({})
  const [overviewChannelId, setOverviewChannelId] = useState(() =>
    getDefaultOverviewChannelId(edfData.channels, getDefaultSelection(edfData.channels))
  )
  const [activeTab, setActiveTab] = useState(VIEWER_TABS.VIEWER)
  const [savedPresets, setSavedPresets] = useState([])
  const [presetName, setPresetName] = useState('')
  const [presetMessage, setPresetMessage] = useState('')
  const [presetError, setPresetError] = useState('')
  const [presetsLoading, setPresetsLoading] = useState(true)
  const [loadedPresetId, setLoadedPresetId] = useState(null)
  const [reorderingChannelId, setReorderingChannelId] = useState(null)
  const [edfSaveMessage, setEdfSaveMessage] = useState('')
  const [edfSaveError, setEdfSaveError] = useState('')
  const [isSavingEdf, setIsSavingEdf] = useState(false)

  const totalDuration = edfData.totalDuration
  const viewEnd = Math.min(viewStart + windowSeconds, totalDuration)

  const channelById = useMemo(
    () => Object.fromEntries(edfData.channels.map((ch) => [ch.id, ch])),
    [edfData.channels]
  )

  const activeChannels = useMemo(
    () => selectedChannels.map((id) => channelById[id]).filter(Boolean),
    [selectedChannels, channelById]
  )

  const channelsForSelectionList = useMemo(() => {
    const selectedSet = new Set(selectedChannels)
    const selectedOrdered = selectedChannels
      .map((id) => channelById[id])
      .filter(Boolean)
    const unselected = edfData.channels.filter((ch) => !selectedSet.has(ch.id))
    return [...selectedOrdered, ...unselected]
  }, [edfData.channels, selectedChannels, channelById])

  const canvasHeight = useMemo(
    () => getCanvasHeightForPanel(panelHeight),
    [panelHeight]
  )

  const activeChannelKey = useMemo(
    () => activeChannels.map((channel) => channel.id).join(','),
    [activeChannels]
  )

  const channelBoundaries = useMemo(
    () => getChannelBoundaryPercents(activeChannels, channelStripHeights, canvasHeight),
    [activeChannels, channelStripHeights, canvasHeight]
  )

  const channelStripLayouts = useMemo(
    () => getChannelStripLayouts(activeChannels, channelStripHeights, canvasHeight),
    [activeChannels, channelStripHeights, canvasHeight]
  )

  const overviewStripLayout = useMemo(
    () => getOverviewStripLayout(canvasHeight),
    [canvasHeight]
  )

  const overviewChannel = useMemo(() => {
    if (overviewChannelId !== null && channelById[overviewChannelId]) {
      return channelById[overviewChannelId]
    }
    const fallbackId = getDefaultOverviewChannelId(edfData.channels, selectedChannels)
    return fallbackId !== null ? channelById[fallbackId] ?? null : null
  }, [overviewChannelId, channelById, edfData.channels, selectedChannels])

  const panelHeightRef = useRef(panelHeight)
  const channelStripHeightsRef = useRef(channelStripHeights)
  const activeChannelsRef = useRef(activeChannels)
  const selectedChannelsRef = useRef(selectedChannels)
  const dragStateRef = useRef(null)
  const onDragMoveRef = useRef(() => {})
  const endDragRef = useRef(() => {})

  useEffect(() => {
    panelHeightRef.current = panelHeight
  }, [panelHeight])

  useEffect(() => {
    channelStripHeightsRef.current = channelStripHeights
  }, [channelStripHeights])

  useEffect(() => {
    activeChannelsRef.current = activeChannels
  }, [activeChannels])

  useEffect(() => {
    selectedChannelsRef.current = selectedChannels
  }, [selectedChannels])

  useEffect(() => {
    if (!activeChannelKey) return

    const targetPlotHeight = getPlotHeightForPanel(panelHeightRef.current)
    setChannelStripHeights((prev) =>
      distributeChannelStripHeights(activeChannels, prev, targetPlotHeight)
    )
  }, [activeChannelKey, activeChannels])

  const binaryChannelIds = useMemo(
    () => new Set(edfData.channels.filter((ch) => isBinarySignal(ch.data)).map((ch) => ch.id)),
    [edfData]
  )

  const getChannelFormat = useCallback(
    (channelId) => channelFormats[channelId] ?? DEPICTION_FORMATS.SEQUENCE,
    [channelFormats]
  )

  const overlayCandidateChannels = useMemo(
    () =>
      activeChannels.filter(
        (channel) => getChannelFormat(channel.id) === DEPICTION_FORMATS.SEQUENCE
      ),
    [activeChannels, getChannelFormat]
  )

  const binaryMaskChannels = useMemo(
    () =>
      activeChannels.filter(
        (channel) => getChannelFormat(channel.id) === DEPICTION_FORMATS.BINARY_MASK
      ),
    [activeChannels, getChannelFormat]
  )

  const getBinaryMaskOverlayTargets = useCallback(
    (maskChannelId) => {
      if (binaryMaskOverlays[maskChannelId]) {
        return binaryMaskOverlays[maskChannelId]
      }
      return getDefaultBinaryMaskOverlayTargets(maskChannelId, selectedChannels, channelFormats)
    },
    [binaryMaskOverlays, selectedChannels, channelFormats]
  )

  const refreshPresets = useCallback(async () => {
    try {
      const presets = await listViewPresets()
      setSavedPresets(presets)
      return presets
    } catch (error) {
      setPresetError(error.message || 'Failed to load saved presets')
      return []
    } finally {
      setPresetsLoading(false)
    }
  }, [])

  const applyPresetToViewer = useCallback((preset, message) => {
    const next = applyViewParams(preset.params, edfData, totalDuration)
    setSelectedChannels(next.selectedChannels)
    setChannelFormats(next.channelFormats)
    setBinaryMaskOverlays(next.binaryMaskOverlays)
    setChannelStripHeights(next.channelStripHeights)
    setChannelYZoom(next.channelYZoom)
    setOverviewChannelId(next.overviewChannelId)
    setWindowSeconds(next.windowSeconds)
    setViewStart(next.viewStart)
    setPanelHeight(next.panelHeight)
    setLoadedPresetId(preset.id)
    setActiveTab(next.activeTab)
    setPresetError('')
    if (message) setPresetMessage(message)
  }, [edfData, totalDuration])

  useEffect(() => {
    let cancelled = false

    async function loadInitialPresets() {
      setPresetsLoading(true)
      setPresetError('')
      setPresetMessage('')

      const presets = await refreshPresets()
      if (cancelled) return

      if (presets.length > 0) {
        const newest = presets[0]
        applyPresetToViewer(newest, `Loaded newest view format "${newest.name}"`)
      }
    }

    loadInitialPresets()

    return () => {
      cancelled = true
    }
  }, [edfData, totalDuration, refreshPresets, applyPresetToViewer])

  const getCurrentViewParams = useCallback(
    () =>
      buildViewParams({
        edfData,
        selectedChannels,
        channelFormats,
        binaryMaskOverlays,
        channelStripHeights,
        channelYZoom,
        overviewChannelId,
        windowSeconds,
        viewStart,
        panelHeight,
        activeTab,
      }),
    [
      edfData,
      selectedChannels,
      channelFormats,
      binaryMaskOverlays,
      channelStripHeights,
      channelYZoom,
      overviewChannelId,
      windowSeconds,
      viewStart,
      panelHeight,
      activeTab,
    ]
  )

  const loadedPreset = useMemo(
    () => savedPresets.find((preset) => preset.id === loadedPresetId) ?? null,
    [savedPresets, loadedPresetId]
  )

  const isLoadedPresetModified = useMemo(() => {
    if (!loadedPreset) return false
    return !areViewParamsEqual(getCurrentViewParams(), loadedPreset.params, edfData, totalDuration)
  }, [
    loadedPreset,
    getCurrentViewParams,
    edfData,
    totalDuration,
    selectedChannels,
    channelFormats,
    binaryMaskOverlays,
    channelStripHeights,
    channelYZoom,
    overviewChannelId,
    windowSeconds,
    viewStart,
    panelHeight,
    activeTab,
  ])

  const handleSavePreset = async () => {
    setPresetError('')
    setPresetMessage('')

    try {
      const id = await saveViewPreset(presetName, getCurrentViewParams())
      await refreshPresets()
      setLoadedPresetId(id)
      setPresetMessage(`Saved view format "${presetName.trim()}"`)
      setPresetName('')
    } catch (error) {
      setPresetError(error.message || 'Failed to save preset')
    }
  }

  const handleLoadPreset = (preset) => {
    applyPresetToViewer(preset, `Loaded view format "${preset.name}"`)
  }

  const handleUpdateLoadedPreset = async () => {
    if (!loadedPreset) return

    setPresetError('')
    setPresetMessage('')

    try {
      await updateViewPresetById(loadedPreset.id, getCurrentViewParams())
      await refreshPresets()
      setPresetMessage(`Updated view format "${loadedPreset.name}"`)
    } catch (error) {
      setPresetError(error.message || 'Failed to update preset')
    }
  }

  const handleDeletePreset = async (preset) => {
    setPresetError('')
    setPresetMessage('')

    try {
      await deleteViewPreset(preset.id)
      if (loadedPresetId === preset.id) {
        setLoadedPresetId(null)
      }
      await refreshPresets()
      setPresetMessage(`Deleted view format "${preset.name}"`)
    } catch (error) {
      setPresetError(error.message || 'Failed to delete preset')
    }
  }

  const handleSaveEdf = async () => {
    setEdfSaveError('')
    setEdfSaveMessage('')

    if (!edfData.rawBuffer) {
      setEdfSaveError('No raw file data available to save')
      return
    }

    setIsSavingEdf(true)
    try {
      const id = await saveEdfRecord(
        edfData.fileName,
        edfData.rawBuffer,
        buildEdfSummary(edfData)
      )
      setEdfSaveMessage(`Saved "${edfData.fileName}" to IndexedDB`)
    } catch (error) {
      setEdfSaveError(error.message || 'Failed to save EDF')
    } finally {
      setIsSavingEdf(false)
    }
  }

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

  useEffect(() => {
    if (activeTab !== VIEWER_TABS.VIEWER) return

    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    if (width > 0) {
      setCanvasSize({ width, height: canvasHeight })
    }
  }, [activeTab, canvasHeight])

  const drawSignals = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const padding = PLOT_PADDING
    const plotWidth = width - padding.left - padding.right

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const activeChannelsToDraw = selectedChannels
      .map((id) => channelById[id])
      .filter(Boolean)

    if (overviewChannel) {
      drawOverviewStrip(ctx, {
        channel: overviewChannel,
        format: getChannelFormat(overviewChannel.id),
        padding,
        plotWidth,
        width,
        yTop: PLOT_PADDING.top,
        stripHeight: OVERVIEW_STRIP_HEIGHT,
        totalDuration,
        viewStart,
        viewEnd,
      })
    }

    if (activeChannelsToDraw.length === 0) {
      ctx.fillStyle = '#718096'
      ctx.font = '16px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Select one or more channels to view signals', width / 2, height / 2)
      return
    }

    const binaryMaskSegmentsByChannel = binaryMaskChannels.map((channel, maskIndex) => ({
      channel,
      maskIndex,
      color: getBinaryMaskColor(maskIndex),
      overlayTargets: getBinaryMaskOverlayTargets(channel.id),
      segments: getBinaryMaskSegments(
        channel.data,
        viewStart * channel.sampleRate,
        viewEnd * channel.sampleRate,
        plotWidth
      ),
    }))

    let yOffset = getDetailChannelsTop()

    activeChannelsToDraw.forEach((channel, stripIndex) => {
      const stripHeight = getChannelStripHeight(channelStripHeights, channel.id)
      const yTop = yOffset
      const yBottom = yTop + stripHeight
      yOffset = yBottom
      const yMid = (yTop + yBottom) / 2
      const format = getChannelFormat(channel.id)

      ctx.strokeStyle = '#edf2f7'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padding.left, yMid)
      ctx.lineTo(width - padding.right, yMid)
      ctx.stroke()

      const startSample = viewStart * channel.sampleRate
      const endSample = viewEnd * channel.sampleRate

      clipToChannelStrip(ctx, padding.left, plotWidth, yTop, stripHeight)

      binaryMaskSegmentsByChannel.forEach(({ channel: maskChannel, segments, color, overlayTargets }) => {
        if (maskChannel.id === channel.id && format === DEPICTION_FORMATS.BINARY_MASK) {
          return
        }

        if (!overlayTargets.includes(channel.id)) {
          return
        }

        drawBinaryMaskSegments(
          ctx,
          segments,
          padding.left,
          plotWidth,
          yTop + 2,
          yBottom - 2,
          color.fill,
          color.stroke
        )
      })

      if (format === DEPICTION_FORMATS.BINARY_MASK) {
        const maskIndex = binaryMaskChannels.findIndex((maskChannel) => maskChannel.id === channel.id)
        const color = getBinaryMaskColor(Math.max(maskIndex, 0))
        const ownSegments = getBinaryMaskSegments(channel.data, startSample, endSample, plotWidth)
        drawBinaryMaskSegments(
          ctx,
          ownSegments,
          padding.left,
          plotWidth,
          yTop + 2,
          yBottom - 2,
          color.strong,
          color.stroke
        )

        ctx.fillStyle = '#a0aec0'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('0 / 1 mask', padding.left + 4, yTop + 4)
        ctx.restore()
        return
      }

      const samples = downsampleRange(channel.data, startSample, endSample, plotWidth)

      if (samples.length === 0) {
        ctx.restore()
        return
      }

      let minVal = Infinity
      let maxVal = -Infinity
      samples.forEach(({ min, max }) => {
        if (min < minVal) minVal = min
        if (max > maxVal) maxVal = max
      })

      const yZoom = channelYZoom[channel.id] ?? DEFAULT_Y_ZOOM
      const { displayMin, displayMax, displayRange } = getVisibleValueRange(minVal, maxVal, yZoom)
      const color = CHANNEL_COLORS[stripIndex % CHANNEL_COLORS.length]

      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()

      samples.forEach((point, index) => {
        const x = padding.left + (index / Math.max(samples.length - 1, 1)) * plotWidth
        const yMin = yBottom - 8 - ((point.min - displayMin) / displayRange) * (stripHeight - 16)
        const yMax = yBottom - 8 - ((point.max - displayMin) / displayRange) * (stripHeight - 16)

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
      const zoomLabel = yZoom !== DEFAULT_Y_ZOOM ? ` · ${yZoom.toFixed(1)}x` : ''
      ctx.fillText(
        `${displayMin.toFixed(1)} – ${displayMax.toFixed(1)}${zoomLabel}`,
        padding.left + 4,
        yTop + 4
      )
      ctx.restore()
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
  }, [edfData, selectedChannels, channelById, channelFormats, channelStripHeights, channelYZoom, overviewChannel, binaryMaskChannels, getChannelFormat, getBinaryMaskOverlayTargets, viewStart, viewEnd, totalDuration, canvasSize.width, canvasSize.height])

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

    if (format === DEPICTION_FORMATS.BINARY_MASK) {
      setBinaryMaskOverlays((prev) => {
        if (prev[channelId]?.length) return prev

        const nextFormats = {
          ...channelFormats,
          [channelId]: format,
        }

        return {
          ...prev,
          [channelId]: getDefaultBinaryMaskOverlayTargets(channelId, selectedChannels, nextFormats),
        }
      })
    }
  }

  const handleBinaryMaskOverlayToggle = (maskChannelId, targetChannelId, enabled) => {
    setBinaryMaskOverlays((prev) => {
      const current = prev[maskChannelId] ?? getDefaultBinaryMaskOverlayTargets(
        maskChannelId,
        selectedChannels,
        channelFormats
      )
      const nextTargets = enabled
        ? [...new Set([...current, targetChannelId])]
        : current.filter((id) => id !== targetChannelId)

      return {
        ...prev,
        [maskChannelId]: nextTargets,
      }
    })
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

  const navigateOverviewToClientX = useCallback((clientX) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0) return

    const scaleX = canvas.width / rect.width
    const mouseX = (clientX - rect.left) * scaleX
    const plotWidth = canvas.width - PLOT_PADDING.left - PLOT_PADDING.right
    if (plotWidth <= 0) return

    const fraction = Math.max(0, Math.min(1, (mouseX - PLOT_PADDING.left) / plotWidth))
    const time = fraction * totalDuration
    setViewStart(clampViewStart(time - windowSeconds / 2, windowSeconds, totalDuration))
  }, [totalDuration, windowSeconds])

  const handleOverviewClick = useCallback((event) => {
    navigateOverviewToClientX(event.clientX)
  }, [navigateOverviewToClientX])

  const handleOverviewWheel = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0) return

    const scaleX = canvas.width / rect.width
    const mouseX = (event.clientX - rect.left) * scaleX
    const plotWidth = canvas.width - PLOT_PADDING.left - PLOT_PADDING.right
    if (plotWidth <= 0) return

    const fraction = Math.max(0, Math.min(1, (mouseX - PLOT_PADDING.left) / plotWidth))
    const timeAtMouse = fraction * totalDuration
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
  }, [totalDuration, windowSeconds])

  const handleChannelYZoomWheel = useCallback((event, channelId) => {
    const zoomFactor = Y_WHEEL_ZOOM_BASE ** (-event.deltaY / 100)
    setChannelYZoom((prev) => {
      const current = prev[channelId] ?? DEFAULT_Y_ZOOM
      const next = Math.max(MIN_Y_ZOOM, Math.min(MAX_Y_ZOOM, current * zoomFactor))
      if (next === current) return prev
      return { ...prev, [channelId]: next }
    })
  }, [])

  const handleChannelYZoomWheelRef = useRef(handleChannelYZoomWheel)
  handleChannelYZoomWheelRef.current = handleChannelYZoomWheel

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap) return undefined

    const handleWheel = (event) => {
      const region = event.target.closest('.channel-yzoom-region')
      if (!region) return

      const { channelId } = region.dataset
      if (!channelId) return

      event.preventDefault()
      event.stopPropagation()
      handleChannelYZoomWheelRef.current(event, channelId)
    }

    wrap.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => wrap.removeEventListener('wheel', handleWheel, { capture: true })
  }, [activeTab, channelStripLayouts.length])

  const endDrag = useCallback(() => {
    const wasReordering = dragStateRef.current?.type === 'channel-reorder'
    dragStateRef.current = null
    document.body.classList.remove('signal-viewer-dragging')
    document.body.classList.remove('signal-viewer-reordering')
    document.removeEventListener('mousemove', onDragMoveRef.current)
    document.removeEventListener('mouseup', endDragRef.current)
    if (wasReordering) {
      setReorderingChannelId(null)
    }
  }, [])

  endDragRef.current = endDrag

  const onDragMove = useCallback((event) => {
    const drag = dragStateRef.current
    if (!drag) return

    if (drag.type === 'panel') {
      const delta = event.clientY - drag.startY
      const nextPanelHeight = Math.max(MIN_PANEL_HEIGHT, drag.startHeight + delta)
      const targetPlotHeight = getPlotHeightForPanel(nextPanelHeight)

      setPanelHeight(nextPanelHeight)
      setChannelStripHeights(
        distributeChannelStripHeights(
          activeChannelsRef.current,
          drag.startStripHeights,
          targetPlotHeight
        )
      )
      return
    }

    if (drag.type === 'channel') {
      const canvas = canvasRef.current
      const channels = activeChannelsRef.current
      if (!canvas || channels.length <= drag.channelIndex + 1) return

      const rect = canvas.getBoundingClientRect()
      if (rect.height <= 0) return

      const scaleY = canvas.height / rect.height
      const deltaCanvas = (event.clientY - drag.startY) * scaleY
      const upperId = channels[drag.channelIndex].id
      const lowerId = channels[drag.channelIndex + 1].id
      const clampedDelta = Math.max(
        MIN_CHANNEL_STRIP_HEIGHT - drag.startUpperHeight,
        Math.min(deltaCanvas, drag.startLowerHeight - MIN_CHANNEL_STRIP_HEIGHT)
      )

      if (clampedDelta === 0) return

      setChannelStripHeights((prev) => ({
        ...prev,
        [upperId]: drag.startUpperHeight + clampedDelta,
        [lowerId]: drag.startLowerHeight - clampedDelta,
      }))
      return
    }

    if (drag.type === 'channel-reorder') {
      const canvas = canvasRef.current
      const channels = activeChannelsRef.current
      if (!canvas || channels.length < 2) return

      const targetIndex = getChannelIndexAtCanvasY(
        event.clientY,
        canvas,
        channels,
        channelStripHeightsRef.current
      )
      const fromIndex = selectedChannelsRef.current.indexOf(drag.channelId)
      if (fromIndex === -1 || fromIndex === targetIndex) return

      const next = reorderArray(selectedChannelsRef.current, fromIndex, targetIndex)
      selectedChannelsRef.current = next
      setSelectedChannels(next)
    }
  }, [])

  onDragMoveRef.current = onDragMove

  const startPanelResize = useCallback((event) => {
    event.preventDefault()
    dragStateRef.current = {
      type: 'panel',
      startY: event.clientY,
      startHeight: panelHeightRef.current,
      startStripHeights: { ...channelStripHeightsRef.current },
    }
    document.body.classList.add('signal-viewer-dragging')
    document.addEventListener('mousemove', onDragMoveRef.current)
    document.addEventListener('mouseup', endDragRef.current)
  }, [])

  const startChannelReorder = useCallback((event, channelId) => {
    event.preventDefault()
    event.stopPropagation()

    dragStateRef.current = {
      type: 'channel-reorder',
      channelId,
      startY: event.clientY,
    }
    setReorderingChannelId(channelId)
    document.body.classList.add('signal-viewer-dragging')
    document.body.classList.add('signal-viewer-reordering')
    document.addEventListener('mousemove', onDragMoveRef.current)
    document.addEventListener('mouseup', endDragRef.current)
  }, [])

  const startChannelResize = useCallback((event, channelIndex) => {
    event.preventDefault()
    event.stopPropagation()

    const channels = activeChannelsRef.current
    if (channels.length <= channelIndex + 1) return

    const heights = channelStripHeightsRef.current
    const upperId = channels[channelIndex].id
    const lowerId = channels[channelIndex + 1].id

    dragStateRef.current = {
      type: 'channel',
      channelIndex,
      startY: event.clientY,
      startUpperHeight: getChannelStripHeight(heights, upperId),
      startLowerHeight: getChannelStripHeight(heights, lowerId),
    }
    document.body.classList.add('signal-viewer-dragging')
    document.addEventListener('mousemove', onDragMoveRef.current)
    document.addEventListener('mouseup', endDragRef.current)
  }, [])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onDragMoveRef.current)
      document.removeEventListener('mouseup', endDragRef.current)
      document.body.classList.remove('signal-viewer-dragging')
      document.body.classList.remove('signal-viewer-reordering')
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const handleWheel = (event) => {
      event.preventDefault()

      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0) return

      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const mouseX = (event.clientX - rect.left) * scaleX
      const mouseY = (event.clientY - rect.top) * scaleY
      const plotWidth = canvas.width - PLOT_PADDING.left - PLOT_PADDING.right
      if (plotWidth <= 0) return

      const fraction = Math.max(0, Math.min(1, (mouseX - PLOT_PADDING.left) / plotWidth))
      const inOverview = mouseY >= PLOT_PADDING.top && mouseY < getDetailChannelsTop()
      const timeAtMouse = inOverview
        ? fraction * totalDuration
        : viewStart + fraction * windowSeconds
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
          {edfSaveMessage ? <span className="edf-save-message">{edfSaveMessage}</span> : null}
          {edfSaveError ? <span className="edf-save-error">{edfSaveError}</span> : null}
          <button
            className="btn btn-primary"
            onClick={handleSaveEdf}
            disabled={isSavingEdf || !edfData.rawBuffer}
            type="button"
            title={edfData.rawBuffer ? 'Save raw EDF bytes to IndexedDB' : 'Raw file data unavailable'}
          >
            {isSavingEdf ? 'Saving...' : 'Save EDF'}
          </button>
          <button className="btn btn-secondary" onClick={onBack} type="button">
            ← Back to Upload
          </button>
        </div>
      </div>

      <div className="viewer-content">
        <div className="viewer-tabs" role="tablist" aria-label="Viewer sections">
          {VIEWER_TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`viewer-tab${activeTab === tab.id ? ' viewer-tab-active' : ''}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.id === VIEWER_TABS.CHANNELS ? ` (${selectedChannels.length})` : ''}
            </button>
          ))}
        </div>

        <div className="viewer-tab-panels">
          <div
            className="viewer-tab-panel viewer-tab-panel-viewer"
            role="tabpanel"
            hidden={activeTab !== VIEWER_TABS.VIEWER}
          >
            <div className="signal-display">
              <div
                className="signal-canvas-container"
                ref={containerRef}
                style={{ height: panelHeight }}
              >
                <div className="signal-canvas-scroll-area">
                  <div className="signal-canvas-wrap" ref={canvasWrapRef}>
                    <canvas
                      ref={canvasRef}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      className="signal-canvas"
                      title="Scroll on the plot to zoom time. Use the left strip to reorder channels (drag) or zoom Y-axis (scroll). Click the full sequence strip to jump."
                    />
                    {overviewStripLayout && overviewChannel ? (
                      <>
                        <div
                          className="channel-strip-label overview-strip-label"
                          style={{
                            top: `${overviewStripLayout.topPercent}%`,
                            height: `${overviewStripLayout.heightPercent}%`,
                            width: PLOT_PADDING.left,
                          }}
                        >
                          <span
                            className="channel-strip-label-text"
                            title={`Full sequence · ${overviewChannel.label}`}
                          >
                            Full · {overviewChannel.label}
                          </span>
                        </div>
                        <div
                          className="overview-strip-region"
                          style={{
                            top: `${overviewStripLayout.topPercent}%`,
                            height: `${overviewStripLayout.heightPercent}%`,
                            left: PLOT_PADDING.left,
                            right: PLOT_PADDING.right,
                          }}
                          onClick={handleOverviewClick}
                          onWheel={handleOverviewWheel}
                          title={`Full sequence · ${overviewChannel.label}. Click to jump, scroll to zoom time.`}
                          aria-label={`Full sequence navigation for ${overviewChannel.label}`}
                        />
                      </>
                    ) : null}
                    {channelStripLayouts.map(({ channel, topPercent, heightPercent }) => {
                      const format = getChannelFormat(channel.id)
                      const unit = channel.physicalDimension ? ` ${channel.physicalDimension}` : ''
                      const formatLabel = format === DEPICTION_FORMATS.BINARY_MASK ? ' [mask]' : ''
                      const labelText = `${channel.label}${unit}${formatLabel}`

                      return (
                        <div
                          key={`label-${channel.id}`}
                          className="channel-strip-label"
                          style={{
                            top: `${topPercent}%`,
                            height: `${heightPercent}%`,
                            width: PLOT_PADDING.left,
                          }}
                        >
                          <span className="channel-strip-label-text" title={labelText}>
                            {labelText}
                          </span>
                        </div>
                      )
                    })}
                    {channelStripLayouts.map(({ channel, topPercent, heightPercent }) => {
                      const isBinaryMask = getChannelFormat(channel.id) === DEPICTION_FORMATS.BINARY_MASK
                      const yZoom = channelYZoom[channel.id] ?? DEFAULT_Y_ZOOM
                      const isDragging = reorderingChannelId === channel.id
                      const regionTitle = isBinaryMask
                        ? `Drag to reorder ${channel.label}`
                        : `Drag to reorder · scroll to zoom Y-axis (${yZoom.toFixed(1)}x)`

                      return (
                        <div
                          key={channel.id}
                          className={`channel-yzoom-region${isDragging ? ' channel-yzoom-region-dragging' : ''}`}
                          data-channel-id={channel.id}
                          style={{
                            top: `${topPercent}%`,
                            height: `${heightPercent}%`,
                            left: PLOT_PADDING.left,
                            width: Y_VALUE_REGION_WIDTH,
                          }}
                          title={regionTitle}
                          aria-label={`Reorder ${channel.label}${isBinaryMask ? '' : `, Y-axis zoom ${yZoom.toFixed(1)}x`}`}
                          onMouseDown={(event) => startChannelReorder(event, channel.id)}
                        />
                      )
                    })}
                    {channelBoundaries.map(({ channelIndex, percent }) => (
                      <div
                        key={channelIndex}
                        className="channel-resize-handle"
                        style={{ top: `${percent}%` }}
                        onMouseDown={(event) => startChannelResize(event, channelIndex)}
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Resize ${activeChannels[channelIndex]?.label} and ${activeChannels[channelIndex + 1]?.label}`}
                      />
                    ))}
                  </div>
                </div>
                <div
                  className="panel-resize-handle"
                  onMouseDown={startPanelResize}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize signal viewer panel"
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

          <div
            className="viewer-tab-panel viewer-tab-panel-current-view"
            role="tabpanel"
            hidden={activeTab !== VIEWER_TABS.CURRENT_VIEW}
          >
            <div className="view-presets-panel">
              <div className="view-presets-header">
                <h3>View Formats</h3>
                <p className="view-presets-hint">
                  Save all viewer settings to IndexedDB: full sequence channel, channel order, channels,
                  depiction formats, binary mask overlays, time zoom, panel height, channel strip heights,
                  Y-axis zoom, and active tab.
                </p>
              </div>

              {loadedPreset ? (
                <div className="view-preset-current">
                  <div className="view-preset-current-info">
                    <span className="view-preset-current-badge">Loaded</span>
                    <span className="view-preset-current-name">{loadedPreset.name}</span>
                    {isLoadedPresetModified ? (
                      <span className="view-preset-modified-badge">Modified</span>
                    ) : null}
                  </div>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={handleUpdateLoadedPreset}
                    type="button"
                    disabled={!isLoadedPresetModified}
                  >
                    Update Format
                  </button>
                </div>
              ) : (
                <p className="view-presets-empty view-presets-no-loaded">
                  No view format loaded. Load a saved format or save the current settings.
                </p>
              )}

              <div className="view-presets-save">
                <input
                  className="view-preset-name-input"
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Format name"
                  maxLength={80}
                />
                <button
                  className="btn btn-primary btn-small"
                  onClick={handleSavePreset}
                  type="button"
                  disabled={!presetName.trim()}
                >
                  Save View Format
                </button>
              </div>

              {presetMessage ? <p className="view-preset-message">{presetMessage}</p> : null}
              {presetError ? <p className="view-preset-error">{presetError}</p> : null}

              {presetsLoading ? (
                <p className="view-presets-empty">Loading view formats...</p>
              ) : savedPresets.length === 0 ? (
                <p className="view-presets-empty">No saved view formats yet.</p>
              ) : (
                <ul className="view-presets-list">
                  {savedPresets.map((preset) => {
                    const isLoaded = preset.id === loadedPresetId

                    return (
                      <li
                        key={preset.id}
                        className={`view-preset-item${isLoaded ? ' view-preset-item-active' : ''}`}
                      >
                        <div className="view-preset-info">
                          <span className="view-preset-name">
                            {isLoaded ? <span className="view-preset-loaded-marker">● </span> : null}
                            {preset.name}
                            {isLoaded ? <span className="view-preset-loaded-label"> (loaded)</span> : null}
                          </span>
                          <span className="view-preset-meta">
                            {preset.params.selectedChannelLabels?.length ?? 0} channels
                            {(preset.params.channelDisplayOrderLabels ?? preset.params.selectedChannelLabels)?.length
                              ? ` · ${(preset.params.channelDisplayOrderLabels ?? preset.params.selectedChannelLabels).join(' → ')}`
                              : ''}
                            {' · '}
                            {new Date(preset.updatedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="view-preset-actions">
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => handleLoadPreset(preset)}
                            type="button"
                            disabled={isLoaded && !isLoadedPresetModified}
                          >
                            {isLoaded && !isLoadedPresetModified ? 'Loaded' : 'Load'}
                          </button>
                          {isLoaded ? (
                            <button
                              className="btn btn-primary btn-small"
                              onClick={handleUpdateLoadedPreset}
                              type="button"
                              disabled={!isLoadedPresetModified}
                            >
                              Update
                            </button>
                          ) : null}
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => handleDeletePreset(preset)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <div
            className="viewer-tab-panel viewer-tab-panel-channels"
            role="tabpanel"
            hidden={activeTab !== VIEWER_TABS.CHANNELS}
          >
            <div className="channel-controls">
              <div className="channel-controls-header">
                <h3>Channel Selection</h3>
              </div>
              <div className="overview-channel-picker">
                <label className="overview-channel-picker-label" htmlFor="overview-channel-select">
                  Full sequence channel
                </label>
                <select
                  id="overview-channel-select"
                  className="overview-channel-select"
                  value={overviewChannelId ?? ''}
                  onChange={(e) => setOverviewChannelId(Number(e.target.value))}
                >
                  {edfData.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="channel-list">
                {channelsForSelectionList.map((channel) => {
                  const isBinary = binaryChannelIds.has(channel.id)
                  const format = getChannelFormat(channel.id)
                  const maskColorIndex = binaryMaskChannels.findIndex(
                    (maskChannel) => maskChannel.id === channel.id
                  )
                  const maskColor = maskColorIndex >= 0 ? getBinaryMaskColor(maskColorIndex) : null
                  const overlayTargets = getBinaryMaskOverlayTargets(channel.id)

                  return (
                    <div key={channel.id} className="channel-item">
                      <label className="channel-item-header">
                        <input
                          type="checkbox"
                          checked={selectedChannels.includes(channel.id)}
                          onChange={() => handleChannelToggle(channel.id)}
                        />
                        <span className="channel-label">{channel.label}</span>
                        {maskColor ? (
                          <span
                            className="binary-mask-color-swatch"
                            style={{ backgroundColor: maskColor.stroke }}
                            title="Binary mask color"
                          />
                        ) : null}
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
                      {format === DEPICTION_FORMATS.BINARY_MASK ? (
                        <div className="binary-mask-overlay-targets">
                          <span className="binary-mask-overlay-label">Overlay on:</span>
                          {overlayCandidateChannels.length === 0 ? (
                            <span className="binary-mask-overlay-empty">
                              Select sequence channels to overlay this mask.
                            </span>
                          ) : (
                            overlayCandidateChannels.map((targetChannel) => (
                              <label
                                key={targetChannel.id}
                                className="binary-mask-overlay-option"
                              >
                                <input
                                  type="checkbox"
                                  checked={overlayTargets.includes(targetChannel.id)}
                                  onChange={(e) =>
                                    handleBinaryMaskOverlayToggle(
                                      channel.id,
                                      targetChannel.id,
                                      e.target.checked
                                    )
                                  }
                                />
                                <span>{targetChannel.label}</span>
                              </label>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default SignalViewer
