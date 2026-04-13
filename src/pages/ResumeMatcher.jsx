import { useState } from 'react';
import { FileText, Upload, Star, CheckCircle, XCircle, AlertCircle, Trash2 } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { parseWordFile, extractResumeInfo, extractJobDescription } from '../services/wordParser';
import { parsePdfFile } from '../services/pdfParser';
import { matchResumeToJob, rankResumes } from '../services/matchingEngine';

function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return parsePdfFile(file);
  return parseWordFile(file);
}

export default function ResumeMatcher() {
  const [jdFile, setJdFile] = useState(null);
  const [jdData, setJdData] = useState(null);
  const [resumeFiles, setResumeFiles] = useState([]);
  const [resumeDataList, setResumeDataList] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [selectedResume, setSelectedResume] = useState(null);

  const handleJdUpload = async (file) => {
    setError(null);
    try {
      const parsed = await parseFile(file);
      const jd = extractJobDescription(parsed.text);
      setJdFile(file);
      setJdData(jd);
      // Re-match if resumes already loaded
      if (resumeDataList.length > 0) {
        const ranked = rankResumes(resumeDataList, jd);
        setRankings(ranked);
      }
    } catch (err) {
      setError('Failed to parse job description: ' + err.message);
    }
  };

  const handleResumeUpload = async (files) => {
    setLoading(true);
    setProgress(0);
    setError(null);
    try {
      const fileList = Array.isArray(files) ? files : [files];
      setResumeFiles(prev => [...prev, ...fileList]);

      const total = fileList.length;
      const newResumes = [];
      for (let i = 0; i < total; i++) {
        const file = fileList[i];
        const parsed = await parseFile(file);
        const info = extractResumeInfo(parsed.text, parsed.nameHint, file.name);
        newResumes.push({ ...info, fileName: file.name });
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      const allResumes = [...resumeDataList, ...newResumes];
      setResumeDataList(allResumes);

      if (jdData) {
        const ranked = rankResumes(allResumes, jdData);
        setRankings(ranked);
      }
    } catch (err) {
      setError('Failed to parse resume(s): ' + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const deleteResume = (index) => {
    const updatedResumes = resumeDataList.filter((_, i) => i !== index);
    const updatedFiles = resumeFiles.filter((_, i) => i !== index);
    setResumeDataList(updatedResumes);
    setResumeFiles(updatedFiles);
    setSelectedResume(null);
    if (jdData && updatedResumes.length > 0) {
      setRankings(rankResumes(updatedResumes, jdData));
    } else {
      setRankings([]);
    }
  };

  const clearAll = () => {
    setJdFile(null);
    setJdData(null);
    setResumeFiles([]);
    setResumeDataList([]);
    setRankings([]);
    setSelectedResume(null);
    setError(null);
  };

  const ScoreBar = ({ label, score, color }) => (
    <div className="score-bar">
      <div className="score-bar__header">
        <span>{label}</span>
        <span className="score-bar__value">{score}%</span>
      </div>
      <div className="score-bar__track">
        <div className="score-bar__fill" style={{ width: `${score}%`, backgroundColor: color || '#6366f1' }} />
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page__header">
        <h1>Resume &ndash; JD Matcher</h1>
        <p>Upload a Job Description and resumes (.docx or .pdf) to find the best matching candidates.</p>
        {(jdData || resumeDataList.length > 0) && (
          <button className="btn btn--secondary" onClick={clearAll} style={{ marginTop: 8 }}>Clear All</button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="matcher-layout">
        {/* Upload Section */}
        <div className="matcher-uploads">
          <div className="upload-section">
            <h3><FileText size={18} /> Job Description</h3>
            {jdData ? (
              <div className="uploaded-file">
                <CheckCircle size={18} color="#16a34a" />
                <div>
                  <p className="uploaded-file__name">{jdFile.name}</p>
                  <p className="uploaded-file__meta">Title: {jdData.title}</p>
                  <p className="uploaded-file__meta">Required Skills: {jdData.requiredSkills.join(', ') || 'N/A'}</p>
                  <p className="uploaded-file__meta">Experience: {jdData.experience ? `${jdData.experience}+ years` : 'Not specified'}</p>
                </div>
              </div>
            ) : (
              <FileUpload onFileSelect={handleJdUpload} accept=".docx,.pdf" label="Upload Job Description (.docx or .pdf)" />
            )}
          </div>

          <div className={`upload-section${!jdData ? ' upload-section--disabled' : ''}`}>
            <h3><Upload size={18} /> Resumes ({resumeDataList.length} uploaded)</h3>
            {!jdData && <p className="upload-section__hint">Please upload a Job Description first</p>}
            <FileUpload onFileSelect={handleResumeUpload} accept=".docx,.pdf" label="Upload Resume(s) (.docx or .pdf)" multiple disabled={!jdData} />
            {loading && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="progress-text">Parsing files... {progress}%</p>
              </div>
            )}
            {resumeDataList.length > 0 && (
              <div className="uploaded-list">
                {resumeDataList.map((r, i) => (
                  <div key={i} className="uploaded-file uploaded-file--small">
                    <FileText size={14} />
                    <span>{r.name || r.fileName}</span>
                    <button
                      className="btn-icon btn-icon--danger"
                      title="Remove resume"
                      onClick={() => deleteResume(i)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        {rankings.length > 0 && (
          <div className="matcher-results">
            <h3>Candidate Rankings</h3>
            <div className="ranking-list">
              {rankings.map((item, rank) => (
                <div
                  key={rank}
                  className={`ranking-card ${selectedResume === rank ? 'ranking-card--selected' : ''}`}
                  onClick={() => setSelectedResume(selectedResume === rank ? null : rank)}
                >
                  <div className="ranking-card__rank">#{rank + 1}</div>
                  <div className="ranking-card__info">
                    <p className="ranking-card__name">{item.resume.name || item.resume.fileName}</p>
                    <p className="ranking-card__meta">
                      {item.resume.experience ? `${item.resume.experience} yrs exp` : 'Exp N/A'}
                      {item.resume.email && ` · ${item.resume.email}`}
                    </p>
                    <div className="ranking-card__skills">
                      {item.match.matchedSkills.slice(0, 4).map((s, j) => (
                        <span key={j} className="skill-tag skill-tag--matched">{s}</span>
                      ))}
                      {item.match.missingSkills.slice(0, 2).map((s, j) => (
                        <span key={j} className="skill-tag skill-tag--missing">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="ranking-card__score">
                    <div className="score-circle" style={{ borderColor: item.match.recommendation.color }}>
                      <span>{item.match.overall}%</span>
                    </div>
                    <span className="ranking-card__rec" style={{ color: item.match.recommendation.color }}>
                      {item.match.recommendation.icon} {item.match.recommendation.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail Panel */}
            {selectedResume !== null && rankings[selectedResume] && (
              <div className="match-detail">
                <h3>Match Details — {rankings[selectedResume].resume.name || rankings[selectedResume].resume.fileName}</h3>
                <div className="match-detail__scores">
                  <ScoreBar label="Skill Match" score={rankings[selectedResume].match.skillMatch} color="#6366f1" />
                  <ScoreBar label="Experience Match" score={rankings[selectedResume].match.experienceMatch} color="#3b82f6" />
                  <ScoreBar label="Education Match" score={rankings[selectedResume].match.educationMatch} color="#f59e0b" />
                  <ScoreBar label="Keyword Match" score={rankings[selectedResume].match.keywordMatch} color="#8b5cf6" />
                </div>
                <div className="match-detail__skills">
                  <div>
                    <h4><CheckCircle size={14} color="#16a34a" /> Matched Skills</h4>
                    <div className="skill-tags">
                      {rankings[selectedResume].match.matchedSkills.length > 0
                        ? rankings[selectedResume].match.matchedSkills.map((s, i) => <span key={i} className="skill-tag skill-tag--matched">{s}</span>)
                        : <span className="text-muted">None</span>}
                    </div>
                  </div>
                  <div>
                    <h4><XCircle size={14} color="#ef4444" /> Missing Skills</h4>
                    <div className="skill-tags">
                      {rankings[selectedResume].match.missingSkills.length > 0
                        ? rankings[selectedResume].match.missingSkills.map((s, i) => <span key={i} className="skill-tag skill-tag--missing">{s}</span>)
                        : <span className="text-muted">None — all skills matched!</span>}
                    </div>
                  </div>
                </div>
                {rankings[selectedResume].resume.summary && (
                  <div className="match-detail__summary">
                    <h4><AlertCircle size={14} /> Resume Summary</h4>
                    <p>{rankings[selectedResume].resume.summary}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state when JD loaded but no resumes */}
        {jdData && rankings.length === 0 && (
          <div className="matcher-results matcher-results--empty">
            <AlertCircle size={48} strokeWidth={1} />
            <p>Upload resumes to see matching results</p>
          </div>
        )}
      </div>
    </div>
  );
}
