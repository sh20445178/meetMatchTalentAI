/**
 * Resume-JD Matching Engine
 * Uses keyword matching, skill overlap, and experience scoring
 * to rank resumes against a job description.
 */

export function matchResumeToJob(resume, jobDescription) {
  const scores = {
    skillMatch: calculateSkillMatch(resume.skills, jobDescription.requiredSkills),
    experienceMatch: calculateExperienceMatch(resume.experience, jobDescription.experience),
    educationMatch: calculateEducationMatch(resume.education, jobDescription.education),
    keywordMatch: calculateKeywordMatch(resume.rawText, jobDescription.rawText),
  };

  // Weighted overall score
  const weights = { skillMatch: 0.40, experienceMatch: 0.20, educationMatch: 0.15, keywordMatch: 0.25 };
  scores.overall = Object.entries(weights).reduce(
    (total, [key, weight]) => total + (scores[key] * weight), 0
  );

  scores.overall = Math.round(scores.overall);

  return {
    ...scores,
    matchedSkills: getMatchedSkills(resume.skills, jobDescription.requiredSkills),
    missingSkills: getMissingSkills(resume.skills, jobDescription.requiredSkills),
    recommendation: getRecommendation(scores.overall),
  };
}

function normalizeSkill(skill) {
  return skill.toLowerCase().trim().replace(/[.\-\/]/g, '');
}

function calculateSkillMatch(resumeSkills, jdSkills) {
  if (!jdSkills || jdSkills.length === 0) return 50;
  if (!resumeSkills || resumeSkills.length === 0) return 0;

  const normalizedResume = new Set(resumeSkills.map(normalizeSkill));
  const normalizedJd = jdSkills.map(normalizeSkill);

  let matched = 0;
  for (const skill of normalizedJd) {
    if (normalizedResume.has(skill)) {
      matched++;
    } else {
      // Partial match: check if any resume skill contains the JD skill or vice versa
      for (const rSkill of normalizedResume) {
        if (rSkill.includes(skill) || skill.includes(rSkill)) {
          matched += 0.5;
          break;
        }
      }
    }
  }

  return Math.min(100, Math.round((matched / normalizedJd.length) * 100));
}

function calculateExperienceMatch(resumeExp, jdExp) {
  if (jdExp === null || jdExp === undefined) return 70; // No requirement specified
  if (resumeExp === null || resumeExp === undefined) return 30; // No info from resume

  if (resumeExp >= jdExp) return 100;
  if (resumeExp >= jdExp - 1) return 80;
  if (resumeExp >= jdExp - 2) return 60;
  if (resumeExp >= jdExp / 2) return 40;
  return 20;
}

function calculateEducationMatch(resumeEdu, jdEdu) {
  if (!jdEdu || jdEdu.length === 0) return 70;
  if (!resumeEdu || resumeEdu.length === 0) return 30;

  const eduLevel = (edu) => {
    const str = edu.join(' ').toLowerCase();
    if (/ph\.?d|doctorate/.test(str)) return 4;
    if (/master|m\.?s|m\.?b\.?a|m\.?tech/.test(str)) return 3;
    if (/bachelor|b\.?s|b\.?e|b\.?tech|b\.?a/.test(str)) return 2;
    return 1;
  };

  const resumeLevel = eduLevel(resumeEdu);
  const jdLevel = eduLevel(jdEdu);

  if (resumeLevel >= jdLevel) return 100;
  if (resumeLevel >= jdLevel - 1) return 70;
  return 40;
}

function calculateKeywordMatch(resumeText, jdText) {
  if (!jdText || !resumeText) return 0;

  // Extract meaningful keywords (3+ char words) from JD
  const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'her', 'was', 'one', 'our', 'out', 'with', 'will', 'that', 'this', 'have', 'from', 'they', 'been', 'said', 'each', 'which', 'their', 'about', 'would', 'make', 'like', 'into', 'could', 'time', 'very', 'when', 'come', 'than', 'look', 'only', 'also', 'back', 'after', 'work', 'first', 'well', 'even', 'must', 'should', 'where', 'just', 'being', 'over', 'such', 'other', 'what', 'some', 'know']);

  const jdWords = jdText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const keywords = [...new Set(jdWords.filter(w => !stopWords.has(w)))];

  if (keywords.length === 0) return 50;

  const resumeLower = resumeText.toLowerCase();
  let matched = 0;
  for (const keyword of keywords) {
    if (resumeLower.includes(keyword)) matched++;
  }

  return Math.min(100, Math.round((matched / keywords.length) * 100));
}

function getMatchedSkills(resumeSkills, jdSkills) {
  if (!resumeSkills || !jdSkills) return [];
  const normalizedResume = new Set(resumeSkills.map(normalizeSkill));
  return jdSkills.filter(skill => {
    const norm = normalizeSkill(skill);
    return normalizedResume.has(norm) ||
      [...normalizedResume].some(r => r.includes(norm) || norm.includes(r));
  });
}

function getMissingSkills(resumeSkills, jdSkills) {
  if (!jdSkills) return [];
  if (!resumeSkills) return jdSkills;
  const normalizedResume = new Set(resumeSkills.map(normalizeSkill));
  return jdSkills.filter(skill => {
    const norm = normalizeSkill(skill);
    return !normalizedResume.has(norm) &&
      ![...normalizedResume].some(r => r.includes(norm) || norm.includes(r));
  });
}

function getRecommendation(score) {
  if (score >= 80) return { label: 'Strong Match', color: '#16a34a', icon: '★★★' };
  if (score >= 60) return { label: 'Good Match', color: '#2563eb', icon: '★★' };
  if (score >= 40) return { label: 'Partial Match', color: '#d97706', icon: '★' };
  return { label: 'Weak Match', color: '#dc2626', icon: '○' };
}

/**
 * Rank multiple resumes against a single job description.
 */
export function rankResumes(resumes, jobDescription) {
  return resumes
    .map((resume, index) => ({
      resume,
      index,
      match: matchResumeToJob(resume, jobDescription),
    }))
    .sort((a, b) => b.match.overall - a.match.overall);
}
