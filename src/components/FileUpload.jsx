import React, { useRef } from 'react'

const TEST_EDF_URL = '/testEDF/1779335171431389.edf'

const FileUpload = ({ onFileUpload, isLoading, error }) => {
  const fileInputRef = useRef(null)

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file && file.name.toLowerCase().endsWith('.edf')) {
      onFileUpload(file)
    } else {
      alert('Please select a valid EDF file (.edf extension)')
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.edf')) {
      onFileUpload(file)
    } else {
      alert('Please drop a valid EDF file (.edf extension)')
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  const handleLoadTestFile = async () => {
    try {
      const response = await fetch(TEST_EDF_URL)
      if (!response.ok) {
        throw new Error(`Test EDF not found (${response.status})`)
      }
      const buffer = await response.arrayBuffer()
      const file = new File([buffer], '1779335171431389.edf', { type: 'application/octet-stream' })
      onFileUpload(file)
    } catch (loadError) {
      alert(loadError.message || 'Failed to load test EDF file')
    }
  }

  return (
    <section className="upload-section">
      <div className="upload-container">
        <div
          className="upload-area"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">📁</div>
          <h2>Drop your EDF file here</h2>
          <p>or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".edf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button className="browse-btn" disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Browse Files'}
          </button>
        </div>

        <div className="upload-actions">
          <button
            className="btn btn-secondary test-load-btn"
            onClick={handleLoadTestFile}
            disabled={isLoading}
            type="button"
          >
            Load Test EDF
          </button>
        </div>

        {error && <p className="upload-error">{error}</p>}
      </div>
    </section>
  )
}

export default FileUpload
