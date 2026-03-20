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
 */
export function extractResumeInfo(text) {
  const lines = text.split('\n').filter(l => l.trim());

  return {
    name: extractName(lines),
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

function extractName(lines) {
  // First non-empty line is often the name
  if (lines.length > 0) {
    const first = lines[0].trim();
    // Check if it looks like a name (2-4 words, mostly letters)
    const words = first.split(/\s+/);
    if (words.length >= 1 && words.length <= 5 && words.every(w => /^[A-Za-z.\-']+$/.test(w))) {
      return first;
    }
  }
  return 'Unknown';
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
