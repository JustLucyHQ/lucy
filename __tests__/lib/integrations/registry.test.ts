/**
 * Tests for lib/integrations/registry.ts
 *
 * Covers: registerProject, getProject, getAllProjects,
 *         getProjectTables, getProjectActions
 */

import {
  registerProject,
  getProject,
  getAllProjects,
  getProjectTables,
  getProjectActions,
} from '@/lib/integrations/registry';
import type { ProjectIntegration } from '@/lib/integrations/registry';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURE_PROJECT: ProjectIntegration = {
  id: 'test-project',
  name: 'Test Project',
  description: 'A project used in tests',
  tables: [
    {
      name: 'items',
      description: 'Test items table',
      columns: [
        { name: 'id', type: 'uuid', description: 'Primary key' },
        { name: 'name', type: 'text', description: 'Item name' },
      ],
      accessPolicy: 'user',
    },
  ],
  actions: [
    {
      id: 'create-item',
      name: 'Create Item',
      description: 'Creates a new item',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Item name' },
      ],
      handler: 'supabase-insert',
      config: { table: 'items' },
    },
  ],
};

const FIXTURE_PROJECT_2: ProjectIntegration = {
  id: 'another-project',
  name: 'Another Project',
  description: 'Second test project',
  tables: [],
  actions: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('integrations/registry', () => {
  // The registry is a module-level singleton; registrations persist between
  // tests in the same file. We re-register in each describe block that needs
  // a clean slate, or we prefix ids to avoid collision.

  describe('registerProject and getProject', () => {
    it('registerProject stores an integration and getProject retrieves it', () => {
      registerProject(FIXTURE_PROJECT);
      const found = getProject('test-project');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('test-project');
      expect(found!.name).toBe('Test Project');
    });

    it('getProject returns null for an unknown id', () => {
      const result = getProject('does-not-exist-ever');
      expect(result).toBeNull();
    });

    it('re-registering the same id replaces the previous entry', () => {
      const updated: ProjectIntegration = {
        ...FIXTURE_PROJECT,
        name: 'Updated Name',
      };
      registerProject(updated);
      const found = getProject('test-project');
      expect(found!.name).toBe('Updated Name');

      // Restore original for other tests
      registerProject(FIXTURE_PROJECT);
    });
  });

  describe('getAllProjects', () => {
    it('returns all registered projects', () => {
      registerProject(FIXTURE_PROJECT);
      registerProject(FIXTURE_PROJECT_2);
      const all = getAllProjects();
      const ids = all.map((p) => p.id);
      expect(ids).toContain('test-project');
      expect(ids).toContain('another-project');
    });

    it('returns an array (not null/undefined)', () => {
      const all = getAllProjects();
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe('getProjectTables', () => {
    beforeAll(() => {
      registerProject(FIXTURE_PROJECT);
    });

    it('returns the tables for a registered project', () => {
      const tables = getProjectTables('test-project');
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('items');
    });

    it('returns empty array for an unregistered project id', () => {
      const tables = getProjectTables('ghost-project');
      expect(tables).toEqual([]);
    });

    it('includes column definitions', () => {
      const tables = getProjectTables('test-project');
      expect(tables[0].columns).toHaveLength(2);
      expect(tables[0].columns[0].name).toBe('id');
    });
  });

  describe('getProjectActions', () => {
    beforeAll(() => {
      registerProject(FIXTURE_PROJECT);
    });

    it('returns the actions for a registered project', () => {
      const actions = getProjectActions('test-project');
      expect(actions).toHaveLength(1);
      expect(actions[0].id).toBe('create-item');
    });

    it('returns empty array for an unregistered project id', () => {
      const actions = getProjectActions('ghost-project-2');
      expect(actions).toEqual([]);
    });

    it('includes parameter definitions', () => {
      const actions = getProjectActions('test-project');
      expect(actions[0].parameters).toHaveLength(1);
      expect(actions[0].parameters[0].name).toBe('name');
    });
  });
});
