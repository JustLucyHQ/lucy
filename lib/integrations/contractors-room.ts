/**
 * Contractors Room integration definition.
 *
 * This is the first registered integration for Lucy. It describes all the
 * tables Lucy can read and all the actions Lucy can perform in the
 * Contractors Room app.
 *
 * Call `registerContractorsRoom()` once at app startup (e.g. in layout or an
 * initialisation module) so the registry is populated before any context
 * build or action execution is attempted.
 */

import type { ProjectIntegration } from './registry';
import { registerProject } from './registry';

export const contractorsRoomIntegration: ProjectIntegration = {
  id: 'contractors-room',
  name: 'Contractors Room',
  description:
    'Contractor marketplace for managing projects, contracts, and communications',
  supabaseSchema: 'contractors_room',
  // NOTE: Lucy's own tables are in the 'lucy' schema.
  // This integration reads from contractors_room (the external app's schema).
  icon: '🏗️',
  color: '#3B82F6',

  tables: [
    {
      name: 'user_profiles',
      description:
        'User profiles with contractor/client role, company, and contact info',
      columns: [
        { name: 'display_name', type: 'text', description: 'User display name' },
        { name: 'email', type: 'text', description: 'User email' },
        { name: 'company_id', type: 'integer', description: 'Associated company ID' },
        { name: 'is_contractor', type: 'boolean', description: 'Whether user is a contractor' },
      ],
      accessPolicy: 'user',
    },
    {
      name: 'companies',
      description: 'Companies — both contractor firms and client companies',
      columns: [
        { name: 'name', type: 'text', description: 'Company name' },
        { name: 'description', type: 'text', description: 'Company description' },
        { name: 'industry_id', type: 'integer', description: 'Industry category' },
      ],
      accessPolicy: 'public',
    },
    {
      name: 'projects',
      description: 'Project listings with budgets, timelines, and required skills',
      columns: [
        { name: 'project_id', type: 'integer', description: 'Project ID' },
        { name: 'company_id', type: 'integer', description: 'Client company' },
        { name: 'description', type: 'text', description: 'Project description' },
        { name: 'budget', type: 'numeric', description: 'Project budget' },
        {
          name: 'project_status_id',
          type: 'integer',
          description: 'Status (1=draft, 2=bidding, 3=active, 4=completed)',
        },
      ],
      accessPolicy: 'user',
    },
    {
      name: 'project_tasks',
      description:
        'Contract proposals and assignments between companies and contractors',
      columns: [
        { name: 'project_task_id', type: 'integer', description: 'Task/contract ID' },
        { name: 'project_id', type: 'integer', description: 'Parent project' },
        { name: 'contractor_id', type: 'integer', description: 'Assigned contractor company' },
        { name: 'rate', type: 'numeric', description: 'Contract rate' },
        { name: 'terms', type: 'text', description: 'Contract terms' },
        { name: 'status_id', type: 'integer', description: 'Contract status' },
      ],
      accessPolicy: 'user',
    },
    {
      name: 'messages',
      description:
        'Chat messages between contractors and clients about specific contracts',
      columns: [
        { name: 'project_task_id', type: 'integer', description: 'Related contract' },
        { name: 'sender_id', type: 'uuid', description: 'Message sender' },
        { name: 'content', type: 'text', description: 'Message text' },
        { name: 'is_read', type: 'boolean', description: 'Read status' },
      ],
      accessPolicy: 'user',
    },
    {
      name: 'member_cvs',
      description: 'Contractor CVs with skills, experience, and qualifications',
      columns: [
        { name: 'title', type: 'text', description: 'CV title / role' },
        { name: 'experience', type: 'text', description: 'Work experience' },
        { name: 'skills', type: 'text', description: 'Skills list' },
      ],
      accessPolicy: 'user',
    },
  ],

  actions: [
    {
      id: 'create-project',
      name: 'Create Project',
      description: 'Create a new project listing in Contractors Room',
      parameters: [
        {
          name: 'description',
          type: 'string',
          required: true,
          description: 'Project description',
        },
        {
          name: 'budget',
          type: 'number',
          required: false,
          description: 'Project budget',
        },
        {
          name: 'company_id',
          type: 'number',
          required: true,
          description: 'Client company ID',
        },
      ],
      handler: 'supabase-insert',
      config: { table: 'projects', schema: 'contractors_room' },
    },
    {
      id: 'send-message',
      name: 'Send Message',
      description: 'Send a message in a contract conversation',
      parameters: [
        {
          name: 'project_task_id',
          type: 'number',
          required: true,
          description: 'Contract/task ID',
        },
        {
          name: 'content',
          type: 'string',
          required: true,
          description: 'Message content',
        },
      ],
      handler: 'supabase-insert',
      config: { table: 'messages', schema: 'contractors_room' },
    },
    {
      id: 'update-contract-status',
      name: 'Update Contract Status',
      description: 'Change the status of a contract/proposal',
      parameters: [
        {
          name: 'project_task_id',
          type: 'number',
          required: true,
          description: 'Contract ID',
        },
        {
          name: 'status_id',
          type: 'number',
          required: true,
          description:
            'New status (1=pending, 2=accepted, 3=rejected, 4=completed)',
        },
      ],
      handler: 'supabase-update',
      config: {
        table: 'project_tasks',
        schema: 'contractors_room',
        matchColumn: 'project_task_id',
      },
    },
  ],
};

/**
 * Registers the Contractors Room integration with Lucy's project registry.
 * Call this once at startup.
 */
export function registerContractorsRoom(): void {
  registerProject(contractorsRoomIntegration);
}
