// LinkedIn Post Filter — Local Pattern Matching
// Regex-based classification for privacy-first filtering without external API calls

/**
 * Pattern definitions for each category.
 * Each category has an array of regex patterns that indicate a match.
 * Patterns are case-insensitive by default.
 */
export const LOCAL_PATTERNS = {
  ai_generated: [
    // Formulaic openings
    /\b(in today's fast-paced|in today's world|in this day and age)\b/i,
    /\b(let me share|here's what I learned|here's the thing)\b/i,
    /\b(I've been thinking about|it got me thinking)\b/i,
    // Buzzwords and jargon
    /\b(game.?changer|level.?up|deep dive|unpack this)\b/i,
    /\b(at the end of the day|move the needle|lean in)\b/i,
    /\b(synergy|leverage|optimize|streamline|scalable)\b/i,
    /\b(paradigm shift|best practices|value proposition)\b/i,
    // Generic AI-style conclusions
    /\b(the bottom line is|here's the takeaway|key takeaways?)\b/i,
    /\b(what are your thoughts|I'd love to hear)\s*$/i,
  ],

  thought_leadership: [
    // Humble brags disguised as insights
    /\b(unpopular opinion|hot take|controversial take)\b/i,
    /\b(I've learned|lessons? I've learned|what I learned)\b/i,
    /\b(the secret to|the key to success|the truth about)\b/i,
    // Numbered lists of wisdom
    /\b\d+\s*(lessons?|things?|tips?|ways?|habits?|rules?)\s*(I('ve)?|for|to|that)\b/i,
    /\b(here are|here's)\s+\d+\s*(things?|ways?|tips?|lessons?)\b/i,
    // Self-promotion disguised as advice
    /\b(when I (started|began|was)|years? ago,? I)\b/i,
    /\b(my journey|my story|my experience taught)\b/i,
    // LinkedIn-speak
    /\b(grateful|blessed|humbled)\s+(to|for|by)\b/i,
    /\b(excited to announce|thrilled to share|proud to)\b/i,
  ],

  engagement_bait: [
    // Direct engagement requests
    /\b(agree\??|thoughts\??|am I (right|wrong)\??)\s*$/i,
    /\b(like if you|share if you|comment (below|if you))\b/i,
    /\b(tag someone|share this with)\b/i,
    /\b(repost|share)\s+if\s+you\b/i,
    // Manufactured controversy
    /\b(most people don't|nobody talks about|unpopular but)\b/i,
    /\b(change my mind|prove me wrong|fight me)\b/i,
    // Engagement farming
    /\b(drop a 🔥|type\s+["']?yes["']?|comment\s+["'][^"']+["'])\b/i,
    /\b(who else|anyone else|raise your hand)\b/i,
    // Poll-style questions with obvious answers
    /\b(would you rather|what would you choose|which one)\b/i,
  ],

  self_promotion: [
    // Product/service plugs
    /\b(check out my|grab your copy|get your free|download my)\b/i,
    /\b(link in (bio|comments?|profile))\b/i,
    /\b(use code|discount code|promo code|coupon)\b/i,
    /\b(DM me|send me a message|book a call)\b/i,
    // Achievement announcements
    /\b(just hit|just reached|just crossed)\s+\d/i,
    /\b(we (just )?launched|I (just )?(launched|released|published))\b/i,
    /\b(now available|out now|just dropped)\b/i,
    // Hiring/recruiting
    /\b(we're hiring|we are hiring|join (my|our) team)\b/i,
    /\b(open positions?|job opening|apply now)\b/i,
  ],

  politics: [
    // Political figures and parties
    /\b(democrat|republican|liberal|conservative)\b/i,
    /\b(left.?wing|right.?wing|bipartisan)\b/i,
    /\b(Biden|Trump|Congress|Senate|Parliament)\b/i,
    // Policy topics
    /\b(immigration policy|gun control|abortion|climate policy)\b/i,
    /\b(tax (cuts?|hikes?|policy)|healthcare reform)\b/i,
    /\b(election|voting|ballot|political)\b/i,
    // Partisan language
    /\b(libs|maga|woke|snowflake)\b/i,
    /\b(the (left|right) (is|are|wants?))\b/i,
  ],

  rage_bait: [
    // Provocative statements
    /\b(I don't care what you think|deal with it|cry about it)\b/i,
    /\b(wake up|open your eyes|sheeple)\b/i,
    /\b(this is what's wrong with|the problem with society)\b/i,
    // Generational attacks
    /\b(boomers? (are|ruin)|millennials? (are|kill)|gen.?z (is|are))\b/i,
    /\b(kids these days|back in my day|your generation)\b/i,
    // Intentionally divisive
    /\b(if you (disagree|don't like)|haters (gonna|will))\b/i,
    /\b(snowflakes?|triggered|offended)\b/i,
  ],

  corporate_fluff: [
    // Empty announcements
    /\b(excited to announce|thrilled to share|proud to announce)\b/i,
    /\b(pleased to (announce|share|welcome))\b/i,
    /\b(delighted to|honored to|privileged to)\b/i,
    // Corporate jargon
    /\b(synergies|stakeholders|value.?add|circle back)\b/i,
    /\b(going forward|moving forward|at this juncture)\b/i,
    /\b(leverage our|optimize our|transform our)\b/i,
    // Award/recognition spam
    /\b(award.?winning|industry.?leading|world.?class)\b/i,
    /\b(recognized by|named (a|as)|ranked #?\d)\b/i,
    // Partnership announcements
    /\b(strategic partnership|partnership with|partnered with)\b/i,
    /\b(joining forces|teaming up|collaboration with)\b/i,
  ],
};

/**
 * Classify a single post using local pattern matching.
 * Returns the first matching category or null if no match.
 *
 * @param {string} content - The post content to classify
 * @param {Object} enabledCategories - Map of category ID to enabled status
 * @param {string} sensitivity - 'low' | 'medium' | 'high'
 * @returns {Object|null} Classification result or null if no match
 */
export function classifyWithPatterns(content, enabledCategories, sensitivity = 'medium') {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Sensitivity affects match threshold and confidence calculation
  const config = {
    low: { threshold: 2, baseConfidence: 0.4, perMatch: 0.15 },
    medium: { threshold: 1, baseConfidence: 0.5, perMatch: 0.15 },
    high: { threshold: 1, baseConfidence: 0.6, perMatch: 0.2 },
  };

  const { threshold, baseConfidence, perMatch } = config[sensitivity] || config.medium;
  const results = [];

  for (const [categoryId, patterns] of Object.entries(LOCAL_PATTERNS)) {
    // Skip disabled categories
    if (enabledCategories && !enabledCategories[categoryId]?.enabled) {
      continue;
    }

    let matchCount = 0;
    const matchedPatterns = [];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matchCount++;
        matchedPatterns.push(pattern.source);
      }
    }

    if (matchCount >= threshold) {
      // Calculate confidence based on sensitivity and match count
      const confidence = Math.min(baseConfidence + matchCount * perMatch, 0.95);

      results.push({
        category: categoryId,
        matchCount,
        confidence,
        matchedPatterns: matchedPatterns.slice(0, 3), // Keep first 3 for reason
      });
    }
  }

  if (results.length === 0) {
    return null;
  }

  // Return the category with the most matches (or highest confidence)
  results.sort((a, b) => b.matchCount - a.matchCount || b.confidence - a.confidence);
  const best = results[0];

  return {
    filter: true,
    category: best.category,
    confidence: best.confidence,
    reason: `Matched ${best.matchCount} pattern(s)`,
  };
}

/**
 * Classify multiple posts using local pattern matching.
 *
 * @param {Array} posts - Array of {id, content, author} objects
 * @param {Object} settings - Settings object with categories and sensitivity
 * @returns {Array} Array of classification results
 */
export function classifyPostsLocally(posts, settings) {
  const enabledCategories = settings?.categories || {};
  const sensitivity = settings?.sensitivity || 'medium';

  return posts.map((post) => {
    const result = classifyWithPatterns(post.content, enabledCategories, sensitivity);

    if (result) {
      // Add category label
      const categoryConfig = enabledCategories[result.category];
      return {
        id: post.id,
        ...result,
        categoryLabel: categoryConfig?.label || result.category,
      };
    }

    return {
      id: post.id,
      filter: false,
      category: null,
      confidence: 0,
      reason: 'No patterns matched',
    };
  });
}
