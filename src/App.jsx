import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ResumeMatcher from './pages/ResumeMatcher'
import './App.css'

function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/matcher" element={<ResumeMatcher />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
