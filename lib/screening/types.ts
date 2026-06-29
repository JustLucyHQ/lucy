export type ScreeningType = 'profile_verification' | 'project_screening';

export type ScreeningStatus =
  | 'pending'
  | 'generating_questions'
  | 'awaiting_answers'
  | 'grading'
  | 'completed'
  | 'failed';

export interface ScreeningQuestion {
  id: string;
  text: string;
  category: 'experience' | 'technical' | 'behavioral' | 'custom';
}

export interface ScreeningAnswer {
  question_id: string;
  question_text: string;
  answer: string;
  answered_at?: string;
}

export interface ScreeningGrade {
  grade: number;
  grade_label: string;
  summary: string;
  strengths: string[];
  concerns: string[];
}

export interface ContractorProfile {
  company_id: number;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  description?: string;
  qualifications?: string[];
  skills?: string[];
  experience?: string[];
  employment_history?: string[];
  pi_insurance?: boolean;
  daily_rate?: number;
  is_remote?: boolean;
  location?: string;
  projects_completed?: number;
}

export interface StartScreeningRequest {
  screening_type: ScreeningType;
  contractor_company_id: number;
  client_company_id: number;
  project_id?: number;
  project_brief?: string;
  custom_questions?: string[];
  documents?: string[];
  contractor_profile: ContractorProfile;
  provider?: string;
  model?: string;
}

export interface SubmitAnswersRequest {
  answers: Array<{ question_id: string; answer: string }>;
}

export interface Screening {
  id: string;
  project_id: number;
  contractor_company_id: number;
  client_company_id: number;
  screening_type: ScreeningType;
  contractor_profile: ContractorProfile | null;
  project_brief: string | null;
  custom_questions: string[] | null;
  documents_provided: string[] | null;
  questions: ScreeningQuestion[] | null;
  grade: number | null;
  grade_label: string | null;
  summary: string | null;
  strengths: string[] | null;
  concerns: string[] | null;
  transcript: ScreeningAnswer[] | null;
  status: ScreeningStatus;
  error_message: string | null;
  provider: string | null;
  model: string | null;
  tokens_used: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const GRADE_LABELS: Record<number, string> = {
  5: 'Excellent Match',
  4: 'Good Fit',
  3: 'Potential Fit',
  2: 'Weak Fit',
  1: 'Not Recommended',
};
