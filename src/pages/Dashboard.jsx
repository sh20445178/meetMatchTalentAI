import { useState, useMemo } from 'react';
import { Users, Briefcase, CheckCircle, Clock, AlertTriangle, TrendingUp, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import FileUpload from '../components/FileUpload';
import StatCard from '../components/StatCard';
import { parseExcelFile, generateSampleExcel } from '../services/excelParser';

const STATUS_COLORS = {
  Screening: '#8b5cf6',
  Interview: '#3b82f6',
  Offered: '#f59e0b',
  Hired: '#16a34a',
  Rejected: '#ef4444',
};

const PRIORITY_COLORS = {
  Critical: '#ef4444',
  High: '#f59e0b',
  Medium: '#3b82f6',
  Low: '#6b7280',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const handleFileUpload = async (file) => {
    setLoading(true);
    setError(null);
    try {
      const result = await parseExcelFile(file);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (!data) return null;
    const { candidates, jobPositions } = data;

    const totalCandidates = candidates.length;
    const totalPositions = jobPositions.length;
    const totalOpenings = jobPositions.reduce((sum, j) => sum + (j.openings || 0), 0);
    const totalFilled = jobPositions.reduce((sum, j) => sum + (j.filled || 0), 0);
    const fillRate = totalOpenings > 0 ? Math.round((totalFilled / totalOpenings) * 100) : 0;

    const statusCounts = {};
    candidates.forEach(c => {
      const s = c.status || 'Unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const clientCounts = {};
    jobPositions.forEach(j => {
      const c = j.client || 'Unknown';
      if (!clientCounts[c]) clientCounts[c] = { openings: 0, filled: 0 };
      clientCounts[c].openings += j.openings || 0;
      clientCounts[c].filled += j.filled || 0;
    });

    const priorityCounts = {};
    jobPositions.filter(j => (j.status || '').toLowerCase() !== 'closed').forEach(j => {
      const p = j.priority || 'Medium';
      priorityCounts[p] = (priorityCounts[p] || 0) + 1;
    });

    const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    const clientChartData = Object.entries(clientCounts).map(([name, data]) => ({
      name,
      openings: data.openings,
      filled: data.filled,
      remaining: data.openings - data.filled,
    }));
    const priorityChartData = Object.entries(priorityCounts).map(([name, value]) => ({ name, value }));

    return {
      totalCandidates, totalPositions, totalOpenings, totalFilled, fillRate,
      statusCounts, statusChartData, clientChartData, priorityChartData,
      openPositions: jobPositions.filter(j => (j.status || '').toLowerCase() !== 'closed').length,
      hiredCount: statusCounts['Hired'] || 0,
      inPipeline: totalCandidates - (statusCounts['Hired'] || 0) - (statusCounts['Rejected'] || 0),
    };
  }, [data]);

  if (!data) {
    return (
      <div className="page">
        <div className="page__header">
          <h1>Candidate Fulfillment Dashboard</h1>
          <p>Upload an Excel file with candidate and job position data to get started.</p>
        </div>
        <div className="upload-area">
          <FileUpload
            onFileSelect={handleFileUpload}
            accept=".xlsx,.xls"
            label="Drop your Excel file here or click to browse"
          />
          {loading && <p className="loading-text">Parsing file...</p>}
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn--secondary" onClick={generateSampleExcel} style={{ marginTop: 16 }}>
            <Download size={16} /> Download Sample Excel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Candidate Fulfillment Dashboard</h1>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={() => setData(null)}>Upload New File</button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid">
        <StatCard title="Total Candidates" value={stats.totalCandidates} icon={Users} color="#6366f1" />
        <StatCard title="Open Positions" value={stats.openPositions} icon={Briefcase} color="#f59e0b" subtitle={`${stats.totalPositions} total positions`} />
        <StatCard title="Hired" value={stats.hiredCount} icon={CheckCircle} color="#16a34a" />
        <StatCard title="In Pipeline" value={stats.inPipeline} icon={Clock} color="#3b82f6" />
        <StatCard title="Fill Rate" value={`${stats.fillRate}%`} icon={TrendingUp} color="#8b5cf6" subtitle={`${stats.totalFilled}/${stats.totalOpenings} filled`} />
        <StatCard title="Critical/High Priority" value={(stats.priorityChartData.find(p => p.name === 'Critical')?.value || 0) + (stats.priorityChartData.find(p => p.name === 'High')?.value || 0)} icon={AlertTriangle} color="#ef4444" />
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        {['overview', 'candidates', 'positions'].map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'tab--active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="charts-grid">
          {/* Pipeline Chart */}
          <div className="chart-card">
            <h3>Candidate Pipeline</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={stats.statusChartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {stats.statusChartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Client Fulfillment Chart */}
          <div className="chart-card">
            <h3>Client Fulfillment</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.clientChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="filled" name="Filled" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="remaining" name="Remaining" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Priority Chart */}
          <div className="chart-card">
            <h3>Open Position Priority</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={stats.priorityChartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {stats.priorityChartData.map((entry) => (
                    <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'candidates' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Skills</th>
                <th>Experience</th>
                <th>Applied For</th>
                <th>Status</th>
                <th>Client</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c, i) => (
                <tr key={i}>
                  <td className="td--bold">{c.name}</td>
                  <td>{c.email}</td>
                  <td><div className="skill-tags">{String(c.skills).split(',').slice(0, 3).map((s, j) => <span key={j} className="skill-tag">{s.trim()}</span>)}</div></td>
                  <td>{c.experience ? `${c.experience} yrs` : '-'}</td>
                  <td>{c.position}</td>
                  <td><span className="status-badge" style={{ backgroundColor: (STATUS_COLORS[c.status] || '#94a3b8') + '20', color: STATUS_COLORS[c.status] || '#94a3b8' }}>{c.status || 'N/A'}</span></td>
                  <td>{c.client}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'positions' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job Title</th>
                <th>Client</th>
                <th>Location</th>
                <th>Skills Required</th>
                <th>Openings</th>
                <th>Filled</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.jobPositions.map((j, i) => (
                <tr key={i}>
                  <td className="td--bold">{j.title}</td>
                  <td>{j.client}</td>
                  <td>{j.location}</td>
                  <td><div className="skill-tags">{String(j.skills).split(',').slice(0, 3).map((s, k) => <span key={k} className="skill-tag">{s.trim()}</span>)}</div></td>
                  <td>{j.openings}</td>
                  <td>
                    <div className="fill-progress">
                      <div className="fill-progress__bar" style={{ width: `${(j.filled / j.openings) * 100}%` }} />
                      <span>{j.filled}/{j.openings}</span>
                    </div>
                  </td>
                  <td><span className="priority-badge" style={{ backgroundColor: (PRIORITY_COLORS[j.priority] || '#94a3b8') + '20', color: PRIORITY_COLORS[j.priority] || '#94a3b8' }}>{j.priority || 'N/A'}</span></td>
                  <td><span className={`status-dot ${(j.status || '').toLowerCase() === 'closed' ? 'status-dot--closed' : 'status-dot--open'}`}>{j.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
