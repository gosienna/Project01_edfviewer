import React, { useState } from 'react'
import Header from './components/Header'
import FileUpload from './components/FileUpload'
import SignalViewer from './components/SignalViewer'
import { parseEdfFile } from './utils/edfParser'
import './styles/App.css'

function App() {
  const [edfData, setEdfData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileUpload = async (file) => {
    setIsLoading(true)
    setError(null)
    try {
      const parsed = await parseEdfFile(file)
      setEdfData({
        fileName: file.name,
        ...parsed,
      })
    } catch (uploadError) {
      console.error('Error processing EDF file:', uploadError)
      setError(uploadError.message || 'Failed to parse EDF file')
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
