import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ALL_PAGES, getPage, getAdjacent } from '@/lib/docs/registry';

export function generateStaticParams() {
  return [{ slug: [] as string[] }, ...ALL_PAGES.map((p) => ({ slug: [p.slug] }))];
}

// Per-page title + description so every /docs/<slug> URL is distinct for SEO
// instead of sharing one generic "Lucy AI — Documentation" tag.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug?.[0]);
  if (!page) return {};
  const canonical = `/docs${slug?.[0] ? `/${page.slug}` : ''}`;
  const title = `${page.title} — Lucy Docs`;
  return {
    title,
    description: page.description,
    alternates: { canonical },
    openGraph: { title, description: page.description, url: canonical, type: 'article' },
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = getPage(slug?.[0]);
  if (!page) notFound();

  let markdown: string;
  try {
    markdown = await readFile(join(process.cwd(), 'docs', 'kb', page.file), 'utf8');
  } catch {
    notFound();
  }

  const { prev, next } = getAdjacent(page.slug);

  return (
    <article className="max-w-3xl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-3xl font-extrabold tracking-tight text-t1 mb-5">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold tracking-tight text-t1 mt-10 mb-3 pb-2 border-b border-edge">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-t1 mt-7 mb-2">{children}</h3>
          ),
          p: ({ children }) => <p className="text-[15px] text-t2 leading-relaxed mb-4">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc pl-6 space-y-1.5 mb-4 text-[15px] text-t2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 space-y-1.5 mb-4 text-[15px] text-t2">{children}</ol>
          ),
          a: ({ href, children }) => {
            const internal = href?.startsWith('/');
            return (
              <a
                href={href}
                {...(internal ? {} : { target: '_blank', rel: 'noreferrer' })}
                className="text-accent-soft hover:text-lucy-300 font-medium underline underline-offset-2 decoration-accent/40"
              >
                {children}
              </a>
            );
          },
          strong: ({ children }) => <strong className="font-bold text-t1">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent-soft bg-accent/5 rounded-r-theme pl-4 pr-3 py-2 my-4 [&_p]:mb-0">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className) || String(children).includes('\n');
            if (!isBlock) {
              return (
                <code className="text-[13px] font-mono text-lucy-300 bg-raised border border-edge rounded px-1.5 py-0.5">
                  {children}
                </code>
              );
            }
            return <code className="text-[13px] font-mono text-t1">{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="bg-raised border border-edge rounded-theme p-4 overflow-x-auto mb-4 text-[13px] leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-edge rounded-theme overflow-hidden">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-raised">{children}</thead>,
          th: ({ children }) => (
            <th className="text-left text-xs font-bold uppercase tracking-wide text-t2 px-3 py-2 border-b border-edge">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-t2 border-b border-edge/60 align-top">{children}</td>
          ),
          hr: () => <hr className="border-edge my-8" />,
        }}
      >
        {markdown}
      </ReactMarkdown>

      {/* Prev / next */}
      <nav className="mt-12 pt-6 border-t border-edge flex justify-between gap-4 text-sm">
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="inline-flex items-center gap-1.5 text-t2 hover:text-t1 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/docs/${next.slug}`}
            className="inline-flex items-center gap-1.5 text-t2 hover:text-t1 font-medium transition-colors ml-auto"
          >
            {next.title} <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </nav>
    </article>
  );
}
