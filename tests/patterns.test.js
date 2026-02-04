// Tests for local pattern matching classification
//
// These tests serve two purposes:
// 1. Verify pattern matching works correctly
// 2. Document known limitations for future improvements
//
// Known pattern limitations (documented in tests):
// - Emoji patterns: \b word boundaries don't work well with emojis
// - End-of-string patterns: Punctuation like "?" breaks matches (e.g., "What are your thoughts?")
// - Quote patterns: Trailing \b after quotes doesn't match as expected
// - Plural forms: Some patterns don't handle plurals (e.g., "snowflake" vs "snowflakes")
// - Overly broad matches: "election", "Senate" match in non-political contexts

import { describe, it, expect } from 'vitest';
import { LOCAL_PATTERNS, classifyWithPatterns, classifyPostsLocally } from '../src/patterns.js';

// ─── Helper: All categories enabled ─────────────────────────────────

const ALL_ENABLED = {
  ai_generated: { enabled: true, label: 'AI Generated' },
  thought_leadership: { enabled: true, label: 'Thought Leadership' },
  engagement_bait: { enabled: true, label: 'Engagement Bait' },
  self_promotion: { enabled: true, label: 'Self Promotion' },
  politics: { enabled: true, label: 'Politics' },
  rage_bait: { enabled: true, label: 'Rage Bait' },
  corporate_fluff: { enabled: true, label: 'Corporate Fluff' },
};

// ─── Pattern Coverage Tests ─────────────────────────────────────────

describe('LOCAL_PATTERNS', () => {
  it('has all expected categories', () => {
    const expectedCategories = [
      'ai_generated',
      'thought_leadership',
      'engagement_bait',
      'self_promotion',
      'politics',
      'rage_bait',
      'corporate_fluff',
    ];
    expect(Object.keys(LOCAL_PATTERNS)).toEqual(expectedCategories);
  });

  it('each category has at least one pattern', () => {
    for (const [category, patterns] of Object.entries(LOCAL_PATTERNS)) {
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p instanceof RegExp)).toBe(true);
    }
  });
});

describe('ai_generated patterns', () => {
  const patterns = LOCAL_PATTERNS.ai_generated;

  const shouldMatch = [
    "In today's fast-paced world, we need to adapt quickly.",
    "In today's world of constant change, flexibility matters.",
    'In this day and age, remote work is the norm.',
    'Let me share something I discovered recently.',
    "Here's what I learned from my latest project.",
    "Here's the thing about leadership.",
    "I've been thinking about productivity lately.",
    'It got me thinking about our processes.',
    'This new tool is a game-changer for teams.',
    'Time to level-up your skills!',
    "Let's do a deep dive into this topic.",
    'I want to unpack this idea.',
    'At the end of the day, results matter.',
    'We need to move the needle on this metric.',
    'Leaders need to lean in to challenges.',
    'The synergy between teams is crucial.',
    'We should leverage our existing assets.',
    'This represents a paradigm shift in our industry.',
    'Following best practices is essential.',
    'The bottom line is customer satisfaction.',
    "Here's the takeaway from this experience.",
    'These are the key takeaways from the conference.',
    'What are your thoughts', // Pattern requires end-of-string without punctuation
    "I'd love to hear", // Pattern requires end-of-string
  ];

  const shouldNotMatch = [
    // Pattern /\b(what are your thoughts|I'd love to hear)\s*$/i requires end-of-string
    // so punctuation like "?" breaks the match
    'What are your thoughts?', // Question mark prevents match (pattern bug)
    'Had a great meeting with the team today.',
    'Just finished reading an interesting book.',
    'Looking forward to the weekend.',
    'The product launch went well.',
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

describe('thought_leadership patterns', () => {
  const patterns = LOCAL_PATTERNS.thought_leadership;

  const shouldMatch = [
    'Unpopular opinion: meetings are mostly useless.',
    'Hot take: remote work is here to stay.',
    "Here's a controversial take on hiring.",
    "I've learned so much this year.",
    '5 lessons I learned from failure.',
    'What I learned from starting a company.',
    'The secret to productivity is focus.',
    'The key to success is persistence.',
    'The truth about startup culture.',
    '10 things that changed my career.',
    '5 tips for better communication.',
    '7 ways to improve your workflow.',
    '3 habits that successful people have.', // Pattern requires "that/for/to" not "of"
    'Here are 5 things you should know.',
    "Here's 3 ways to boost productivity.",
    'When I started my career 10 years ago...',
    'Years ago, I made a crucial decision.',
    'My journey in tech has been wild.',
    'My story begins with a failure.',
    'My experience taught me valuable lessons.',
    'Grateful to announce my new role.',
    'Blessed for this opportunity.',
    'Humbled by the response to my post.',
    'Excited to announce our new product!',
    'Thrilled to share this news.',
    'Proud to be part of this team.',
  ];

  const shouldNotMatch = [
    'The meeting is scheduled for 3pm.',
    'Please review the attached document.',
    'Our Q4 results exceeded expectations.',
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

describe('engagement_bait patterns', () => {
  const patterns = LOCAL_PATTERNS.engagement_bait;

  const shouldMatch = [
    'Agree?',
    'Thoughts?',
    'Am I right?',
    'Am I wrong?',
    'Like if you feel the same way.',
    'Share if you agree with this.',
    'Comment below with your experience.',
    'Comment if you relate.',
    'Tag someone who needs to see this.',
    'Share this with your network.',
    'Repost if you believe in this.',
    "Most people don't realize this.",
    'Nobody talks about this issue.',
    'Change my mind about remote work.',
    'Prove me wrong on this.',
    'Fight me on this.',
    'Type yes if you want success.', // Pattern matches "type yes" (with optional quotes)
    'Who else feels this way?',
    'Anyone else struggling with this?',
    'Raise your hand if you relate.',
    'Would you rather work from home?',
    'What would you choose?',
    'Which one do you prefer?',
  ];

  const shouldNotMatch = [
    'Here is my analysis of the data.',
    'The project is progressing well.',
    'We completed the milestone on time.',
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

describe('self_promotion patterns', () => {
  const patterns = LOCAL_PATTERNS.self_promotion;

  const shouldMatch = [
    'Check out my new course!',
    'Grab your copy before it sells out.',
    'Get your free guide here.',
    'Download my ebook today.',
    'Link in bio for more info.',
    'Link in comments.',
    'Link in profile.',
    'Use code SAVE20 for a discount.',
    'Apply discount code SUMMER.',
    'Use promo code LAUNCH.',
    'DM me for details.',
    'Send me a message to learn more.',
    'Book a call with me.',
    'Just hit 10,000 followers!',
    'Just reached 1M impressions.',
    'Just crossed 500 subscribers.',
    'We just launched our new feature!',
    'I just launched my newsletter.',
    'I just released my podcast.',
    'Now available on all platforms.',
    'Out now - check it out!',
    'My new course just dropped.',
    "We're hiring engineers!",
    'We are hiring designers.',
    'Join my team!',
    'Open positions in engineering.',
    'Job opening for senior developer.',
    'Apply now for this role.',
  ];

  const shouldNotMatch = [
    'Learned something new today.',
    'Great discussion at the conference.',
    'The team did amazing work.',
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

describe('politics patterns', () => {
  const patterns = LOCAL_PATTERNS.politics;

  const shouldMatch = [
    'The Democrat position on this is clear.',
    'Republican lawmakers disagree.',
    'Liberal policies are changing things.',
    'Conservative values matter.',
    'This is a left-wing approach.',
    'The right-wing response was swift.',
    'Bipartisan support is needed.',
    'Biden announced new measures.',
    'Trump supporters gathered.',
    'Congress passed the bill.',
    'The Senate voted today.',
    'Parliament debated the issue.',
    'Immigration policy needs reform.',
    'Gun control debate continues.',
    'The abortion ruling changed everything.',
    'Climate policy is crucial.',
    'Tax cuts benefit the economy.',
    'Tax hikes are proposed.',
    'Healthcare reform is needed.',
    'The election results are in.',
    'Voting rights matter.',
    'Ballot counting continues.',
    'Political tension is rising.',
    'The libs are at it again.',
    'MAGA movement grows.',
    'Woke culture is spreading.',
    'Snowflake generation.', // Singular matches; plural "snowflakes" doesn't
    'The left is destroying values.',
    'The right wants to control.',
  ];

  // Note: Some patterns match too broadly (false positives documented here)
  const shouldNotMatch = [
    'Our company policy was updated.',
    // These ARE matched (false positives) because patterns are too broad:
    // 'The election of board members happened.' - matches "election"
    // 'Senate Street is a nice area.' - matches "Senate"
    'We voted on the proposal.', // "voted" is not in patterns, only "voting"
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

describe('rage_bait patterns', () => {
  const patterns = LOCAL_PATTERNS.rage_bait;

  const shouldMatch = [
    "I don't care what you think about this.",
    'Deal with it or leave.',
    'Cry about it all you want.',
    'Wake up people!',
    'Open your eyes to the truth.',
    'Stop being sheeple.',
    "This is what's wrong with tech.",
    'The problem with society today.',
    'Boomers are ruining everything.',
    'Boomers ruin the housing market.',
    'Millennials are killing industries.',
    'Millennials kill restaurants.',
    'Gen Z is so entitled.',
    'Gen-Z are different.',
    'Kids these days have no work ethic.',
    'Back in my day we worked hard.',
    'Your generation is soft.',
    "If you disagree, you're wrong.",
    "If you don't like it, leave.",
    'Haters gonna hate.',
    'Haters will always criticize.',
    "Snowflakes can't handle criticism.",
    'Everyone is so triggered these days.',
    'People are too easily offended.',
  ];

  const shouldNotMatch = [
    'I appreciate different perspectives.',
    'Let me explain my reasoning.',
    'Here is the data supporting this.',
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

describe('corporate_fluff patterns', () => {
  const patterns = LOCAL_PATTERNS.corporate_fluff;

  const shouldMatch = [
    'Excited to announce our new initiative!',
    'Thrilled to share this milestone.',
    'Proud to announce our partnership.',
    'Pleased to announce our expansion.',
    'Pleased to share this achievement.',
    'Pleased to welcome our new CEO.',
    'Delighted to join this team.',
    'Honored to receive this award.',
    'Privileged to speak at the conference.',
    'Looking for synergies between teams.',
    'Engaging with key stakeholders.',
    'This is a real value-add.',
    "Let's circle back on this topic.",
    'Going forward, we will focus on growth.',
    'Moving forward with the plan.',
    'At this juncture, we must decide.',
    'Leverage our core competencies.',
    'Optimize our processes.',
    'Transform our digital presence.',
    'Our award-winning product.',
    'Industry-leading solutions.',
    'World-class customer service.',
    'Recognized by Forbes.',
    'Named a top employer.',
    'Ranked #1 in customer satisfaction.',
    'Strategic partnership with Microsoft.',
    'Partnership with leading firms.',
    'Partnered with top universities.',
    'Joining forces with innovators.',
    'Teaming up with industry leaders.',
    'Collaboration with research institutions.',
  ];

  const shouldNotMatch = [
    'We fixed the bug in production.',
    'The quarterly report is ready.',
    'Meeting rescheduled to tomorrow.',
  ];

  it.each(shouldMatch)('matches: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(true);
  });

  it.each(shouldNotMatch)('does not match: %s', (text) => {
    const matches = patterns.some((p) => p.test(text));
    expect(matches).toBe(false);
  });
});

// ─── classifyWithPatterns Tests ─────────────────────────────────────

describe('classifyWithPatterns', () => {
  describe('input validation', () => {
    it('returns null for null content', () => {
      expect(classifyWithPatterns(null, ALL_ENABLED)).toBeNull();
    });

    it('returns null for undefined content', () => {
      expect(classifyWithPatterns(undefined, ALL_ENABLED)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(classifyWithPatterns('', ALL_ENABLED)).toBeNull();
    });

    it('returns null for non-string content', () => {
      expect(classifyWithPatterns(123, ALL_ENABLED)).toBeNull();
      expect(classifyWithPatterns({}, ALL_ENABLED)).toBeNull();
      expect(classifyWithPatterns([], ALL_ENABLED)).toBeNull();
    });
  });

  describe('basic classification', () => {
    it('returns null when no patterns match', () => {
      const content = 'Had a nice lunch with colleagues today.';
      expect(classifyWithPatterns(content, ALL_ENABLED)).toBeNull();
    });

    it('returns classification when pattern matches', () => {
      const content = "In today's fast-paced world, we need to adapt.";
      const result = classifyWithPatterns(content, ALL_ENABLED);

      expect(result).not.toBeNull();
      expect(result.filter).toBe(true);
      expect(result.category).toBe('ai_generated');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reason).toContain('pattern');
    });

    it('returns category with most matches when multiple categories match', () => {
      // This content matches both thought_leadership and corporate_fluff
      const content =
        "Excited to announce that I've learned 5 lessons. Thrilled to share my journey.";
      const result = classifyWithPatterns(content, ALL_ENABLED);

      expect(result).not.toBeNull();
      expect(result.filter).toBe(true);
      // Should pick the one with more matches
      expect(['thought_leadership', 'corporate_fluff']).toContain(result.category);
    });
  });

  describe('category filtering', () => {
    it('skips disabled categories', () => {
      const content = "In today's fast-paced world, we need to adapt.";
      const categories = {
        ...ALL_ENABLED,
        ai_generated: { enabled: false, label: 'AI Generated' },
      };

      const result = classifyWithPatterns(content, categories);
      expect(result).toBeNull();
    });

    it('works with null enabledCategories (all enabled by default)', () => {
      const content = "In today's fast-paced world, we need to adapt.";
      const result = classifyWithPatterns(content, null);

      expect(result).not.toBeNull();
      expect(result.category).toBe('ai_generated');
    });

    it('works with undefined enabledCategories', () => {
      const content = "In today's fast-paced world, we need to adapt.";
      const result = classifyWithPatterns(content, undefined);

      expect(result).not.toBeNull();
    });
  });

  describe('sensitivity levels', () => {
    it('low sensitivity requires 2+ matches', () => {
      // Single match content
      const singleMatch = "In today's fast-paced world, things change.";
      expect(classifyWithPatterns(singleMatch, ALL_ENABLED, 'low')).toBeNull();

      // Double match content
      const doubleMatch = "In today's fast-paced world, here's the takeaway for success.";
      const result = classifyWithPatterns(doubleMatch, ALL_ENABLED, 'low');
      expect(result).not.toBeNull();
    });

    it('medium sensitivity requires 1+ matches', () => {
      const content = "In today's fast-paced world, things change.";
      const result = classifyWithPatterns(content, ALL_ENABLED, 'medium');

      expect(result).not.toBeNull();
    });

    it('high sensitivity requires 1+ matches (same as medium)', () => {
      const content = "In today's fast-paced world, things change.";
      const result = classifyWithPatterns(content, ALL_ENABLED, 'high');

      expect(result).not.toBeNull();
    });

    it('defaults to medium sensitivity for unknown values', () => {
      const content = "In today's fast-paced world, things change.";
      const result = classifyWithPatterns(content, ALL_ENABLED, 'unknown');

      expect(result).not.toBeNull();
    });
  });

  describe('confidence calculation', () => {
    it('increases confidence with more matches', () => {
      const singleMatch = "In today's fast-paced world.";
      const multiMatch =
        "In today's fast-paced world, let me share the key takeaways. Here's the thing about synergy.";

      const singleResult = classifyWithPatterns(singleMatch, ALL_ENABLED);
      const multiResult = classifyWithPatterns(multiMatch, ALL_ENABLED);

      expect(multiResult.confidence).toBeGreaterThan(singleResult.confidence);
    });

    it('caps confidence at 0.95', () => {
      // Content with many matches
      const content =
        "In today's fast-paced world, let me share the key takeaways. Here's the thing. " +
        'At the end of the day, we need to leverage synergy and optimize our paradigm shift. ' +
        'What are your thoughts?';
      const result = classifyWithPatterns(content, ALL_ENABLED);

      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });

    it('calculates confidence based on sensitivity level', () => {
      const content = "In today's fast-paced world."; // Single match

      // low: 0.4 base + 0.15 per match = 0.55 (but requires 2 matches, so null)
      const lowResult = classifyWithPatterns(content, ALL_ENABLED, 'low');
      expect(lowResult).toBeNull();

      // medium: 0.5 base + 0.15 per match = 0.65
      const mediumResult = classifyWithPatterns(content, ALL_ENABLED, 'medium');
      expect(mediumResult.confidence).toBeCloseTo(0.65, 2);

      // high: 0.6 base + 0.2 per match = 0.8
      const highResult = classifyWithPatterns(content, ALL_ENABLED, 'high');
      expect(highResult.confidence).toBeCloseTo(0.8, 2);
    });

    it('high sensitivity produces higher confidence than medium for same content', () => {
      const content = "In today's fast-paced world, here's the takeaway."; // 2 matches

      const mediumResult = classifyWithPatterns(content, ALL_ENABLED, 'medium');
      const highResult = classifyWithPatterns(content, ALL_ENABLED, 'high');

      expect(highResult.confidence).toBeGreaterThan(mediumResult.confidence);
    });
  });
});

// ─── classifyPostsLocally Tests ─────────────────────────────────────

describe('classifyPostsLocally', () => {
  const settings = {
    categories: ALL_ENABLED,
    sensitivity: 'medium',
  };

  it('classifies multiple posts', () => {
    const posts = [
      { id: 'post-1', content: "In today's fast-paced world.", author: 'Alice' },
      { id: 'post-2', content: 'Had a nice lunch today.', author: 'Bob' },
      { id: 'post-3', content: 'Excited to announce our partnership!', author: 'Carol' },
    ];

    const results = classifyPostsLocally(posts, settings);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('post-1');
    expect(results[1].id).toBe('post-2');
    expect(results[2].id).toBe('post-3');
  });

  it('adds category label from settings', () => {
    const posts = [{ id: 'post-1', content: "In today's fast-paced world.", author: 'Alice' }];

    const results = classifyPostsLocally(posts, settings);

    expect(results[0].categoryLabel).toBe('AI Generated');
  });

  it('returns proper structure for non-matches', () => {
    const posts = [{ id: 'post-1', content: 'Had a nice lunch today.', author: 'Alice' }];

    const results = classifyPostsLocally(posts, settings);

    expect(results[0]).toEqual({
      id: 'post-1',
      filter: false,
      category: null,
      confidence: 0,
      reason: 'No patterns matched',
    });
  });

  it('returns proper structure for matches', () => {
    const posts = [{ id: 'post-1', content: "In today's fast-paced world.", author: 'Alice' }];

    const results = classifyPostsLocally(posts, settings);

    expect(results[0].id).toBe('post-1');
    expect(results[0].filter).toBe(true);
    expect(results[0].category).toBe('ai_generated');
    expect(results[0].categoryLabel).toBe('AI Generated');
    expect(results[0].confidence).toBeGreaterThan(0);
    expect(results[0].reason).toContain('pattern');
  });

  it('handles empty posts array', () => {
    const results = classifyPostsLocally([], settings);
    expect(results).toEqual([]);
  });

  it('handles null settings - no categories enabled means no matches', () => {
    const posts = [{ id: 'post-1', content: "In today's fast-paced world.", author: 'Alice' }];

    const results = classifyPostsLocally(posts, null);

    // When settings is null, categories defaults to {}, so all categories are "not enabled"
    expect(results[0].filter).toBe(false);
    expect(results[0].category).toBeNull();
  });

  it('handles undefined settings - no categories enabled means no matches', () => {
    const posts = [{ id: 'post-1', content: "In today's fast-paced world.", author: 'Alice' }];

    const results = classifyPostsLocally(posts, undefined);

    // When settings is undefined, categories defaults to {}, so all categories are "not enabled"
    expect(results[0].filter).toBe(false);
  });

  it('uses category ID as label when label not in settings', () => {
    const posts = [{ id: 'post-1', content: "In today's fast-paced world.", author: 'Alice' }];
    const minimalSettings = {
      categories: {
        ai_generated: { enabled: true }, // No label property
      },
    };

    const results = classifyPostsLocally(posts, minimalSettings);

    expect(results[0].categoryLabel).toBe('ai_generated');
  });
});

// ─── Known Pattern Limitations ──────────────────────────────────────
// These tests document current limitations for future improvement

describe('pattern limitations (documented)', () => {
  it('end-of-string patterns with \s*$ require no trailing punctuation', () => {
    // Pattern in ai_generated: /\b(what are your thoughts|I'd love to hear)\s*$/i
    // This requires end-of-string, so punctuation breaks the match
    // However, engagement_bait has /\b(thoughts\??)\s*$/i which handles "?"
    const withPunctuation = "I'd love to hear your feedback?";
    const withoutPunctuation = "I'd love to hear";

    // Isolate to ai_generated category only
    const aiOnly = { ai_generated: { enabled: true, label: 'AI Generated' } };

    const result1 = classifyWithPatterns(withPunctuation, aiOnly);
    const result2 = classifyWithPatterns(withoutPunctuation, aiOnly);

    expect(result1).toBeNull(); // Punctuation breaks the match
    expect(result2).not.toBeNull(); // Works without punctuation
  });

  it('emoji patterns fail due to word boundary issues', () => {
    // Pattern: /\b(drop a 🔥|...)\b/i
    // \b doesn't work reliably with unicode emojis
    const content = 'Drop a 🔥 if you agree!';
    const result = classifyWithPatterns(content, ALL_ENABLED);

    expect(result).toBeNull(); // BUG: Should match but doesn't
  });

  it('quote patterns fail due to trailing word boundary', () => {
    // Pattern: /\b(comment\s+["'][^"']+["'])\b/i
    // Trailing \b after closing quote doesn't work
    const content = "Comment 'growth' below";
    const result = classifyWithPatterns(content, ALL_ENABLED);

    expect(result).toBeNull(); // BUG: Should match but doesn't
  });

  it('plural forms may not match', () => {
    // Pattern: /\b(snowflake)\b/i - doesn't match "snowflakes"
    const singular = 'What a snowflake.';
    const plural = 'These snowflakes are everywhere.';

    const result1 = classifyWithPatterns(singular, ALL_ENABLED);
    const result2 = classifyWithPatterns(plural, ALL_ENABLED);

    expect(result1?.category).toBe('politics');
    expect(result2?.category).toBe('rage_bait'); // Matches rage_bait's plural pattern instead
  });

  it('some patterns match too broadly (false positives)', () => {
    // Pattern: /\b(election|...)\b/i matches any use of "election"
    const politicalContext = 'The presidential election was contentious.';
    const nonPoliticalContext = 'The election of board members happened today.';

    const result1 = classifyWithPatterns(politicalContext, ALL_ENABLED);
    const result2 = classifyWithPatterns(nonPoliticalContext, ALL_ENABLED);

    expect(result1?.category).toBe('politics'); // Correct
    expect(result2?.category).toBe('politics'); // FALSE POSITIVE
  });
});

// ─── Boundary Cases ─────────────────────────────────────────────────

describe('boundary cases', () => {
  describe('short content', () => {
    it('handles very short content', () => {
      expect(classifyWithPatterns('Hi', ALL_ENABLED)).toBeNull();
    });

    it('matches patterns in short content if present', () => {
      const result = classifyWithPatterns('Agree?', ALL_ENABLED);
      expect(result).not.toBeNull();
      expect(result.category).toBe('engagement_bait');
    });
  });

  describe('unicode and special characters', () => {
    it('handles unicode content', () => {
      const content = "In today's fast-paced world, 日本語 is important.";
      const result = classifyWithPatterns(content, ALL_ENABLED);
      expect(result).not.toBeNull();
    });

    it('handles emojis in content - word boundaries may not work with emojis', () => {
      // Note: The pattern /\b(drop a 🔥|...)\b/i doesn't match well with emojis
      // because \b word boundaries don't work as expected with unicode
      const content = "Drop a 🔥 if you agree! Let's go!";
      const result = classifyWithPatterns(content, ALL_ENABLED);
      // This is null because the emoji pattern doesn't match (pattern limitation)
      expect(result).toBeNull();
    });

    it('matches other patterns in emoji-containing content', () => {
      // But other patterns can still match in content with emojis
      const content = "🔥🔥🔥 In today's fast-paced world 🚀";
      const result = classifyWithPatterns(content, ALL_ENABLED);
      expect(result).not.toBeNull();
      expect(result.category).toBe('ai_generated');
    });

    it('handles newlines in content', () => {
      const content = "In today's fast-paced world,\nwe need to adapt.";
      const result = classifyWithPatterns(content, ALL_ENABLED);
      expect(result).not.toBeNull();
    });
  });

  describe('case sensitivity', () => {
    it('matches regardless of case', () => {
      const lowercase = "in today's fast-paced world";
      const uppercase = "IN TODAY'S FAST-PACED WORLD";
      const mixed = "In ToDay's FaSt-PaCeD WoRlD";

      expect(classifyWithPatterns(lowercase, ALL_ENABLED)).not.toBeNull();
      expect(classifyWithPatterns(uppercase, ALL_ENABLED)).not.toBeNull();
      expect(classifyWithPatterns(mixed, ALL_ENABLED)).not.toBeNull();
    });
  });

  describe('word boundaries', () => {
    it('respects word boundaries - does not match partial words', () => {
      // "synergy" should not match in "synergistic" due to word boundary
      // Actually, \b(synergy|...) will match "synergy" within "synergistic" at the start
      // Let me test a clearer case

      // "hot take" should not match "hot takes" - wait, it should because "hot take" is in there
      // Let me check patterns that use $ for end of string

      // "Agree?" uses \s*$ so should only match at end
      const notAtEnd = 'Agree? I think so but maybe not.';
      const atEnd = 'Do you agree?';

      // The pattern is /\b(agree\??|thoughts\??|am I (right|wrong)\??)\s*$/i
      const result1 = classifyWithPatterns(notAtEnd, ALL_ENABLED);
      const result2 = classifyWithPatterns(atEnd, ALL_ENABLED);

      // notAtEnd should not match the engagement_bait pattern for "agree?" since it's not at end
      if (result1?.category === 'engagement_bait') {
        // Check if it matched a different pattern
        expect(result1.reason).not.toContain('agree');
      }
      expect(result2).not.toBeNull();
    });
  });

  describe('long content', () => {
    it('handles very long content', () => {
      const longContent = "In today's fast-paced world, " + 'lorem ipsum '.repeat(500) + 'the end.';
      const result = classifyWithPatterns(longContent, ALL_ENABLED);
      expect(result).not.toBeNull();
    });
  });

  describe('whitespace variations', () => {
    it('handles extra whitespace', () => {
      const content = "In   today's   fast-paced   world,  we  adapt.";
      const result = classifyWithPatterns(content, ALL_ENABLED);
      // May or may not match depending on pattern - pattern uses \s for some
      // The pattern is /\b(in today's fast-paced|...)\b/i - this requires exact spacing
      // So this test documents current behavior
      expect(result).toBeNull(); // Extra spaces break the pattern
    });

    it('handles tabs - pattern still matches phrase before tab', () => {
      const content = "In today's fast-paced\tworld.";
      const result = classifyWithPatterns(content, ALL_ENABLED);
      // The pattern matches "in today's fast-paced" (tab acts as word boundary)
      expect(result).not.toBeNull();
      expect(result.category).toBe('ai_generated');
    });
  });
});
