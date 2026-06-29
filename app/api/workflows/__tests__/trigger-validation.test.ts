// app/api/workflows/__tests__/trigger-validation.test.ts
import { validateTriggerBody } from '../triggers/validate';

const def = { name: 'W', nodes: [{ data: { nodeType: 'start' } }], edges: [] };

describe('validateTriggerBody', () => {
  it('rejects an unknown type', () => {
    expect(validateTriggerBody({ type: 'sms', definition: def }).ok).toBe(false);
  });
  it('rejects a cron type with a bad expression', () => {
    expect(validateTriggerBody({ type: 'cron', settings: { expr: 'nope' }, definition: def }).ok).toBe(false);
  });
  it('accepts a valid cron trigger', () => {
    const r = validateTriggerBody({ type: 'cron', settings: { expr: '0 9 * * *' }, definition: def });
    expect(r.ok).toBe(true);
  });
  it('accepts a webhook trigger', () => {
    const r = validateTriggerBody({ type: 'webhook', definition: def });
    expect(r.ok).toBe(true);
  });
  it('rejects a definition without a start node', () => {
    expect(validateTriggerBody({ type: 'webhook', definition: { name: 'x', nodes: [], edges: [] } }).ok).toBe(false);
  });
  it('accepts a valid record_event trigger', () => {
    const r = validateTriggerBody({ type: 'record_event', settings: { table: 'conversations', events: ['INSERT'] }, definition: def });
    expect(r.ok).toBe(true);
  });
  it('rejects a record_event trigger with a non-watched table', () => {
    expect(validateTriggerBody({ type: 'record_event', settings: { table: 'secrets', events: ['INSERT'] }, definition: def }).ok).toBe(false);
  });
  it('rejects a record_event trigger with empty events', () => {
    expect(validateTriggerBody({ type: 'record_event', settings: { table: 'memories', events: [] }, definition: def }).ok).toBe(false);
  });
});
