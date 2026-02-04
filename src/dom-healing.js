// DOM Self-Healing Module
// Detects when LinkedIn DOM changes break post detection and attempts to heal.

/**
 * Default selectors used for post detection.
 * These can be overridden by stored healed selectors.
 */
export const DEFAULT_SELECTORS = {
  // Main container selector
  mainContainer: 'main',

  // Pattern for identifying post elements (aria-label prefix)
  reactionButtonLabel: 'Reaction button state:',

  // Minimum children count to consider a container as feed
  minFeedChildren: 4,

  // Maximum depth to search for feed container
  maxSearchDepth: 15,

  // Post text selectors (in priority order)
  postTextSelectors: ['span[dir="ltr"]'],

  // Author link patterns
  authorLinkPatterns: ['a[href*="/in/"]', 'a[href*="/company/"]'],

  // Post ID attribute names
  postIdAttributes: ['data-urn', 'data-id'],
};

/**
 * Detection statistics for tracking success rates.
 */
export class DetectionStats {
  constructor() {
    this.attempts = 0;
    this.successes = 0;
    this.failures = 0;
    this.lastFailureTime = null;
    this.consecutiveFailures = 0;
  }

  recordSuccess() {
    this.attempts++;
    this.successes++;
    this.consecutiveFailures = 0;
  }

  recordFailure() {
    this.attempts++;
    this.failures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
  }

  getSuccessRate() {
    if (this.attempts === 0) return 1;
    return this.successes / this.attempts;
  }

  isHealthy() {
    // Consider unhealthy if:
    // - 3+ consecutive failures, or
    // - Success rate below 50% with 5+ attempts
    if (this.consecutiveFailures >= 3) return false;
    if (this.attempts >= 5 && this.getSuccessRate() < 0.5) return false;
    return true;
  }

  toJSON() {
    return {
      attempts: this.attempts,
      successes: this.successes,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      consecutiveFailures: this.consecutiveFailures,
      successRate: this.getSuccessRate(),
      isHealthy: this.isHealthy(),
    };
  }

  static fromJSON(data) {
    const stats = new DetectionStats();
    if (data) {
      stats.attempts = data.attempts || 0;
      stats.successes = data.successes || 0;
      stats.failures = data.failures || 0;
      stats.lastFailureTime = data.lastFailureTime || null;
      stats.consecutiveFailures = data.consecutiveFailures || 0;
    }
    return stats;
  }
}

/**
 * Sanitize a DOM element to extract structure only (no text content).
 * Used for safe diagnosis without exposing user data.
 *
 * @param {Element} element - The DOM element to sanitize
 * @param {number} maxDepth - Maximum depth to traverse
 * @returns {object} Sanitized structure
 */
export function sanitizeDomStructure(element, maxDepth = 5) {
  if (!element || maxDepth < 0) return null;

  const structure = {
    tag: element.tagName?.toLowerCase() || 'unknown',
    attributes: {},
    childCount: element.children?.length || 0,
    children: [],
  };

  // Extract safe attributes (no text content, no URLs with user data)
  const safeAttributes = [
    'role',
    'aria-label',
    'aria-expanded',
    'aria-hidden',
    'type',
    'dir',
    'data-urn',
    'data-id',
    'class',
  ];

  for (const attr of safeAttributes) {
    const value = element.getAttribute?.(attr);
    if (value) {
      // Sanitize aria-label to just show pattern, not full text
      if (attr === 'aria-label') {
        // Keep only the prefix pattern (e.g., "Reaction button state:" → "Reaction button state:*")
        const colonIndex = value.indexOf(':');
        if (colonIndex > 0 && colonIndex < 50) {
          structure.attributes[attr] = value.slice(0, colonIndex + 1) + '*';
        } else if (value.length > 30) {
          structure.attributes[attr] = value.slice(0, 30) + '...';
        } else {
          structure.attributes[attr] = value;
        }
      } else if (attr === 'class') {
        // Keep class names but limit length
        structure.attributes[attr] = value.slice(0, 100);
      } else {
        structure.attributes[attr] = value;
      }
    }
  }

  // Recurse into children (limited depth)
  if (maxDepth > 0 && element.children) {
    // Limit to first 10 children to avoid huge snapshots
    const childLimit = Math.min(element.children.length, 10);
    for (let i = 0; i < childLimit; i++) {
      const childStructure = sanitizeDomStructure(element.children[i], maxDepth - 1);
      if (childStructure) {
        structure.children.push(childStructure);
      }
    }
    if (element.children.length > childLimit) {
      structure.children.push({
        tag: '...',
        note: `${element.children.length - childLimit} more children`,
      });
    }
  }

  return structure;
}

/**
 * Capture a sanitized snapshot of the page structure for diagnosis.
 *
 * @param {Document} doc - The document to snapshot
 * @returns {object} Sanitized page structure
 */
export function captureDomSnapshot(doc = document) {
  const main = doc.querySelector('main');
  if (!main) {
    return {
      error: 'No <main> element found',
      bodyChildCount: doc.body?.children?.length || 0,
      bodyFirstChildren: Array.from(doc.body?.children || [])
        .slice(0, 5)
        .map((el) => el.tagName?.toLowerCase()),
    };
  }

  return {
    timestamp: Date.now(),
    url: sanitizeUrl(doc.location?.href || ''),
    main: sanitizeDomStructure(main, 4),
  };
}

/**
 * Sanitize URL to remove user-specific parts.
 */
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Keep only the pathname, remove query params and hash
    return parsed.origin + parsed.pathname;
  } catch {
    return 'unknown';
  }
}

/**
 * Diagnose why post detection might be failing.
 *
 * @param {Document} doc - The document to diagnose
 * @param {object} selectors - Current selectors being used
 * @returns {object} Diagnosis result
 */
export function diagnoseDomIssues(doc = document, selectors = DEFAULT_SELECTORS) {
  const diagnosis = {
    timestamp: Date.now(),
    issues: [],
    suggestions: [],
    snapshot: null,
  };

  // Check 1: Main container exists
  const main = doc.querySelector(selectors.mainContainer);
  if (!main) {
    diagnosis.issues.push({
      type: 'missing_main',
      message: `Main container "${selectors.mainContainer}" not found`,
    });
    diagnosis.suggestions.push('Page may not be fully loaded or structure changed');
    diagnosis.snapshot = captureDomSnapshot(doc);
    return diagnosis;
  }

  // Check 2: Look for reaction buttons anywhere on page
  const allButtons = doc.querySelectorAll('button');
  let reactionButtonCount = 0;
  let reactionLabelPattern = null;

  for (const button of allButtons) {
    const label = button.getAttribute('aria-label') || '';
    if (label.startsWith(selectors.reactionButtonLabel)) {
      reactionButtonCount++;
    }
    // Also look for similar patterns that might be the new format
    if (label.includes('React') || label.includes('Like') || label.includes('reaction')) {
      if (!reactionLabelPattern) {
        reactionLabelPattern = label.slice(0, 40);
      }
    }
  }

  if (reactionButtonCount === 0) {
    diagnosis.issues.push({
      type: 'no_reaction_buttons',
      message: `No buttons with aria-label starting with "${selectors.reactionButtonLabel}"`,
      foundPattern: reactionLabelPattern,
    });
    if (reactionLabelPattern) {
      diagnosis.suggestions.push(`Found similar pattern: "${reactionLabelPattern}"`);
    }
  }

  // Check 3: Look for containers with many children
  const containersWithManyChildren = [];
  function findContainers(element, depth = 0) {
    if (depth > selectors.maxSearchDepth) return;
    if (element.children?.length >= selectors.minFeedChildren) {
      containersWithManyChildren.push({
        tag: element.tagName?.toLowerCase(),
        childCount: element.children.length,
        depth,
        hasReactionButtons: Array.from(element.children).some((child) => {
          const buttons = child.querySelectorAll('button');
          for (const btn of buttons) {
            if ((btn.getAttribute('aria-label') || '').startsWith(selectors.reactionButtonLabel)) {
              return true;
            }
          }
          return false;
        }),
      });
    }
    for (const child of element.children || []) {
      findContainers(child, depth + 1);
    }
  }
  findContainers(main);

  if (containersWithManyChildren.length === 0) {
    diagnosis.issues.push({
      type: 'no_feed_container',
      message: `No container with ${selectors.minFeedChildren}+ children found in main`,
    });
  } else {
    const withReactions = containersWithManyChildren.filter((c) => c.hasReactionButtons);
    if (withReactions.length === 0 && reactionButtonCount > 0) {
      diagnosis.issues.push({
        type: 'structure_mismatch',
        message: 'Reaction buttons exist but not in expected container structure',
        containers: containersWithManyChildren.slice(0, 3),
      });
    }
  }

  // Capture snapshot for further analysis
  diagnosis.snapshot = captureDomSnapshot(doc);

  return diagnosis;
}

/**
 * Attempt to heal selectors based on diagnosis.
 * Returns updated selectors if healing is possible, null otherwise.
 *
 * @param {object} diagnosis - Diagnosis from diagnoseDomIssues
 * @param {Document} doc - The document to test against
 * @returns {object|null} Healed selectors or null if healing failed
 */
export function attemptLocalHealing(diagnosis, doc = document) {
  const healed = { ...DEFAULT_SELECTORS };
  let changed = false;

  // Try to heal reaction button label pattern
  for (const issue of diagnosis.issues) {
    if (issue.type === 'no_reaction_buttons' && issue.foundPattern) {
      // Extract the prefix from the found pattern
      const colonIndex = issue.foundPattern.indexOf(':');
      if (colonIndex > 0) {
        const newPattern = issue.foundPattern.slice(0, colonIndex + 1);
        healed.reactionButtonLabel = newPattern;
        changed = true;
      }
    }
  }

  // Test if healed selectors work
  if (changed) {
    const testResult = testSelectors(healed, doc);
    if (testResult.success) {
      return healed;
    }
  }

  return null;
}

/**
 * Test if selectors can successfully detect posts.
 *
 * @param {object} selectors - Selectors to test
 * @param {Document} doc - Document to test against
 * @returns {object} Test result with success boolean and details
 */
export function testSelectors(selectors, doc = document) {
  const result = {
    success: false,
    mainFound: false,
    feedFound: false,
    postsFound: 0,
  };

  // Test main container
  const main = doc.querySelector(selectors.mainContainer);
  if (!main) return result;
  result.mainFound = true;

  // Test feed detection using the selector's reaction button label
  function findFeedWithSelectors(element, depth = 0) {
    if (depth > selectors.maxSearchDepth) return null;
    for (const child of element.children || []) {
      if (child.children?.length >= selectors.minFeedChildren) {
        const childArray = Array.from(child.children);
        const postLikeCount = childArray.filter((c) => {
          const buttons = c.querySelectorAll('button');
          for (const btn of buttons) {
            if ((btn.getAttribute('aria-label') || '').startsWith(selectors.reactionButtonLabel)) {
              return true;
            }
          }
          return false;
        }).length;
        if (postLikeCount >= 1) {
          return child;
        }
      }
      const deeper = findFeedWithSelectors(child, depth + 1);
      if (deeper) return deeper;
    }
    return null;
  }

  const feed = findFeedWithSelectors(main);
  if (!feed) return result;
  result.feedFound = true;

  // Count posts
  const posts = Array.from(feed.children).filter((child) => {
    const buttons = child.querySelectorAll('button');
    for (const btn of buttons) {
      if ((btn.getAttribute('aria-label') || '').startsWith(selectors.reactionButtonLabel)) {
        return true;
      }
    }
    return false;
  });

  result.postsFound = posts.length;
  result.success = posts.length > 0;

  return result;
}
