'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CopyButton } from './CopyButton';

/**
 * Markdown renderer for chat messages. Isolated into its own module so the
 * heavy react-markdown + remark-gfm + rehype-highlight (highlight.js) stack is
 * code-split out of the /chat first-load bundle and loaded on demand — see the
 * React.lazy import in ChatMessage.
 */

// ─── Code block with language header + copy button ───────────────────────────

function CodeBlock({
  language,
  code,
  children,
}: {
  language?: string;
  code: string;
  children: React.ReactNode;
}) {
  const lines = code.split('\n');
  const showLineNumbers = lines.length > 5;

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-gray-700">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-500 font-mono">
          {language && language !== 'text' ? language : 'code'}
        </span>
        <CopyButton text={code} />
      </div>

      {/* Code content — horizontally scrollable */}
      <div className="overflow-x-auto bg-gray-900">
        {showLineNumbers ? (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="leading-relaxed">
                  <td
                    className="
                      select-none text-right pr-4 pl-3 py-0
                      text-gray-600 border-r border-gray-800
                      w-10 shrink-0 align-top font-mono
                    "
                  >
                    {i + 1}
                  </td>
                  <td className="pl-4 pr-4 py-0 align-top font-mono whitespace-pre">
                    {line}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="p-4 text-sm overflow-x-auto">{children}</pre>
        )}
      </div>
    </div>
  );
}

// ─── Helper — extract plain text from React children ─────────────────────────

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props?.children);
  }
  return '';
}

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: ({ children }) => {
          // Extract code text and language from child code element
          const codeEl = React.Children.toArray(children).find(
            (child): child is React.ReactElement =>
              React.isValidElement(child) && child.type === 'code'
          ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;

          const className = codeEl?.props?.className ?? '';
          const langMatch = className.match(/language-(\w+)/);
          const language = langMatch?.[1];
          const rawCode = extractText(codeEl?.props?.children);

          return (
            <CodeBlock language={language} code={rawCode}>
              {children}
            </CodeBlock>
          );
        },
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <code className={`${className} block`} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="bg-gray-900 text-lucy-300 px-1.5 py-0.5 rounded text-xs"
              {...props}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
