import * as XLSX from 'xlsx';

/**
 * Parse an Excel file and return structured candidate/job data.
 * Expects sheets: "Candidates" and "Job Positions"
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const result = {
          candidates: [],
          jobPositions: [],
          sheetNames: workbook.SheetNames,
        };

        // Try to find candidates sheet
        const candidateSheet = findSheet(workbook, ['candidates', 'candidate', 'applicants', 'resumes']);
        if (candidateSheet) {
          result.candidates = XLSX.utils.sheet_to_json(candidateSheet).map(normalizeCandidateRow);
        }

        // Try to find job positions sheet
        const jobSheet = findSheet(workbook, ['job positions', 'jobs', 'positions', 'openings', 'requisitions']);
        if (jobSheet) {
          result.jobPositions = XLSX.utils.sheet_to_json(jobSheet).map(normalizeJobRow);
        }

        // If only one sheet, try to auto-detect
        if (workbook.SheetNames.length === 1 && result.candidates.length === 0 && result.jobPositions.length === 0) {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet);
          const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());

          if (headers.some(h => h.includes('candidate') || h.includes('applicant') || h.includes('resume'))) {
            result.candidates = rows.map(normalizeCandidateRow);
          } else if (headers.some(h => h.includes('position') || h.includes('job') || h.includes('requisition'))) {
            result.jobPositions = rows.map(normalizeJobRow);
          } else {
            // Default: treat as candidates
            result.candidates = rows.map(normalizeCandidateRow);
          }
        }

        // If no specific sheets found, parse all sheets as generic data
        if (result.candidates.length === 0 && result.jobPositions.length === 0) {
          for (const name of workbook.SheetNames) {
            const sheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(sheet);
            if (rows.length > 0) {
              result.candidates = rows.map(normalizeCandidateRow);
              break;
            }
          }
        }

        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse Excel file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function findSheet(workbook, possibleNames) {
  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase().trim();
    if (possibleNames.some(p => lower.includes(p))) {
      return workbook.Sheets[name];
    }
  }
  return null;
}

function normalizeCandidateRow(row, index) {
  const keys = Object.keys(row);
  const get = (patterns) => {
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (patterns.some(p => lower.includes(p))) return row[key];
    }
    return '';
  };

  return {
    id: get(['id']) || index + 1,
    name: get(['name', 'candidate', 'applicant']) || `Candidate ${index + 1}`,
    email: get(['email', 'mail']),
    phone: get(['phone', 'mobile', 'contact']),
    skills: get(['skill', 'technology', 'tech stack']),
    experience: get(['experience', 'years', 'exp']),
    position: get(['position', 'role', 'job', 'applied for', 'requisition']),
    status: get(['status', 'stage', 'pipeline']),
    client: get(['client', 'company', 'account']),
    location: get(['location', 'city', 'region']),
    date: get(['date', 'applied', 'submitted']),
    source: get(['source', 'channel', 'referral']),
    _raw: row,
  };
}

function normalizeJobRow(row, index) {
  const keys = Object.keys(row);
  const get = (patterns) => {
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (patterns.some(p => lower.includes(p))) return row[key];
    }
    return '';
  };

  return {
    id: get(['id', 'req id', 'requisition']) || index + 1,
    title: get(['title', 'position', 'role', 'job']) || `Position ${index + 1}`,
    client: get(['client', 'company', 'account']),
    location: get(['location', 'city', 'region']),
    skills: get(['skill', 'technology', 'requirement']),
    openings: parseInt(get(['opening', 'vacancy', 'headcount', 'count'])) || 1,
    filled: parseInt(get(['filled', 'hired', 'closed'])) || 0,
    status: get(['status', 'state']),
    priority: get(['priority', 'urgency']),
    date: get(['date', 'posted', 'created']),
    _raw: row,
  };
}

export function generateSampleExcel() {
  const wb = XLSX.utils.book_new();

  const candidates = [
    { 'Candidate Name': 'Alice Johnson', Email: 'alice@email.com', Skills: 'React, Node.js, TypeScript', Experience: 5, 'Applied For': 'Senior Frontend Developer', Status: 'Interview', Client: 'Acme Corp', Location: 'New York', Date: '2026-01-15', Source: 'LinkedIn' },
    { 'Candidate Name': 'Bob Smith', Email: 'bob@email.com', Skills: 'Python, Django, AWS', Experience: 7, 'Applied For': 'Backend Engineer', Status: 'Offered', Client: 'TechStart Inc', Location: 'San Francisco', Date: '2026-01-10', Source: 'Referral' },
    { 'Candidate Name': 'Carol Williams', Email: 'carol@email.com', Skills: 'Java, Spring Boot, Microservices', Experience: 8, 'Applied For': 'Senior Backend Developer', Status: 'Screening', Client: 'Acme Corp', Location: 'Chicago', Date: '2026-02-01', Source: 'Job Board' },
    { 'Candidate Name': 'David Chen', Email: 'david@email.com', Skills: 'React, Angular, Vue.js', Experience: 4, 'Applied For': 'Senior Frontend Developer', Status: 'Interview', Client: 'Acme Corp', Location: 'New York', Date: '2026-01-20', Source: 'LinkedIn' },
    { 'Candidate Name': 'Eva Martinez', Email: 'eva@email.com', Skills: 'Python, Machine Learning, TensorFlow', Experience: 6, 'Applied For': 'Data Scientist', Status: 'Hired', Client: 'DataDrive LLC', Location: 'Austin', Date: '2025-12-15', Source: 'Campus' },
    { 'Candidate Name': 'Frank Brown', Email: 'frank@email.com', Skills: 'AWS, Azure, Terraform, Docker', Experience: 9, 'Applied For': 'Cloud Architect', Status: 'Interview', Client: 'CloudNine Corp', Location: 'Seattle', Date: '2026-02-05', Source: 'Referral' },
    { 'Candidate Name': 'Grace Lee', Email: 'grace@email.com', Skills: 'React, Redux, GraphQL', Experience: 3, 'Applied For': 'Frontend Developer', Status: 'Rejected', Client: 'TechStart Inc', Location: 'Boston', Date: '2026-01-25', Source: 'Job Board' },
    { 'Candidate Name': 'Henry Wilson', Email: 'henry@email.com', Skills: 'Java, Kubernetes, Jenkins', Experience: 10, 'Applied For': 'DevOps Lead', Status: 'Offered', Client: 'Acme Corp', Location: 'Chicago', Date: '2026-01-08', Source: 'LinkedIn' },
    { 'Candidate Name': 'Iris Taylor', Email: 'iris@email.com', Skills: 'Python, FastAPI, PostgreSQL', Experience: 4, 'Applied For': 'Backend Engineer', Status: 'Screening', Client: 'TechStart Inc', Location: 'San Francisco', Date: '2026-02-10', Source: 'LinkedIn' },
    { 'Candidate Name': 'Jack Davis', Email: 'jack@email.com', Skills: 'React Native, Flutter, Swift', Experience: 5, 'Applied For': 'Mobile Developer', Status: 'Interview', Client: 'AppWorks Ltd', Location: 'Los Angeles', Date: '2026-01-30', Source: 'Referral' },
    { 'Candidate Name': 'Karen White', Email: 'karen@email.com', Skills: 'Salesforce, Apex, LWC', Experience: 6, 'Applied For': 'Salesforce Developer', Status: 'Hired', Client: 'CloudNine Corp', Location: 'Dallas', Date: '2025-12-20', Source: 'Job Board' },
    { 'Candidate Name': 'Leo Harris', Email: 'leo@email.com', Skills: 'Angular, RxJS, NgRx', Experience: 5, 'Applied For': 'Frontend Developer', Status: 'Interview', Client: 'TechStart Inc', Location: 'Boston', Date: '2026-02-08', Source: 'Campus' },
  ];

  const jobs = [
    { 'Job Title': 'Senior Frontend Developer', Client: 'Acme Corp', Location: 'New York', 'Required Skills': 'React, TypeScript, CSS', Openings: 3, Filled: 1, Status: 'Open', Priority: 'High', 'Posted Date': '2025-12-01' },
    { 'Job Title': 'Backend Engineer', Client: 'TechStart Inc', Location: 'San Francisco', 'Required Skills': 'Python, Django, AWS', Openings: 2, Filled: 1, Status: 'Open', Priority: 'Medium', 'Posted Date': '2025-12-15' },
    { 'Job Title': 'Data Scientist', Client: 'DataDrive LLC', Location: 'Austin', 'Required Skills': 'Python, ML, TensorFlow', Openings: 1, Filled: 1, Status: 'Closed', Priority: 'High', 'Posted Date': '2025-11-20' },
    { 'Job Title': 'Cloud Architect', Client: 'CloudNine Corp', Location: 'Seattle', 'Required Skills': 'AWS, Azure, Terraform', Openings: 2, Filled: 0, Status: 'Open', Priority: 'Critical', 'Posted Date': '2026-01-05' },
    { 'Job Title': 'DevOps Lead', Client: 'Acme Corp', Location: 'Chicago', 'Required Skills': 'Kubernetes, Jenkins, Docker', Openings: 1, Filled: 0, Status: 'Open', Priority: 'High', 'Posted Date': '2025-12-10' },
    { 'Job Title': 'Mobile Developer', Client: 'AppWorks Ltd', Location: 'Los Angeles', 'Required Skills': 'React Native, Flutter', Openings: 2, Filled: 0, Status: 'Open', Priority: 'Medium', 'Posted Date': '2026-01-15' },
    { 'Job Title': 'Frontend Developer', Client: 'TechStart Inc', Location: 'Boston', 'Required Skills': 'React, Angular, Vue.js', Openings: 2, Filled: 0, Status: 'Open', Priority: 'Low', 'Posted Date': '2026-01-20' },
    { 'Job Title': 'Salesforce Developer', Client: 'CloudNine Corp', Location: 'Dallas', 'Required Skills': 'Salesforce, Apex, LWC', Openings: 1, Filled: 1, Status: 'Closed', Priority: 'Medium', 'Posted Date': '2025-11-25' },
    { 'Job Title': 'Senior Backend Developer', Client: 'Acme Corp', Location: 'Chicago', 'Required Skills': 'Java, Spring Boot, Microservices', Openings: 2, Filled: 0, Status: 'Open', Priority: 'High', 'Posted Date': '2026-01-10' },
  ];

  const ws1 = XLSX.utils.json_to_sheet(candidates);
  XLSX.utils.book_append_sheet(wb, ws1, 'Candidates');

  const ws2 = XLSX.utils.json_to_sheet(jobs);
  XLSX.utils.book_append_sheet(wb, ws2, 'Job Positions');

  XLSX.writeFile(wb, 'MeetMatch_Sample_Data.xlsx');
}
