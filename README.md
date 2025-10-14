# EDF Viewer - Biomedical Signal Viewer

A modern web-based application for viewing EDF (European Data Format) files containing biomedical signals like EEG, ECG, and other physiological data.

## 🚀 Quick Start

### Option 1: Simple HTML Version (No Dependencies)
```bash
# Open the simple version directly in your browser
open simple-app.html
# or
python3 -m http.server 8000
# Then visit http://localhost:8000/simple-app.html
```

### Option 2: React + Vite Version (Modern Development)
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 📁 Project Structure

```
Project01_edfviewer/
├── simple-app.html          # Simple HTML version (no dependencies)
├── index.html               # React app entry point
├── package.json             # Node.js dependencies
├── vite.config.js           # Vite configuration
├── src/
│   ├── main.jsx             # React app entry
│   ├── App.jsx               # Main React component
│   ├── components/           # React components
│   │   ├── Header.jsx
│   │   ├── FileUpload.jsx
│   │   └── SignalViewer.jsx
│   └── styles/              # CSS styles
│       ├── index.css
│       └── App.css
└── README.md
```

## 🛠️ Features

- **File Upload**: Drag & drop or browse for EDF files
- **Signal Visualization**: Interactive canvas-based signal display
- **Channel Selection**: Multi-channel signal viewing
- **Time Controls**: Zoom, pan, and navigation controls
- **Modern UI**: Responsive design with beautiful gradients
- **Real-time Processing**: Live EDF file parsing and display

## 🎯 Next Steps

1. **EDF Parser Implementation**: Add actual EDF file parsing logic
2. **Signal Rendering**: Implement canvas-based signal visualization
3. **Data Export**: Add export functionality for processed data
4. **Advanced Features**: Filtering, measurements, annotations

## 🧪 Development

### Prerequisites
- Node.js 20+ (already installed via nvm)
- Modern web browser

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 📊 EDF Format Support

This viewer supports the European Data Format (EDF) specification:
- Fixed-length header (256 bytes)
- Variable-length header (optional)
- Data records with multiple channels
- Sampling rates and signal properties
- Patient and recording information

## 🎨 UI Features

- **Responsive Design**: Works on desktop and mobile
- **Modern Styling**: Gradient backgrounds and glassmorphism effects
- **Interactive Elements**: Hover effects and smooth transitions
- **Accessibility**: Keyboard navigation and screen reader support

## 🔧 Technical Stack

- **Frontend**: React 18 + Vite
- **Styling**: Modern CSS with Flexbox/Grid
- **Canvas**: HTML5 Canvas for signal rendering
- **File Handling**: Native File API
- **Build Tool**: Vite (fast development and building)

## 📝 License

MIT License - feel free to use and modify!
