import React, { useState } from 'react'
import Header from './components/Header'
import FileUpload from './components/FileUpload'
import SignalViewer from './components/SignalViewer'
import './styles/App.css'

function App() {
  const [edfData, setEdfData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFileUpload = async (file) => {
    setIsLoading(true)
    try {
      // TODO: Implement EDF parsing logic
      console.log('Processing EDF file:', file.name)
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000))
      setEdfData({ fileName: file.name, channels: [] })
    } catch (error) {
      console.error('Error processing EDF file:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToUpload = () => {
    setEdfData(null)
  }

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        {!edfData ? (
          <FileUpload onFileUpload={handleFileUpload} isLoading={isLoading} />
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
