import type { ContractorProfile, ScreeningQuestion, ScreeningAnswer, ScreeningGrade } from './types';
import { GRADE_LABELS } from './types';

function formatProfile(profile: ContractorProfile): string {
  const lines: string[] = [];

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    || profile.display_name || profile.company_name || 'Unknown';
  lines.push(`Name: ${name}`);

  if (profile.company_name) lines.push(`Company: ${profile.company_name}`);
  if (profile.description) lines.push(`About: ${profile.description}`);
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.daily_rate) lines.push(`Daily Rate: £${profile.daily_rate}`);
  if (profile.is_remote !== undefined) lines.push(`Remote: ${profile.is_remote ? 'Yes' : 'No'}`);
  if (profile.projects_completed) lines.push(`Projects Completed: ${profile.projects_completed}`);
  if (profile.pi_insurance) lines.push(`PI Insurance: Yes`);

  if (profile.qualifications?.length) {
    lines.push(`Qualifications: ${profile.qualifications.join(', ')}`);
  }
  if (profile.skills?.length) {
    lines.push(`Skills: ${profile.skills.join(', ')}`);
  }
  if (profile.experience?.length) {
    lines.push(`Experience: ${profile.experience.join('; ')}`);
  }
  if (profile.employment_history?.length) {
    lines.push(`Employment History: ${profile.employment_history.join('; ')}`);
  }

  return lines.join('\n');
}

export function buildQuestionGenerationPrompt(
  profile: ContractorProfile,
  projectBrief?: string,
  customQuestions?: string[]
): string {
  const parts: string[] = [
    `You are Lucy, an AI HR screening assistant for Contractors Room, a contractor marketplace.`,
    `Generate tailored screening questions for a contractor applying to a project.`,
    '',
    '## Contractor Profile',
    formatProfile(profile),
  ];

  if (projectBrief) {
    parts.push('', '## Project Brief', projectBrief);
  }

  if (customQuestions?.length) {
    parts.push('', '## Custom Questions from Client', '(Include these as-is in your output)');
    customQuestions.forEach((q, i) => parts.push(`${i + 1}. ${q}`));
  }

  parts.push(
    '',
    '## Instructions',
    'Generate 5-8 screening questions that:',
    '1. Verify claimed experience and qualifications',
    '2. Assess technical fit for the specific project requirements',
    '3. Probe for potential concerns or gaps in the profile',
    '4. Include any custom questions from the client (category: "custom")',
    '5. Are open-ended but focused — each should take 2-4 sentences to answer well',
    '',
    'Respond with ONLY valid JSON, no markdown fencing:',
    '{',
    '  "questions": [',
    '    { "id": "q1", "text": "...", "category": "experience|technical|behavioral|custom" }',
    '  ]',
    '}'
  );

  return parts.join('\n');
}

export function buildProfileVerificationPrompt(profile: ContractorProfile): string {
  return [
    'You are Lucy, an AI HR assistant for Contractors Room.',
    'Review this contractor profile for completeness, consistency, and credibility.',
    '',
    '## Contractor Profile',
    formatProfile(profile),
    '',
    '## Instructions',
    'Assess whether this profile is credible and complete enough to be marked as "Lucy Verified".',
    'Check for:',
    '- Consistency between skills, experience, and qualifications',
    '- Completeness (are key fields filled in?)',
    '- Red flags (implausible claims, gaps)',
    '',
    'Respond with ONLY valid JSON, no markdown fencing:',
    '{',
    '  "grade": <1-5>,',
    '  "grade_label": "<Excellent Match|Good Fit|Potential Fit|Weak Fit|Not Recommended>",',
    '  "summary": "<2-3 sentence assessment>",',
    '  "strengths": ["...", "..."],',
    '  "concerns": ["...", "..."],',
    '  "verified": <true if grade >= 3, false otherwise>',
    '}',
  ].join('\n');
}

export function buildGradingPrompt(
  profile: ContractorProfile,
  projectBrief: string | undefined,
  answers: ScreeningAnswer[]
): string {
  const parts: string[] = [
    'You are Lucy, an AI HR screening assistant for Contractors Room.',
    'Based on the contractor profile and their screening answers, provide a structured assessment.',
    '',
    '## Contractor Profile',
    formatProfile(profile),
  ];

  if (projectBrief) {
    parts.push('', '## Project Brief', projectBrief);
  }

  parts.push('', '## Screening Q&A');
  for (const a of answers) {
    parts.push(`Q: ${a.question_text}`);
    parts.push(`A: ${a.answer}`);
    parts.push('');
  }

  parts.push(
    '## Grading Scale',
    '5: Excellent Match — Highly qualified, strong relevant experience',
    '4: Good Fit — Well qualified with relevant skills',
    '3: Potential Fit — Some relevant experience, may need support',
    '2: Weak Fit — Limited relevant experience or concerns',
    '1: Not Recommended — Significant gaps or red flags',
    '',
    '## Instructions',
    'Evaluate the contractor for this project based on their profile and answers.',
    'Provide:',
    '1. A grade (1-5)',
    '2. The grade label',
    '3. A brief summary (2-3 sentences)',
    '4. Key strengths (3-5 bullet points)',
    '5. Concerns or gaps (0-5 bullet points)',
    '',
    'Respond with ONLY valid JSON, no markdown fencing:',
    '{',
    '  "grade": <number>,',
    '  "grade_label": "<label>",',
    '  "summary": "<summary>",',
    '  "strengths": ["..."],',
    '  "concerns": ["..."]',
    '}'
  );

  return parts.join('\n');
}

export function parseGradingResponse(raw: string): ScreeningGrade {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const grade = Math.max(1, Math.min(5, Math.round(Number(parsed.grade) || 3)));
    return {
      grade,
      grade_label: parsed.grade_label || GRADE_LABELS[grade] || 'Unknown',
      summary: parsed.summary || '',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
    };
  } catch {
    return {
      grade: 3,
      grade_label: 'Potential Fit',
      summary: 'Unable to parse structured assessment. Raw response preserved in transcript.',
      strengths: [],
      concerns: ['Assessment parsing failed — review transcript manually'],
    };
  }
}

export function parseQuestionsResponse(raw: string): ScreeningQuestion[] {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const questions = Array.isArray(parsed.questions) ? parsed.questions : parsed;

    return questions.map((q: { id?: string; text?: string; category?: string }, i: number) => ({
      id: q.id || `q${i + 1}`,
      text: q.text || '',
      category: (['experience', 'technical', 'behavioral', 'custom'].includes(q.category || '')
        ? q.category
        : 'behavioral') as ScreeningQuestion['category'],
    })).filter((q: ScreeningQuestion) => q.text);
  } catch {
    return [
      { id: 'q1', text: 'Please describe your relevant experience for this project.', category: 'experience' },
      { id: 'q2', text: 'What technical skills do you bring to this type of work?', category: 'technical' },
      { id: 'q3', text: 'How do you handle tight deadlines or scope changes?', category: 'behavioral' },
    ];
  }
}
