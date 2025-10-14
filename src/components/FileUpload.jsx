import React, { useRef } from 'react'

const FileUpload = ({ onFileUpload, isLoading }) => {
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
      </div>
    </section>
  )
}

export default FileUpload
