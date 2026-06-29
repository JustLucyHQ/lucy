/**
 * Detect if text contains markdown syntax worth rendering.
 */
export function hasMarkdown(text: string): boolean {
  const patterns = [
    /#{1,6}\s/,        // Headings
    /\*\*.*?\*\*/,     // Bold
    /\*.*?\*/,         // Italic
    /`[^`]+`/,         // Inline code
    /```[\s\S]*?```/,  // Code blocks
    /^\s*[-*+]\s/m,    // Unordered lists
    /^\s*\d+\.\s/m,    // Ordered lists
    /\[.*?\]\(.*?\)/,  // Links
    /^\s*>/m,          // Blockquotes
    /\|.*\|/,          // Tables
  ];
  return patterns.some((p) => p.test(text));
}

/**
 * Truncate text to a given length, appending ellipsis if needed.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Convert a conversation's first user message into a readable title.
 */
export function generateConversationTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\n+/g, ' ').trim();
  return truncate(cleaned, 60);
}
