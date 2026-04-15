import mammoth from 'mammoth';
import { readFileAsArrayBuffer } from './fileReader';

/**
 * Parse a Word (.docx) file and extract text content.
 */
/**
 * As a last resort, read the .docx as raw text and scrape XML content.
 * A .docx is a ZIP file containing XML; raw text extraction can recover
 * readable fragments from the XML tags (e.g. <w:t>text</w:t>).
 */
async function extractTextFromRawDocx(file) {
  try {
    const raw = await file.text();
    if (!raw || raw.length === 0) return null;
    // Extract text from <w:t ...>...</w:t> tags (Word XML)
    const wtMatches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (wtMatches && wtMatches.length > 0) {
      const texts = wtMatches.map(m => m.replace(/<\/?w:t[^>]*>/g, ''));
      const joined = texts.join(' ').replace(/\s+/g, ' ').trim();
      if (joined.length > 20) return joined;
    }
    // Fallback: extract anything that looks like readable text (no binary junk)
    const readable = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    // Only return if we got meaningful content
    if (readable.length > 50) return readable;
    return null;
  } catch (e) {
    console.warn('[Word Parser] Raw text extraction failed:', e.message);
    return null;
  }
}

export async function parseWordFile(file) {
  let arrayBuffer;
  try {
    arrayBuffer = await readFileAsArrayBuffer(file);
  } catch (err) {
    // readFileAsArrayBuffer failed — try raw text extraction as last resort
    console.warn('[Word Parser] ArrayBuffer read failed, trying raw text extraction...');
    const rawText = await extractTextFromRawDocx(file);
    if (rawText) {
      return { text: rawText, messages: [{ type: 'warning', message: 'Extracted via raw text (DLP fallback)' }] };
    }
    throw err;
  }

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    // Try raw text before giving up
    const rawText = await extractTextFromRawDocx(file);
    if (rawText) {
      return { text: rawText, messages: [{ type: 'warning', message: 'Extracted via raw text (empty buffer fallback)' }] };
    }
    throw new Error('File "' + file.name + '" is empty or could not be read.');
  }

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('No text content found in "' + file.name + '". The file may be image-based or corrupted.');
    }
    return {
      text: result.value,
      messages: result.messages,
    };
  } catch (err) {
    if (err.message && err.message.startsWith('No text content')) throw err;
    console.error('[Word Parser] mammoth error for', file.name, err);
    // Try raw text extraction before failing entirely
    const rawText = await extractTextFromRawDocx(file);
    if (rawText) {
      return { text: rawText, messages: [{ type: 'warning', message: 'Extracted via raw text (mammoth fallback)' }] };
    }
    throw new Error(
      'Could not parse "' + file.name + '". Make sure it is a valid .docx file (not .doc). ' +
      (err.message || '')
    );
  }
}

/**
 * Extract structured resume information from raw text.
 * @param {string} text - The full text of the resume.
 * @param {string} [nameHint] - Optional name hint (e.g. largest font text from PDF).
 * @param {string} [fileName] - Original filename, used as last resort for name extraction.
 */
export function extractResumeInfo(text, nameHint, fileName) {
  const normalized = normalizeResumeText(text);
  const lines = normalized.split('\n').filter(l => l.trim());

  return {
    name: extractName(lines, nameHint, fileName),
    email: extractEmail(normalized),
    phone: extractPhone(normalized),
    skills: extractSkills(normalized),
    experience: extractExperience(normalized),
    education: extractEducation(normalized),
    summary: extractSummary(lines),
    rawText: normalized,
  };
}

// Standard section headings to recognize in any format
const SECTION_HEADINGS = [
  'personal summary', 'professional summary', 'career summary', 'summary',
  'objective', 'career objective', 'profile', 'about me', 'about',
  'experience', 'work experience', 'professional experience', 'employment history',
  'work history', 'career history',
  'education', 'academic qualifications', 'qualifications',
  'skills', 'technical skills', 'core competencies', 'key skills',
  'certifications', 'certificates', 'licenses',
  'projects', 'key projects', 'notable projects',
  'achievements', 'accomplishments', 'awards',
  'languages', 'interests', 'hobbies', 'references',
  'contact', 'contact information', 'personal details', 'personal information',
];

/**
 * Normalize raw resume text into a standard, clean format.
 * - Fixes encoding artifacts and special characters
 * - Collapses extra whitespace and blank lines
 * - Standardizes section headings
 * - Ensures each section heading appears on its own line
 * - Cleans up bullet characters and list markers
 */
function normalizeResumeText(text) {
  let t = text;

  // Fix common encoding artifacts
  t = t.replace(/\u00a0/g, ' ');               // non-breaking space → space
  t = t.replace(/\u2018|\u2019/g, "'");         // smart quotes
  t = t.replace(/\u201c|\u201d/g, '"');         // smart double quotes
  t = t.replace(/\u2013|\u2014/g, '-');         // en/em dash → hyphen
  t = t.replace(/\u2026/g, '...');              // ellipsis
  t = t.replace(/\ufffd/g, '');                 // replacement character
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // normalize line endings

  // Standardize bullet characters to a simple dash
  t = t.replace(/[•●►▸▪■◆○◇➤➢✓✔→⇒]/g, '-');
  t = t.replace(/^\s*[▪·∙⋅]\s*/gm, '- ');

  // Collapse multiple spaces (but preserve newlines)
  t = t.replace(/[^\S\n]+/g, ' ');

  // Collapse 3+ blank lines into 2
  t = t.replace(/\n{3,}/g, '\n\n');

  // Ensure section headings are on their own line and standardized
  // Build a regex that matches any known heading (case-insensitive)
  const headingPattern = SECTION_HEADINGS
    .sort((a, b) => b.length - a.length) // longest first to avoid partial matches
    .map(h => h.replace(/\s+/g, '\\s+'))
    .join('|');

  const headingRegex = new RegExp(
    `(?:^|\\n)\\s*(${headingPattern})\\s*[:–\\-]?\\s*(?=\\n|$)`,
    'gim'
  );

  t = t.replace(headingRegex, (match, heading) => {
    // Capitalize the heading
    const standardized = heading.trim().replace(/\b\w/g, c => c.toUpperCase());
    return '\n\n' + standardized + '\n';
  });

  // Also handle inline headings (heading followed by content on same line)
  const inlineHeadingRegex = new RegExp(
    `(?:^|\\n)\\s*(${headingPattern})\\s*[:–\\-]\\s*(.+)`,
    'gim'
  );

  t = t.replace(inlineHeadingRegex, (match, heading, content) => {
    const standardized = heading.trim().replace(/\b\w/g, c => c.toUpperCase());
    return '\n\n' + standardized + '\n' + content.trim();
  });

  // Trim each line
  t = t.split('\n').map(l => l.trim()).join('\n');

  // Final cleanup: collapse leading/trailing blank lines
  t = t.replace(/^\n+/, '').replace(/\n+$/, '');

  return t;
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

// Company/org indicators — if a candidate name contains these, it's likely a company
const COMPANY_WORDS = new Set([
  'ltd', 'llc', 'llp', 'inc', 'corp', 'corporation', 'company', 'co',
  'limited', 'pvt', 'private', 'public', 'group', 'holdings', 'enterprise',
  'enterprises', 'solutions', 'services', 'technologies', 'technology', 'tech',
  'consulting', 'consultancy', 'systems', 'global', 'international', 'industries',
  'associates', 'partners', 'digital', 'infotech', 'infosys', 'wipro', 'tcs',
  'cognizant', 'accenture', 'capgemini', 'deloitte', 'google', 'microsoft',
  'amazon', 'apple', 'facebook', 'meta', 'oracle', 'ibm', 'samsung', 'intel',
  'cisco', 'adobe', 'salesforce', 'sap', 'hcl', 'mindtree', 'mphasis',
  'hexaware', 'persistent', 'zensar', 'lti', 'ltimindtree', 'cyient', 'virtusa',
  'employer', 'client', 'organization', 'organisation',
]);

function isNoisyWord(w) {
  return NOISE_WORDS.has(w.toLowerCase());
}

function looksLikeCompany(candidate) {
  const words = candidate.toLowerCase().split(/\s+/);
  return words.some(w => COMPANY_WORDS.has(w));
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
 * that look like a person's name (2-4 words, not noise, not a company).
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
        const candidate = nonNoise.join(' ');
        if (!looksLikeCompany(candidate)) {
          return toTitleCase(candidate);
        }
      }
    }
  }

  // Fallback: if there's exactly 1 non-noise word with 3+ chars, return it
  const nonNoiseAll = words.filter(w => !isNoisyWord(w) && w.length >= 3 && !COMPANY_WORDS.has(w.toLowerCase()));
  if (nonNoiseAll.length === 1) {
    return toTitleCase(nonNoiseAll[0]);
  }

  return null;
}

/**
 * Try to derive a candidate name from their email address.
 * E.g. "john.doe@gmail.com" → "John Doe", "madhu_rao123@wipro.com" → "Madhu Rao"
 */
function extractNameFromEmail(text) {
  const emailMatch = text.match(/([a-zA-Z0-9._%+\-]+)@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (!emailMatch) return null;

  const local = emailMatch[1];
  // Split on dots, underscores, hyphens, and digits
  const parts = local.split(/[._\-]+/).filter(p => /^[a-zA-Z]{2,}$/.test(p));

  if (parts.length >= 2 && parts.length <= 4) {
    const nonNoise = parts.filter(p => !isNoisyWord(p) && !COMPANY_WORDS.has(p.toLowerCase()));
    if (nonNoise.length >= 2) {
      return toTitleCase(nonNoise.join(' '));
    }
  }
  return null;
}

function extractName(lines, nameHint, fileName) {
  const fullText = lines.join('\n');

  // --- Strategy 0: Explicit "Name:" label (highest confidence) ---
  const nameLabel = fullText.match(/\bname\s*[:\-–]\s*(.+)/i);
  if (nameLabel) {
    const cleaned = stripContactInfo(nameLabel[1]);
    const name = findNameInCleanedText(cleaned);
    if (name) {
      console.log('[Name Extract] Found via "Name:" label:', name);
      return name;
    }
  }

  // --- Strategy 1: Derive name from email address (very reliable) ---
  const emailName = extractNameFromEmail(fullText);
  if (emailName) {
    console.log('[Name Extract] Found via email:', emailName);
    return emailName;
  }

  // --- Strategy 2: Use nameHint from PDF (largest font on page 1) ---
  // Only if it doesn't look like a company name
  if (nameHint) {
    for (const hintLine of nameHint.split('\n')) {
      const cleaned = stripContactInfo(hintLine);
      const name = findNameInCleanedText(cleaned);
      if (name) {
        console.log('[Name Extract] Found via nameHint:', name, '| raw hint:', hintLine);
        return name;
      }
    }
  }

  // --- Strategy 3: Clean the first line and extract name ---
  if (lines.length > 0) {
    const cleaned = stripContactInfo(lines[0]);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 4: Clean each of the first 10 lines ---
  for (const line of lines.slice(1, 10)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = stripContactInfo(trimmed);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 5: Look after Personal Summary / Profile / About Me header ---
  const summaryHeader = fullText.match(/(?:personal\s+summary|about\s+me|profile|summary)\s*[:\-–]?\s*\n?\s*(.+)/i);
  if (summaryHeader) {
    const cleaned = stripContactInfo(summaryHeader[1]);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  // --- Strategy 6: Split entire top section by double-space / pipe / newline ---
  const segments = fullText.split(/\s{2,}|\n|\|/).filter(s => s.trim());
  for (const seg of segments.slice(0, 25)) {
    const cleaned = stripContactInfo(seg);
    const name = findNameInCleanedText(cleaned);
    if (name) return name;
  }

  console.log('[Name Extract] All text strategies failed. First 5 lines:', lines.slice(0, 5));
  if (nameHint) console.log('[Name Extract] nameHint was:', nameHint);

  // --- Strategy 7: Extract name from the filename ---
  if (fileName) {
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
