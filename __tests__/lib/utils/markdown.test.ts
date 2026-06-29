/**
 * Tests for lib/utils/markdown.ts
 *
 * Covers: hasMarkdown, generateConversationTitle, truncate
 */

import {
  hasMarkdown,
  truncate,
  generateConversationTitle,
} from '@/lib/utils/markdown';

describe('lib/utils/markdown', () => {
  describe('hasMarkdown (isMarkdown detection)', () => {
    it('returns true for text containing a heading', () => {
      expect(hasMarkdown('# My Heading')).toBe(true);
    });

    it('returns true for text with bold syntax', () => {
      expect(hasMarkdown('This is **bold** text')).toBe(true);
    });

    it('returns true for text with italic syntax', () => {
      expect(hasMarkdown('This is *italic* text')).toBe(true);
    });

    it('returns true for text containing inline code', () => {
      expect(hasMarkdown('Use `npm install` to install')).toBe(true);
    });

    it('returns true for text containing a code block', () => {
      expect(hasMarkdown('```js\nconsole.log("hi");\n```')).toBe(true);
    });

    it('returns true for text with an unordered list', () => {
      expect(hasMarkdown('- item one\n- item two')).toBe(true);
    });

    it('returns true for text with an ordered list', () => {
      expect(hasMarkdown('1. First\n2. Second')).toBe(true);
    });

    it('returns true for text containing a link', () => {
      expect(hasMarkdown('[Click here](https://example.com)')).toBe(true);
    });

    it('returns true for text with a blockquote', () => {
      expect(hasMarkdown('> This is a quote')).toBe(true);
    });

    it('returns true for text with a table', () => {
      expect(hasMarkdown('| Col A | Col B |')).toBe(true);
    });

    it('returns false for plain text without any markdown', () => {
      expect(hasMarkdown('Just a plain sentence with no formatting.')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasMarkdown('')).toBe(false);
    });
  });

  describe('truncate', () => {
    it('returns text unchanged when shorter than maxLength', () => {
      expect(truncate('Hello', 20)).toBe('Hello');
    });

    it('returns text unchanged when exactly at maxLength', () => {
      expect(truncate('Hello', 5)).toBe('Hello');
    });

    it('truncates and appends ellipsis when text exceeds maxLength', () => {
      const result = truncate('Hello, world!', 8);
      expect(result).toBe('Hello...');
      expect(result).toHaveLength(8);
    });

    it('handles a maxLength of 3 (only ellipsis)', () => {
      const result = truncate('Hi there', 3);
      expect(result).toBe('...');
    });
  });

  describe('generateConversationTitle', () => {
    it('returns the message content when it is short enough', () => {
      const title = generateConversationTitle('Short message');
      expect(title).toBe('Short message');
    });

    it('truncates long messages to 60 characters', () => {
      const longMessage = 'A'.repeat(80);
      const title = generateConversationTitle(longMessage);
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title.endsWith('...')).toBe(true);
    });

    it('collapses multiple newlines into spaces', () => {
      const multiLine = 'First line\n\nSecond line\nThird line';
      const title = generateConversationTitle(multiLine);
      expect(title).not.toContain('\n');
    });

    it('trims leading and trailing whitespace', () => {
      const title = generateConversationTitle('  padded message  ');
      expect(title).toBe('padded message');
    });
  });
});
