/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SELECTORS,
  DetectionStats,
  sanitizeDomStructure,
  captureDomSnapshot,
  diagnoseDomIssues,
  attemptLocalHealing,
  testSelectors,
} from '../src/dom-healing.js';

describe('DEFAULT_SELECTORS', () => {
  it('has expected properties', () => {
    expect(DEFAULT_SELECTORS.mainContainer).toBe('main');
    expect(DEFAULT_SELECTORS.reactionButtonLabel).toBe('Reaction button state:');
    expect(DEFAULT_SELECTORS.minFeedChildren).toBe(4);
    expect(DEFAULT_SELECTORS.maxSearchDepth).toBe(15);
    expect(DEFAULT_SELECTORS.postTextSelectors).toContain('span[dir="ltr"]');
    expect(DEFAULT_SELECTORS.authorLinkPatterns).toContain('a[href*="/in/"]');
  });
});

describe('DetectionStats', () => {
  let stats;

  beforeEach(() => {
    stats = new DetectionStats();
  });

  it('starts with zero counts', () => {
    expect(stats.attempts).toBe(0);
    expect(stats.successes).toBe(0);
    expect(stats.failures).toBe(0);
    expect(stats.consecutiveFailures).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });

  it('tracks successful detections', () => {
    stats.recordSuccess();
    expect(stats.attempts).toBe(1);
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(0);
  });

  it('tracks failed detections', () => {
    stats.recordFailure();
    expect(stats.attempts).toBe(1);
    expect(stats.successes).toBe(0);
    expect(stats.failures).toBe(1);
    expect(stats.consecutiveFailures).toBe(1);
    expect(stats.lastFailureTime).not.toBeNull();
  });

  it('resets consecutive failures on success', () => {
    stats.recordFailure();
    stats.recordFailure();
    expect(stats.consecutiveFailures).toBe(2);
    stats.recordSuccess();
    expect(stats.consecutiveFailures).toBe(0);
  });

  it('calculates success rate correctly', () => {
    expect(stats.getSuccessRate()).toBe(1); // No attempts = 100%
    stats.recordSuccess();
    stats.recordSuccess();
    stats.recordFailure();
    expect(stats.getSuccessRate()).toBeCloseTo(0.667, 2);
  });

  describe('isHealthy', () => {
    it('is healthy with no attempts', () => {
      expect(stats.isHealthy()).toBe(true);
    });

    it('is healthy with mostly successes', () => {
      stats.recordSuccess();
      stats.recordSuccess();
      stats.recordSuccess();
      stats.recordFailure();
      expect(stats.isHealthy()).toBe(true);
    });

    it('is unhealthy with 3+ consecutive failures', () => {
      stats.recordFailure();
      stats.recordFailure();
      expect(stats.isHealthy()).toBe(true);
      stats.recordFailure();
      expect(stats.isHealthy()).toBe(false);
    });

    it('is unhealthy with low success rate after 5+ attempts', () => {
      // Mix successes and failures to avoid consecutive failure trigger
      stats.recordSuccess();
      stats.recordFailure();
      stats.recordSuccess();
      stats.recordFailure();
      expect(stats.isHealthy()).toBe(true); // 4 attempts, 50% success
      stats.recordFailure();
      expect(stats.isHealthy()).toBe(false); // 5 attempts, 40% success < 50%
    });
  });

  describe('serialization', () => {
    it('serializes to JSON', () => {
      stats.recordSuccess();
      stats.recordFailure();
      const json = stats.toJSON();
      expect(json.attempts).toBe(2);
      expect(json.successes).toBe(1);
      expect(json.failures).toBe(1);
      expect(json.successRate).toBe(0.5);
      expect(json.isHealthy).toBe(true);
    });

    it('deserializes from JSON', () => {
      const data = {
        attempts: 10,
        successes: 8,
        failures: 2,
        lastFailureTime: 1234567890,
        consecutiveFailures: 1,
      };
      const restored = DetectionStats.fromJSON(data);
      expect(restored.attempts).toBe(10);
      expect(restored.successes).toBe(8);
      expect(restored.failures).toBe(2);
      expect(restored.lastFailureTime).toBe(1234567890);
      expect(restored.consecutiveFailures).toBe(1);
    });

    it('handles null/undefined data', () => {
      const restored = DetectionStats.fromJSON(null);
      expect(restored.attempts).toBe(0);
      expect(restored.successes).toBe(0);
    });
  });
});

describe('sanitizeDomStructure', () => {
  function createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  it('returns null for null input', () => {
    expect(sanitizeDomStructure(null)).toBeNull();
  });

  it('returns null for negative depth', () => {
    const el = createElement('<div></div>');
    expect(sanitizeDomStructure(el, -1)).toBeNull();
  });

  it('extracts tag name', () => {
    const el = createElement('<section></section>');
    const result = sanitizeDomStructure(el);
    expect(result.tag).toBe('section');
  });

  it('extracts safe attributes', () => {
    const el = createElement('<div role="main" aria-label="Test label" data-urn="urn:123"></div>');
    const result = sanitizeDomStructure(el);
    expect(result.attributes.role).toBe('main');
    expect(result.attributes['aria-label']).toBe('Test label');
    expect(result.attributes['data-urn']).toBe('urn:123');
  });

  it('sanitizes long aria-labels', () => {
    const el = createElement('<button aria-label="Reaction button state: Like"></button>');
    const result = sanitizeDomStructure(el);
    expect(result.attributes['aria-label']).toBe('Reaction button state:*');
  });

  it('truncates very long aria-labels without colon', () => {
    const longLabel = 'A'.repeat(50);
    const el = createElement(`<button aria-label="${longLabel}"></button>`);
    const result = sanitizeDomStructure(el);
    expect(result.attributes['aria-label']).toBe('A'.repeat(30) + '...');
  });

  it('counts children', () => {
    const el = createElement('<div><span></span><span></span><span></span></div>');
    const result = sanitizeDomStructure(el);
    expect(result.childCount).toBe(3);
  });

  it('recursively processes children up to depth limit', () => {
    const el = createElement('<div><section><article></article></section></div>');
    const result = sanitizeDomStructure(el, 2);
    expect(result.children.length).toBe(1);
    expect(result.children[0].tag).toBe('section');
    expect(result.children[0].children.length).toBe(1);
    expect(result.children[0].children[0].tag).toBe('article');
  });

  it('limits depth recursion', () => {
    const el = createElement('<div><span><p><a></a></p></span></div>');
    const result = sanitizeDomStructure(el, 1);
    expect(result.children[0].children).toEqual([]);
  });

  it('limits children to 10 with note', () => {
    const children = Array(15).fill('<span></span>').join('');
    const el = createElement(`<div>${children}</div>`);
    const result = sanitizeDomStructure(el, 1);
    expect(result.children.length).toBe(11); // 10 children + note
    expect(result.children[10].tag).toBe('...');
    expect(result.children[10].note).toBe('5 more children');
  });

  it('does not include text content', () => {
    const el = createElement('<div>Secret user content here</div>');
    const result = sanitizeDomStructure(el);
    expect(JSON.stringify(result)).not.toContain('Secret');
    expect(JSON.stringify(result)).not.toContain('user content');
  });
});

describe('captureDomSnapshot', () => {
  it('returns error when no main element', () => {
    const doc = {
      querySelector: () => null,
      body: { children: [] },
      location: { href: 'https://linkedin.com/feed' },
    };
    const result = captureDomSnapshot(doc);
    expect(result.error).toBe('No <main> element found');
    expect(result.bodyChildCount).toBe(0);
  });

  it('captures main structure when present', () => {
    const mockMain = document.createElement('main');
    mockMain.innerHTML = '<div><section></section></div>';
    const doc = {
      querySelector: (sel) => (sel === 'main' ? mockMain : null),
      location: { href: 'https://linkedin.com/feed' },
    };
    const result = captureDomSnapshot(doc);
    expect(result.main).toBeDefined();
    expect(result.main.tag).toBe('main');
    expect(result.timestamp).toBeDefined();
  });

  it('sanitizes URL to remove query params', () => {
    const mockMain = document.createElement('main');
    const doc = {
      querySelector: () => mockMain,
      location: { href: 'https://linkedin.com/feed?session=secret123' },
    };
    const result = captureDomSnapshot(doc);
    expect(result.url).toBe('https://linkedin.com/feed');
    expect(result.url).not.toContain('secret');
  });
});

describe('diagnoseDomIssues', () => {
  function createMockDoc(mainHtml = null) {
    const mockMain = mainHtml
      ? (() => {
          const el = document.createElement('main');
          el.innerHTML = mainHtml;
          return el;
        })()
      : null;

    return {
      querySelector: (sel) => (sel === 'main' ? mockMain : null),
      querySelectorAll: (sel) => {
        if (sel === 'button' && mockMain) {
          return mockMain.querySelectorAll('button');
        }
        return [];
      },
      body: { children: [] },
      location: { href: 'https://linkedin.com/feed' },
    };
  }

  it('detects missing main container', () => {
    const doc = createMockDoc(null);
    const result = diagnoseDomIssues(doc);
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'missing_main' }));
  });

  it('detects missing reaction buttons', () => {
    const doc = createMockDoc('<div><button aria-label="Share"></button></div>');
    const result = diagnoseDomIssues(doc);
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'no_reaction_buttons' }));
  });

  it('suggests alternative pattern when found', () => {
    const doc = createMockDoc('<div><button aria-label="React to this: Like"></button></div>');
    const result = diagnoseDomIssues(doc);
    const issue = result.issues.find((i) => i.type === 'no_reaction_buttons');
    expect(issue.foundPattern).toContain('React');
  });

  it('detects missing feed container', () => {
    const doc = createMockDoc('<div><span></span></div>'); // Only 1 child
    const result = diagnoseDomIssues(doc);
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'no_feed_container' }));
  });

  it('includes snapshot in diagnosis', () => {
    const doc = createMockDoc('<div></div>');
    const result = diagnoseDomIssues(doc);
    expect(result.snapshot).toBeDefined();
  });
});

describe('attemptLocalHealing', () => {
  it('returns null when no healing possible', () => {
    const diagnosis = {
      issues: [{ type: 'missing_main' }],
    };
    const result = attemptLocalHealing(diagnosis);
    expect(result).toBeNull();
  });

  it('attempts to heal reaction button pattern', () => {
    const diagnosis = {
      issues: [
        {
          type: 'no_reaction_buttons',
          foundPattern: 'React to post: Like',
        },
      ],
    };

    // Create a mock doc with the new pattern
    const mockMain = document.createElement('main');
    mockMain.innerHTML = `
      <div>
        <div><button aria-label="React to post: Like"></button></div>
        <div><button aria-label="React to post: Like"></button></div>
        <div><button aria-label="React to post: Like"></button></div>
        <div><button aria-label="React to post: Like"></button></div>
      </div>
    `;
    const doc = {
      querySelector: () => mockMain,
    };

    const result = attemptLocalHealing(diagnosis, doc);
    expect(result).not.toBeNull();
    expect(result.reactionButtonLabel).toBe('React to post:');
  });
});

describe('testSelectors', () => {
  function createFeedDoc(buttonLabel = 'Reaction button state: Like') {
    const mockMain = document.createElement('main');
    mockMain.innerHTML = `
      <div>
        <div class="feed">
          <div class="post"><button aria-label="${buttonLabel}"></button></div>
          <div class="post"><button aria-label="${buttonLabel}"></button></div>
          <div class="post"><button aria-label="${buttonLabel}"></button></div>
          <div class="post"><button aria-label="${buttonLabel}"></button></div>
        </div>
      </div>
    `;
    return {
      querySelector: (sel) => (sel === 'main' ? mockMain : null),
    };
  }

  it('returns failure when main not found', () => {
    const doc = { querySelector: () => null };
    const result = testSelectors(DEFAULT_SELECTORS, doc);
    expect(result.success).toBe(false);
    expect(result.mainFound).toBe(false);
  });

  it('returns success with default selectors on valid feed', () => {
    const doc = createFeedDoc();
    const result = testSelectors(DEFAULT_SELECTORS, doc);
    expect(result.success).toBe(true);
    expect(result.mainFound).toBe(true);
    expect(result.feedFound).toBe(true);
    expect(result.postsFound).toBe(4);
  });

  it('fails with wrong reaction button label', () => {
    const doc = createFeedDoc('Different label: Like');
    const result = testSelectors(DEFAULT_SELECTORS, doc);
    expect(result.success).toBe(false);
    expect(result.feedFound).toBe(false);
  });

  it('succeeds with custom selectors matching the DOM', () => {
    const doc = createFeedDoc('Custom button: Active');
    const customSelectors = {
      ...DEFAULT_SELECTORS,
      reactionButtonLabel: 'Custom button:',
    };
    const result = testSelectors(customSelectors, doc);
    expect(result.success).toBe(true);
    expect(result.postsFound).toBe(4);
  });
});
