#!/usr/bin/env node

/**
 * Lucy MCP Server
 *
 * Exposes Lucy's screening capabilities via the Model Context Protocol (MCP).
 * Configure as an MCP server in Claude Code or other MCP clients:
 *
 *   {
 *     "mcpServers": {
 *       "lucy": {
 *         "command": "npx",
 *         "args": ["tsx", "lib/mcp/server.ts"],
 *         "cwd": "C:\\RepositoryAI\\LucyAI",
 *         "env": {
 *           "NEXT_PUBLIC_SUPABASE_URL": "http://localhost:8000",
 *           "SUPABASE_SERVICE_ROLE_KEY": "...",
 *           "OPENAI_API_KEY": "..."
 *         }
 *       }
 *     }
 *   }
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY — LLM keys
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// ── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { db: { schema: 'lucy' } });
}

// ── Inline screening helpers (avoid @/ path alias issues outside Next.js) ──

function resolveApiKeys(): Record<string, string> {
  return {
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    google: process.env.GOOGLE_API_KEY || '',
  };
}

interface ScreeningRow {
  id: string;
  status: string;
  screening_type: string;
  contractor_company_id: number;
  client_company_id: number;
  project_id: number;
  grade: number | null;
  grade_label: string | null;
  summary: string | null;
  strengths: string[] | null;
  concerns: string[] | null;
  questions: Array<{ id: string; text: string; category: string }> | null;
  transcript: unknown[] | null;
  created_at: string;
  completed_at: string | null;
  contractor_profile: Record<string, unknown> | null;
  project_brief: string | null;
  custom_questions: string[] | null;
  provider: string | null;
  model: string | null;
  error_message: string | null;
}

// ── Build server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'lucy',
  version: '1.0.0',
});

// ── Tool: start_screening ────────────────────────────────────────────────────

server.tool(
  'start_screening',
  'Start a new contractor screening (profile verification or project screening). Returns a screening_id to poll with get_screening.',
  {
    screening_type: z.enum(['profile_verification', 'project_screening'])
      .describe('Type of screening'),
    contractor_company_id: z.number().describe('Contractor company ID from Contractors Room'),
    client_company_id: z.number().describe('Client company ID from Contractors Room'),
    project_id: z.number().optional().describe('Project ID (required for project_screening)'),
    project_brief: z.string().optional().describe('Project description for context'),
    contractor_name: z.string().optional().describe('Contractor display name'),
    contractor_skills: z.array(z.string()).optional().describe('Contractor skills list'),
    contractor_qualifications: z.array(z.string()).optional().describe('Contractor qualifications'),
    contractor_description: z.string().optional().describe('Contractor profile description'),
    custom_questions: z.array(z.string()).optional().describe('Custom screening questions from the client'),
    provider: z.enum(['openai', 'anthropic', 'google']).optional().describe('LLM provider'),
    model: z.string().optional().describe('LLM model ID'),
  },
  async (params) => {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('screenings')
      .insert({
        project_id: params.project_id || 0,
        contractor_company_id: params.contractor_company_id,
        client_company_id: params.client_company_id,
        screening_type: params.screening_type,
        contractor_profile: {
          company_id: params.contractor_company_id,
          display_name: params.contractor_name,
          skills: params.contractor_skills,
          qualifications: params.contractor_qualifications,
          description: params.contractor_description,
        },
        project_brief: params.project_brief || null,
        custom_questions: params.custom_questions || null,
        provider: params.provider || 'openai',
        model: params.model || 'gpt-4o',
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      const isDuplicate = error.message.includes('duplicate') || error.message.includes('unique');
      return {
        content: [{
          type: 'text' as const,
          text: isDuplicate
            ? 'A screening already exists for this contractor/project. Use list_screenings to find it.'
            : `Error: ${error.message}`,
        }],
        isError: true,
      };
    }

    // Trigger async processing via Lucy's HTTP API
    const lucyUrl = process.env.LUCY_URL || 'http://localhost:3001';
    fetch(`${lucyUrl}/api/screening/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screening_type: params.screening_type,
        contractor_company_id: params.contractor_company_id,
        client_company_id: params.client_company_id,
        project_id: params.project_id,
        project_brief: params.project_brief,
        custom_questions: params.custom_questions,
        contractor_profile: {
          company_id: params.contractor_company_id,
          display_name: params.contractor_name,
          skills: params.contractor_skills,
          qualifications: params.contractor_qualifications,
          description: params.contractor_description,
        },
        provider: params.provider,
        model: params.model,
      }),
    }).catch(() => {});

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          screening_id: data.id,
          status: data.status,
          screening_type: data.screening_type,
          message: params.screening_type === 'profile_verification'
            ? 'Profile verification started. Poll get_screening for results.'
            : 'Screening started. Questions are being generated. Poll get_screening for status.',
        }, null, 2),
      }],
    };
  }
);

// ── Tool: get_screening ──────────────────────────────────────────────────────

server.tool(
  'get_screening',
  'Get the status and results of a screening by ID',
  {
    screening_id: z.string().uuid().describe('The screening UUID'),
  },
  async (params) => {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('screenings')
      .select('*')
      .eq('id', params.screening_id)
      .single();

    if (error || !data) {
      return {
        content: [{ type: 'text' as const, text: 'Screening not found.' }],
        isError: true,
      };
    }

    const s = data as ScreeningRow;
    const result: Record<string, unknown> = {
      id: s.id,
      status: s.status,
      screening_type: s.screening_type,
      contractor_company_id: s.contractor_company_id,
      project_id: s.project_id,
      created_at: s.created_at,
    };

    if (s.status === 'awaiting_answers' && s.questions) {
      result.questions = s.questions;
      result.message = 'Screening questions ready. Use submit_screening_answers to submit contractor responses.';
    }

    if (s.status === 'completed') {
      result.grade = s.grade;
      result.grade_label = s.grade_label;
      result.summary = s.summary;
      result.strengths = s.strengths;
      result.concerns = s.concerns;
      result.completed_at = s.completed_at;
    }

    if (s.status === 'failed') {
      result.error = s.error_message;
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// ── Tool: list_screenings ────────────────────────────────────────────────────

server.tool(
  'list_screenings',
  'List screenings with optional filters',
  {
    project_id: z.number().optional().describe('Filter by project ID'),
    contractor_company_id: z.number().optional().describe('Filter by contractor company ID'),
    client_company_id: z.number().optional().describe('Filter by client company ID'),
    status: z.string().optional().describe('Filter by status'),
  },
  async (params) => {
    const supabase = getSupabase();
    let query = supabase.from('screenings').select('*').order('created_at', { ascending: false }).limit(50);

    if (params.project_id) query = query.eq('project_id', params.project_id);
    if (params.contractor_company_id) query = query.eq('contractor_company_id', params.contractor_company_id);
    if (params.client_company_id) query = query.eq('client_company_id', params.client_company_id);
    if (params.status) query = query.eq('status', params.status);

    const { data } = await query;
    const screenings = (data || []) as ScreeningRow[];

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          count: screenings.length,
          screenings: screenings.map((s) => ({
            id: s.id,
            status: s.status,
            screening_type: s.screening_type,
            contractor_company_id: s.contractor_company_id,
            project_id: s.project_id,
            grade: s.grade,
            grade_label: s.grade_label,
            created_at: s.created_at,
          })),
        }, null, 2),
      }],
    };
  }
);

// ── Tool: submit_screening_answers ───────────────────────────────────────────

server.tool(
  'submit_screening_answers',
  'Submit contractor answers to screening questions. The screening must be in awaiting_answers status.',
  {
    screening_id: z.string().uuid().describe('The screening UUID'),
    answers: z.array(z.object({
      question_id: z.string().describe('Question ID (e.g. q1, q2)'),
      answer: z.string().describe('The contractor answer text'),
    })).describe('Array of question answers'),
  },
  async (params) => {
    const supabase = getSupabase();

    const { data: screening } = await supabase
      .from('screenings')
      .select('*')
      .eq('id', params.screening_id)
      .single();

    if (!screening) {
      return { content: [{ type: 'text' as const, text: 'Screening not found.' }], isError: true };
    }

    if (screening.status !== 'awaiting_answers') {
      return {
        content: [{ type: 'text' as const, text: `Cannot submit: screening status is "${screening.status}", expected "awaiting_answers".` }],
        isError: true,
      };
    }

    // Insert answers
    const questions = (screening.questions || []) as Array<{ id: string; text: string }>;
    const answerRows = params.answers.map((a) => {
      const q = questions.find((q) => q.id === a.question_id);
      return {
        screening_id: params.screening_id,
        question_id: a.question_id,
        question_text: q?.text || a.question_id,
        answer: a.answer,
      };
    });

    await supabase.from('screening_answers').insert(answerRows);

    const transcript = params.answers.map((a) => {
      const q = questions.find((q) => q.id === a.question_id);
      return { question_id: a.question_id, question_text: q?.text || '', answer: a.answer };
    });

    await supabase
      .from('screenings')
      .update({ status: 'grading', transcript })
      .eq('id', params.screening_id);

    // Trigger grading via Lucy's HTTP API
    const lucyUrl = process.env.LUCY_URL || 'http://localhost:3001';
    fetch(`${lucyUrl}/api/screening/${params.screening_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: params.answers }),
    }).catch(() => {});

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          screening_id: params.screening_id,
          status: 'grading',
          message: 'Answers submitted. Grading in progress. Poll get_screening for results.',
        }, null, 2),
      }],
    };
  }
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Lucy MCP server failed to start:', err);
  process.exit(1);
});
