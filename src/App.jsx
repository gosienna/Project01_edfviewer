import React, { useState } from 'react'
import Header from './components/Header'
import FileUpload from './components/FileUpload'
import SignalViewer from './components/SignalViewer'
import { parseEdfFile } from './utils/edfParser'
import { getEdfRecord } from './utils/edfStorage'
import './styles/App.css'

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return value
  }

  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  }

  throw new Error('Saved EDF data is missing or invalid')
}

function App() {
  const [edfData, setEdfData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileUpload = async (file) => {
    setIsLoading(true)
    setError(null)
    try {
      const rawBuffer = await file.arrayBuffer()
      const parsed = await parseEdfFile(rawBuffer)
      setEdfData({
        fileName: file.name,
        rawBuffer,
        ...parsed,
      })
    } catch (uploadError) {
      console.error('Error processing EDF file:', uploadError)
      setError(uploadError.message || 'Failed to parse EDF file')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSavedEdf = async (id) => {
    setIsLoading(true)
    setError(null)
    try {
      const record = await getEdfRecord(id)
      const rawBuffer = toArrayBuffer(record.rawBuffer)
      const parsed = await parseEdfFile(rawBuffer)
      setEdfData({
        fileName: record.fileName,
        rawBuffer,
        savedRecordId: record.id,
        ...parsed,
      })
    } catch (loadError) {
      console.error('Error loading saved EDF:', loadError)
      setError(loadError.message || 'Failed to load saved EDF')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToUpload = () => {
    setEdfData(null)
    setError(null)
  }

  return (
    <div className="app">
      <Header />
      <main className={`main-content${edfData ? ' main-content--viewer' : ''}`}>
        {!edfData ? (
          <FileUpload
            onFileUpload={handleFileUpload}
            onLoadSavedEdf={handleLoadSavedEdf}
            isLoading={isLoading}
            error={error}
          />
        ) : (
          <SignalViewer
            edfData={edfData}
            onBack={handleBackToUpload}
          />
        )}
      </main>
    </div>
  )
}

export default App
