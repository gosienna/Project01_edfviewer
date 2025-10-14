import React from 'react'

const Header = () => {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="logo">
          <span className="logo-icon">📊</span>
          EDF Viewer
        </h1>
        <p className="subtitle">European Data Format Signal Viewer</p>
      </div>
    </header>
  )
}

export default Header
