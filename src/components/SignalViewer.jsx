import React, { useState, useRef, useEffect } from 'react'

const SignalViewer = ({ edfData, onBack }) => {
  const canvasRef = useRef(null)
  const [selectedChannels, setSelectedChannels] = useState([])
  const [timeRange, setTimeRange] = useState({ start: 0, end: 10 })

  useEffect(() => {
    // Initialize canvas and draw placeholder
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      ctx.fillStyle = '#666'
      ctx.font = '16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Signal visualization will appear here', canvas.width / 2, canvas.height / 2)
    }
  }, [])

  const handleChannelToggle = (channelId) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    )
  }

  return (
    <section className="viewer-section">
      <div className="viewer-header">
        <h2>Signal Viewer - {edfData.fileName}</h2>
        <div className="controls">
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back to Upload
          </button>
          <button className="btn btn-primary">
            Export Data
          </button>
        </div>
      </div>
      
      <div className="viewer-content">
        {/* Channel Selection */}
        <div className="channel-controls">
          <h3>Channel Selection</h3>
          <div className="channel-list">
            <p>No channels available yet. EDF parsing will be implemented.</p>
          </div>
        </div>

        {/* Signal Display */}
        <div className="signal-display">
          <div className="signal-canvas-container">
            <canvas 
              ref={canvasRef}
              width={1200} 
              height={600}
              className="signal-canvas"
            />
          </div>
          
          {/* Time Controls */}
          <div className="time-controls">
            <button className="btn btn-small">🔍+</button>
            <button className="btn btn-small">🔍-</button>
            <button className="btn btn-small">←</button>
            <button className="btn btn-small">→</button>
            <span className="time-info">
              Time: {timeRange.start}s - {timeRange.end}s
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default SignalViewer
