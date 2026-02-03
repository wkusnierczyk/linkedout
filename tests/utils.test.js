import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  simpleHash,
  escapeHtml,
  escapeAttribute,
  formatCategoryLabel,
} from '../src/utils.js';

describe('sanitizeText', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText('')).toBe('');
  });

  it('passes through normal text unchanged', () => {
    expect(sanitizeText('Hello, world!')).toBe('Hello, world!');
    expect(sanitizeText('LinkedIn post content')).toBe('LinkedIn post content');
  });

  it('preserves valid emoji (complete surrogate pairs)', () => {
    expect(sanitizeText('Hello 👋 world')).toBe('Hello 👋 world');
    expect(sanitizeText('🎉🎊🎈')).toBe('🎉🎊🎈');
  });

  it('replaces orphaned high surrogates', () => {
    // \uD83D is a high surrogate without its low surrogate pair
    const orphanedHigh = 'Hello \uD83D world';
    expect(sanitizeText(orphanedHigh)).toBe('Hello \uFFFD world');
  });

  it('replaces orphaned low surrogates', () => {
    // \uDC4B is a low surrogate without its high surrogate pair
    const orphanedLow = 'Hello \uDC4B world';
    expect(sanitizeText(orphanedLow)).toBe('Hello \uFFFD world');
  });

  it('handles multiple orphaned surrogates', () => {
    const multipleOrphaned = '\uD83D test \uDC4B more \uD800';
    const result = sanitizeText(multipleOrphaned);
    expect(result).not.toContain('\uD83D');
    expect(result).not.toContain('\uDC4B');
    expect(result).not.toContain('\uD800');
    expect(result.match(/\uFFFD/g)).toHaveLength(3);
  });

  it('preserves valid surrogates while fixing orphaned ones', () => {
    // 👋 is \uD83D\uDC4B - a valid pair
    // Add an orphaned \uD83D at the end
    const mixed = '👋 wave \uD83D';
    const result = sanitizeText(mixed);
    expect(result).toContain('👋');
    expect(result).toContain('\uFFFD');
  });
});

describe('simpleHash', () => {
  it('returns consistent hash for same input', () => {
    const hash1 = simpleHash('test string');
    const hash2 = simpleHash('test string');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = simpleHash('string one');
    const hash2 = simpleHash('string two');
    expect(hash1).not.toBe(hash2);
  });

  it('returns base36 string', () => {
    const hash = simpleHash('test');
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });

  it('handles empty string', () => {
    const hash = simpleHash('');
    expect(hash).toBe('0');
  });

  it('handles unicode characters', () => {
    const hash = simpleHash('Hello 👋 世界');
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });
});

describe('escapeHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes < and >', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes &', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("'single'")).toBe('&#39;single&#39;');
  });

  it('passes through safe text unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });

  it('handles mixed content', () => {
    const input = '<div class="test">Hello & goodbye</div>';
    const output = escapeHtml(input);
    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
    expect(output).toContain('&amp;');
  });
});

describe('escapeAttribute', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeAttribute(null)).toBe('');
    expect(escapeAttribute(undefined)).toBe('');
    expect(escapeAttribute('')).toBe('');
  });

  it('escapes double quotes', () => {
    expect(escapeAttribute('value with "quotes"')).toBe('value with &quot;quotes&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeAttribute("it's a test")).toBe('it&#39;s a test');
  });

  it('escapes angle brackets', () => {
    expect(escapeAttribute('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes ampersand', () => {
    expect(escapeAttribute('a & b')).toBe('a &amp; b');
  });

  it('handles multiple special characters', () => {
    expect(escapeAttribute('<"test" & \'value\'>')).toBe(
      '&lt;&quot;test&quot; &amp; &#39;value&#39;&gt;'
    );
  });
});

describe('formatCategoryLabel', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatCategoryLabel(null)).toBe('');
    expect(formatCategoryLabel(undefined)).toBe('');
    expect(formatCategoryLabel('')).toBe('');
  });

  it('converts snake_case to sentence case', () => {
    expect(formatCategoryLabel('thought_leadership')).toBe('Thought leadership');
    expect(formatCategoryLabel('ai_generated')).toBe('Ai generated');
    expect(formatCategoryLabel('engagement_bait')).toBe('Engagement bait');
  });

  it('handles UPPER_SNAKE_CASE', () => {
    expect(formatCategoryLabel('THOUGHT_LEADERSHIP')).toBe('Thought leadership');
    expect(formatCategoryLabel('AI_GENERATED')).toBe('Ai generated');
  });

  it('handles camelCase', () => {
    expect(formatCategoryLabel('thoughtLeadership')).toBe('Thought leadership');
    expect(formatCategoryLabel('aiGenerated')).toBe('Ai generated');
  });

  it('handles single word', () => {
    expect(formatCategoryLabel('politics')).toBe('Politics');
    expect(formatCategoryLabel('POLITICS')).toBe('Politics');
  });

  it('handles mixed formats', () => {
    expect(formatCategoryLabel('AI_generated_Content')).toBe('Ai generated content');
  });
});
