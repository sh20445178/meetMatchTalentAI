import mammoth from 'mammoth';

/**
 * Parse a Word (.docx) file and extract text content.
 */
export function parseWordFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const result = await mammoth.extractRawText({ arrayBuffer });
        resolve({
          text: result.value,
          messages: result.messages,
        });
      } catch (err) {
        reject(new Error('Failed to parse Word file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extract structured resume information from raw text.
 * @param {string} text - The full text of the resume.
 * @param {string} [nameHint] - Optional name hint (e.g. largest font text from PDF).
 * @param {string} [fileName] - Original filename, used as last resort for name extraction.
 */
export function extractResumeInfo(text, nameHint, fileName) {
  const lines = text.split('\n').filter(l => l.trim());

  return {
    name: extractName(lines, nameHint, fileName),
    email: extractEmail(text),
    phone: extractPhone(text),
    skills: extractSkills(text),
    experience: extractExperience(text),
    education: extractEducation(text),
    summary: extractSummary(lines),
    rawText: text,
  };
}

/**
 * Extract structured job description information from raw text.
 */
export function extractJobDescription(text) {
  const lines = text.split('\n').filter(l => l.trim());

  return {
    title: extractJobTitle(lines),
    requiredSkills: extractSkills(text),
    experience: extractRequiredExperience(text),
    education: extractRequiredEducation(text),
    responsibilities: extractSection(text, ['responsibilities', 'duties', 'what you will do', 'key responsibilities']),
    qualifications: extractSection(text, ['qualifications', 'requirements', 'what we need', 'must have']),
    rawText: text,
  };
}

// Common English words, resume headings, and filler that should never be part of a name
const NOISE_WORDS = new Set([
  // determiners & pronouns
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its',
  'our', 'their', 'i', 'me', 'we', 'us', 'he', 'she', 'it', 'they', 'them',
  // prepositions & conjunctions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into', 'about',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'if', 'then', 'than',
  // verbs & auxiliaries
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'can',
  'could', 'must', 'not', 'no',
  // common resume/filler words
  'resume', 'cv', 'curriculum', 'vitae', 'summary', 'objective', 'profile',
  'personal', 'details', 'information', 'contact', 'address', 'phone', 'email',
  'mobile', 'number', 'date', 'birth', 'gender', 'nationality', 'marital', 'status',
  'education', 'experience', 'skills', 'work', 'professional', 'career', 'history',
  'employment', 'qualification', 'qualifications', 'achievements', 'projects',
  'references', 'hobbies', 'interests', 'languages', 'certifications', 'awards',
  'responsibilities', 'duties', 'description', 'job', 'position', 'role',
  'seeking', 'looking', 'dedicated', 'motivated', 'experienced', 'results',
  'driven', 'oriented', 'passionate', 'dynamic', 'detail', 'team', 'player',
  'developer', 'engineer', 'manager', 'analyst', 'designer', 'consultant',
  'specialist', 'coordinator', 'administrator', 'architect', 'lead', 'senior',
  'junior', 'intern', 'trainee', 'software', 'web', 'full', 'stack', 'front',
  'end', 'back', 'data', 'years', 'year', 'over', 'more',
]);

function isNoisyWord(w) {
  return NOISE_WORDS.has(w.toLowerCase());
}

/**
 * Strip emails, phone numbers, URLs, and special chars from a text line,
 * leaving only clean alphabetic tokens.
 */
function stripContactInfo(text) {
  return text
    // remove emails
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, ' ')
    // remove URLs / LinkedIn
    .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, ' ')
    .replace(/linkedin\.com[^\s]*/gi, ' ')
    // remove phone numbers (various formats)
    .replace(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g, ' ')
    // remove standalone digits / numeric strings
    .replace(/\b\d+\b/g, ' ')
    // remove common separators & symbols (pipes, bullets, colons, etc.)
    .replace(/[|·•●►▪,:;#@()\[\]{}<>\/\\]+/g, ' ')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * From a cleaned string, extract consecutive alphabetic tokens
 * that look like a person's name (2-4 words, not noise).
 */
function findNameInCleanedText(cleaned) {
  // Allow single-character initials (like "J.") as well as full words
  const words = cleaned.split(/\s+/).filter(w => /^[A-Za-z][A-Za-z.\-']*$/.test(w));

  // Slide a window of 2-4 consecutive non-noise words
  for (let size = 2; size <= Math.min(4, words.length); size++) {
    for (let start = 0; start <= words.length - size; start++) {
      const chunk = words.slice(start, start + size);
      const nonNoise = chunk.filter(w => !isNoisyWord(w));
      if (nonNoise.length >= 2) {
        return toTitleCase(nonNoise.join(' '));
      }
    }
  }

  // Fallback: if there's exactly 1 non-noise word with 3+ chars, return it
  const nonNoiseAll = words.filter(w => !isNoisyWord(w) && w.length >= 3);
  if (nonNoiseAll.length === 1) {
    return toTitleCase(nonNoiseAll[0]);
  }

  return null;
}

function extractName(lines, nameHint, fileName) {
  const fullText = lines.join('\n');

  // --- Strategy 0: Use nameHint from PDF (largest font on page 1) ---
  if (nameHint) {
    // nameHint may contain multiple lines (one per font size)
    for (const hintLine of nameHint.split('\n')) {
      const cleaned = stripContactInfo(hintLine);
      const name = findNameInCleanedText(cleaned);
      if (name) {
        console.log('[Name Extract] Found via nameHint:', name, '| raw hint:', hintLine);
        return name;
      }
    }
  }

  // --- Strategy 1: Explicit "Name:" label ---
  const nameLabel = fullText.match(/\bname\s*[:\-–]\s*(.+)/i);
  if (nameLabel) {
    const cleaned = stripContactInfo(nameLabel[1]);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 2: Clean the first line and extract name ---
  if (lines.length > 0) {
    const cleaned = stripContactInfo(lines[0]);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 3: Clean each of the first 10 lines and look for a name ---
  for (const line of lines.slice(1, 10)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = stripContactInfo(trimmed);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 4: Look after Personal Summary / Profile / About Me header ---
  const summaryHeader = fullText.match(/(?:personal\s+summary|about\s+me|profile|summary)\s*[:\-–]?\s*\n?\s*(.+)/i);
  if (summaryHeader) {
    const cleaned = stripContactInfo(summaryHeader[1]);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 5: Split entire top section by double-space / pipe / newline ---
  const segments = fullText.split(/\s{2,}|\n|\|/).filter(s => s.trim());
  for (const seg of segments.slice(0, 25)) {
    const cleaned = stripContactInfo(seg);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  console.log('[Name Extract] All strategies failed. First 5 lines:', lines.slice(0, 5));
  if (nameHint) console.log('[Name Extract] nameHint was:', nameHint);

  // --- Strategy 6: Try to extract name from the filename ---
  if (fileName) {
    // Remove extension, replace separators with spaces
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[_\-+.]+/g, ' ');
    const cleaned = stripContactInfo(baseName);
    const name = findNameInCleanedText(cleaned);
    if (name) {
      console.log('[Name Extract] Found via filename:', name);
      return name;
    }
  }

  return 'Unknown';
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) =>
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : '';
}

function extractPhone(text) {
  const match = text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  return match ? match[0] : '';
}

const SKILL_KEYWORDS = [
  'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js', 'nodejs', 'express',
  'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot',
  'c#', '.net', 'asp.net', 'c++', 'go', 'golang', 'rust', 'ruby', 'rails',
  'php', 'laravel', 'swift', 'kotlin', 'flutter', 'react native',
  'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform',
  'jenkins', 'ci/cd', 'git', 'github', 'gitlab',
  'html', 'css', 'sass', 'tailwind', 'bootstrap',
  'graphql', 'rest', 'api', 'microservices',
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'nlp',
  'data science', 'pandas', 'numpy', 'scikit-learn',
  'agile', 'scrum', 'jira', 'confluence',
  'salesforce', 'apex', 'lwc', 'lightning',
  'figma', 'sketch', 'ui/ux', 'photoshop',
  'linux', 'unix', 'bash', 'shell scripting',
  'oracle', 'sap', 'power bi', 'tableau',
  'blockchain', 'solidity', 'web3',
  'rxjs', 'ngrx', 'redux', 'mobx', 'zustand',
  'next.js', 'nextjs', 'nuxt', 'gatsby', 'svelte',
  'hadoop', 'spark', 'kafka', 'rabbitmq',
];

function extractSkills(text) {
  const lowerText = text.toLowerCase();
  const found = [];

  for (const skill of SKILL_KEYWORDS) {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      found.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  return [...new Set(found)];
}

function extractExperience(text) {
  const patterns = [
    /(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|exp)/i,
    /experience[:\s]*(\d+)\+?\s*years?/i,
    /(\d+)\+?\s*years?\s*(?:in\s+)?(?:software|development|engineering|IT)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  return null;
}

function extractEducation(text) {
  const degrees = [];
  const eduPatterns = [
    /\b(ph\.?d|doctorate)\b/i,
    /\b(master'?s?|m\.?s\.?|m\.?b\.?a\.?|m\.?tech)\b/i,
    /\b(bachelor'?s?|b\.?s\.?|b\.?e\.?|b\.?tech|b\.?a\.?)\b/i,
  ];

  for (const pattern of eduPatterns) {
    if (pattern.test(text)) {
      degrees.push(text.match(pattern)[0]);
    }
  }
  return degrees;
}

function extractSummary(lines) {
  // Take first 3-5 meaningful lines as summary
  const summary = lines.slice(0, 5).join(' ').substring(0, 500);
  return summary;
}

function extractJobTitle(lines) {
  // Try to find a line with "job title", "position", "role" prefix
  for (const line of lines.slice(0, 10)) {
    if (/^(job\s*title|position|role)\s*[:\-]/i.test(line.trim())) {
      return line.replace(/^(job\s*title|position|role)\s*[:\-]\s*/i, '').trim();
    }
  }
  // First meaningful line might be the title
  if (lines.length > 0) return lines[0].trim();
  return 'Unknown Position';
}

function extractRequiredExperience(text) {
  const patterns = [
    /(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|exp)/i,
    /minimum\s+(\d+)\s*years?/i,
    /at\s+least\s+(\d+)\s*years?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  return null;
}

function extractRequiredEducation(text) {
  return extractEducation(text);
}

function extractSection(text, sectionHeaders) {
  const lines = text.split('\n');
  const items = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (sectionHeaders.some(h => lower.includes(h))) {
      inSection = true;
      continue;
    }

    if (inSection) {
      // Stop at next section header
      if (/^[A-Z][a-zA-Z\s]+:?\s*$/.test(trimmed) && trimmed.length < 60) {
        break;
      }
      if (trimmed) {
        items.push(trimmed.replace(/^[-•*]\s*/, ''));
      }
    }
  }

  return items;
}
