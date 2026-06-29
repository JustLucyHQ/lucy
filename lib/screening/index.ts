type ScreeningClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>;
import { getProvider } from '@/lib/providers';
import type {
  Screening,
  StartScreeningRequest,
  ScreeningAnswer,
  ScreeningGrade,
  ScreeningQuestion,
} from './types';
import {
  buildQuestionGenerationPrompt,
  buildProfileVerificationPrompt,
  buildGradingPrompt,
  parseGradingResponse,
  parseQuestionsResponse,
} from './grading';

const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

import { decryptProviderKey } from '@/lib/auth/provider-keys';

async function callLLM(
  prompt: string,
  providerName: string,
  model: string,
  apiKeys: Record<string, string>
): Promise<string> {
  const apiKey = apiKeys[providerName];
  if (!apiKey) {
    throw new Error(`No API key for provider: ${providerName}`);
  }

  const provider = getProvider(providerName as 'openai' | 'anthropic' | 'google');
  let fullResponse = '';

  await provider.chat(
    [{ role: 'user', content: prompt }],
    model,
    (chunk) => { fullResponse += chunk; },
    { apiKey }
  );

  return fullResponse;
}

function resolveApiKeysFromEnv(): Record<string, string> {
  return {
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    google: process.env.GOOGLE_API_KEY || '',
  };
}

async function resolveApiKeys(supabase?: ScreeningClient): Promise<Record<string, string>> {
  const keys = resolveApiKeysFromEnv();
  const missing = !keys.openai && !keys.anthropic && !keys.google;
  if (!missing && (keys.openai || keys.anthropic || keys.google)) {
    const hasReal = Object.values(keys).some(k => k.length > 10);
    if (hasReal) return keys;
  }
  if (!supabase) return keys;
  try {
    const { data } = await supabase
      .from('provider_configs')
      .select('provider, api_key_encrypted')
      .eq('is_active', true);
    for (const row of data || []) {
      const p = row.provider as string;
      if (p in keys && row.api_key_encrypted) {
        const decrypted = decryptProviderKey(row.api_key_encrypted as string);
        if (decrypted.length > 10) keys[p] = decrypted;
      }
    }
  } catch { /* env-only fallback */ }
  return keys;
}

export async function startScreening(
  supabase: ScreeningClient,
  request: StartScreeningRequest,
  createdBy?: string
): Promise<Screening> {
  const providerName = request.provider || DEFAULT_PROVIDER;
  const model = request.model || DEFAULT_MODEL;

  const { data: screening, error: insertError } = await supabase
    .from('screenings')
    .insert({
      project_id: request.project_id || 0,
      contractor_company_id: request.contractor_company_id,
      client_company_id: request.client_company_id,
      screening_type: request.screening_type,
      contractor_profile: request.contractor_profile,
      project_brief: request.project_brief || null,
      custom_questions: request.custom_questions || null,
      documents_provided: request.documents || null,
      provider: providerName,
      model,
      status: 'pending',
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (insertError || !screening) {
    throw new Error(insertError?.message || 'Failed to create screening');
  }

  if (request.screening_type === 'profile_verification') {
    generateAndGradeProfile(supabase, screening.id, request, providerName, model).catch(() => {});
  } else {
    generateQuestions(supabase, screening.id, request, providerName, model).catch(() => {});
  }

  return screening as Screening;
}

async function generateQuestions(
  supabase: ScreeningClient,
  screeningId: string,
  request: StartScreeningRequest,
  providerName: string,
  model: string
): Promise<void> {
  try {
    await supabase
      .from('screenings')
      .update({ status: 'generating_questions' })
      .eq('id', screeningId);

    const prompt = buildQuestionGenerationPrompt(
      request.contractor_profile,
      request.project_brief,
      request.custom_questions
    );

    const apiKeys = await resolveApiKeys(supabase);
    const raw = await callLLM(prompt, providerName, model, apiKeys);
    const questions = parseQuestionsResponse(raw);

    await supabase
      .from('screenings')
      .update({
        questions,
        status: 'awaiting_answers',
      })
      .eq('id', screeningId);
  } catch (err) {
    await supabase
      .from('screenings')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Question generation failed',
      })
      .eq('id', screeningId);
  }
}

async function generateAndGradeProfile(
  supabase: ScreeningClient,
  screeningId: string,
  request: StartScreeningRequest,
  providerName: string,
  model: string
): Promise<void> {
  try {
    await supabase
      .from('screenings')
      .update({ status: 'grading' })
      .eq('id', screeningId);

    const prompt = buildProfileVerificationPrompt(request.contractor_profile);
    const apiKeys = await resolveApiKeys(supabase);
    const raw = await callLLM(prompt, providerName, model, apiKeys);
    const grade = parseGradingResponse(raw);

    await supabase
      .from('screenings')
      .update({
        grade: grade.grade,
        grade_label: grade.grade_label,
        summary: grade.summary,
        strengths: grade.strengths,
        concerns: grade.concerns,
        transcript: [{ question_id: 'profile_review', question: 'Profile verification', answer: raw }],
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', screeningId);
  } catch (err) {
    await supabase
      .from('screenings')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Profile verification failed',
      })
      .eq('id', screeningId);
  }
}

export async function submitAnswers(
  supabase: ScreeningClient,
  screeningId: string,
  answers: Array<{ question_id: string; answer: string }>,
  ownerId?: string
): Promise<Screening> {
  // Tenant scoping (service-role client bypasses RLS — see getScreening)
  let lookup = supabase.from('screenings').select('*').eq('id', screeningId);
  if (ownerId) lookup = lookup.eq('created_by', ownerId);
  const { data: screening, error } = await lookup.single();

  if (error || !screening) {
    throw new Error('Screening not found');
  }

  if (screening.status !== 'awaiting_answers') {
    throw new Error(`Cannot submit answers: screening status is ${screening.status}`);
  }

  const questions: ScreeningQuestion[] = screening.questions || [];
  const answerRecords: ScreeningAnswer[] = answers.map((a) => {
    const q = questions.find((q) => q.id === a.question_id);
    return {
      question_id: a.question_id,
      question_text: q?.text || a.question_id,
      answer: a.answer,
      answered_at: new Date().toISOString(),
    };
  });

  const answerInserts = answerRecords.map((a) => ({
    screening_id: screeningId,
    question_id: a.question_id,
    question_text: a.question_text,
    answer: a.answer,
  }));

  await supabase.from('screening_answers').insert(answerInserts);

  await supabase
    .from('screenings')
    .update({ status: 'grading', transcript: answerRecords })
    .eq('id', screeningId);

  gradeScreening(
    supabase,
    screeningId,
    screening.contractor_profile,
    screening.project_brief,
    answerRecords,
    screening.provider || DEFAULT_PROVIDER,
    screening.model || DEFAULT_MODEL
  ).catch(() => {});

  const { data: updated } = await supabase
    .from('screenings')
    .select('*')
    .eq('id', screeningId)
    .single();

  return (updated || screening) as Screening;
}

async function gradeScreening(
  supabase: ScreeningClient,
  screeningId: string,
  profile: Record<string, unknown>,
  projectBrief: string | null,
  answers: ScreeningAnswer[],
  providerName: string,
  model: string
): Promise<void> {
  try {
    const prompt = buildGradingPrompt(
      profile as unknown as import('./types').ContractorProfile,
      projectBrief || undefined,
      answers
    );

    const apiKeys = await resolveApiKeys(supabase);
    const raw = await callLLM(prompt, providerName, model, apiKeys);
    const grade = parseGradingResponse(raw);

    await supabase
      .from('screenings')
      .update({
        grade: grade.grade,
        grade_label: grade.grade_label,
        summary: grade.summary,
        strengths: grade.strengths,
        concerns: grade.concerns,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', screeningId);
  } catch (err) {
    await supabase
      .from('screenings')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Grading failed',
      })
      .eq('id', screeningId);
  }
}

export async function getScreening(
  supabase: ScreeningClient,
  screeningId: string,
  ownerId?: string
): Promise<Screening | null> {
  // API routes use the service-role client (bypasses RLS), so tenant scoping
  // must happen here: ownerId restricts reads to screenings the caller created.
  let query = supabase.from('screenings').select('*').eq('id', screeningId);
  if (ownerId) query = query.eq('created_by', ownerId);
  const { data } = await query.single();

  return (data as Screening) || null;
}

export async function listScreenings(
  supabase: ScreeningClient,
  filters: {
    project_id?: number;
    contractor_company_id?: number;
    client_company_id?: number;
    status?: string;
  },
  ownerId?: string
): Promise<Screening[]> {
  let query = supabase.from('screenings').select('*').order('created_at', { ascending: false });

  if (ownerId) query = query.eq('created_by', ownerId);
  if (filters.project_id) query = query.eq('project_id', filters.project_id);
  if (filters.contractor_company_id) query = query.eq('contractor_company_id', filters.contractor_company_id);
  if (filters.client_company_id) query = query.eq('client_company_id', filters.client_company_id);
  if (filters.status) query = query.eq('status', filters.status);

  const { data } = await query;
  return (data as Screening[]) || [];
}
