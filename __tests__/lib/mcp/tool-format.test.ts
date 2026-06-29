// __tests__/lib/mcp/tool-format.test.ts
import { toOpenAITools, toAnthropicTools, NAMESPACE_SEP } from '@/lib/mcp/tool-format';

const tools = [
  {
    slug: 'github',
    name: 'create_issue',
    description: 'Create',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
  },
];

describe('tool-format', () => {
  it('OpenAI shape namespaces the function name', () => {
    const o = toOpenAITools(tools)[0];
    expect(o.type).toBe('function');
    expect(o.function.name).toBe(`github${NAMESPACE_SEP}create_issue`);
    expect(o.function.parameters).toEqual(tools[0].inputSchema);
  });

  it('Anthropic shape namespaces the tool name + uses input_schema', () => {
    const a = toAnthropicTools(tools)[0];
    expect(a.name).toBe(`github${NAMESPACE_SEP}create_issue`);
    expect(a.input_schema).toEqual(tools[0].inputSchema);
  });
});
