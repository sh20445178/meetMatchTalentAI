import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileSearch, Sparkles } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Sparkles size={24} />
        <span>MeetMatch<b>AI</b></span>
      </div>
      <nav className="sidebar__nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/matcher" className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}>
          <FileSearch size={18} />
          <span>Resume Matcher</span>
        </NavLink>
      </nav>
      <div className="sidebar__footer">
        <p>Talent Fulfillment AI</p>
      </div>
    </aside>
  );
}
