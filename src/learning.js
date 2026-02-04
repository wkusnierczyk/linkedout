// LinkedIn Post Filter — Local Learning Module
// Learns from user feedback to improve local pattern matching

// ─── Keyword Extraction ─────────────────────────────────────────────

// Common words to ignore when extracting keywords
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'ourselves',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'he',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'it',
  'its',
  'itself',
  'they',
  'them',
  'their',
  'theirs',
  'themselves',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'a',
  'an',
  'the',
  'and',
  'but',
  'if',
  'or',
  'because',
  'as',
  'until',
  'while',
  'of',
  'at',
  'by',
  'for',
  'with',
  'about',
  'against',
  'between',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'to',
  'from',
  'up',
  'down',
  'in',
  'out',
  'on',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  's',
  't',
  'can',
  'will',
  'just',
  'don',
  'should',
  'now',
  'd',
  'll',
  'm',
  'o',
  're',
  've',
  'y',
  'ain',
  'aren',
  'couldn',
  'didn',
  'doesn',
  'hadn',
  'hasn',
  'haven',
  'isn',
  'ma',
  'mightn',
  'mustn',
  'needn',
  'shan',
  'shouldn',
  'wasn',
  'weren',
  'won',
  'wouldn',
  'also',
  'get',
  'got',
  'getting',
  'going',
  'go',
  'goes',
  'gone',
  'come',
  'comes',
  'coming',
  'came',
  'make',
  'makes',
  'making',
  'made',
  'take',
  'takes',
  'taking',
  'took',
  'taken',
  'see',
  'sees',
  'seeing',
  'saw',
  'seen',
  'know',
  'knows',
  'knowing',
  'knew',
  'known',
  'think',
  'thinks',
  'thinking',
  'thought',
  'want',
  'wants',
  'wanting',
  'wanted',
  'use',
  'uses',
  'using',
  'used',
  'find',
  'finds',
  'finding',
  'found',
  'give',
  'gives',
  'giving',
  'gave',
  'given',
  'tell',
  'tells',
  'telling',
  'told',
  'work',
  'works',
  'working',
  'worked',
  'call',
  'calls',
  'calling',
  'called',
  'try',
  'tries',
  'trying',
  'tried',
  'ask',
  'asks',
  'asking',
  'asked',
  'need',
  'needs',
  'needing',
  'needed',
  'feel',
  'feels',
  'feeling',
  'felt',
  'become',
  'becomes',
  'becoming',
  'became',
  'leave',
  'leaves',
  'leaving',
  'left',
  'put',
  'puts',
  'putting',
  'mean',
  'means',
  'meaning',
  'meant',
  'keep',
  'keeps',
  'keeping',
  'kept',
  'let',
  'lets',
  'letting',
  'begin',
  'begins',
  'beginning',
  'began',
  'begun',
  'seem',
  'seems',
  'seeming',
  'seemed',
  'help',
  'helps',
  'helping',
  'helped',
  'show',
  'shows',
  'showing',
  'showed',
  'shown',
  'hear',
  'hears',
  'hearing',
  'heard',
  'play',
  'plays',
  'playing',
  'played',
  'run',
  'runs',
  'running',
  'ran',
  'move',
  'moves',
  'moving',
  'moved',
  'live',
  'lives',
  'living',
  'lived',
  'believe',
  'believes',
  'believing',
  'believed',
  'bring',
  'brings',
  'bringing',
  'brought',
  'happen',
  'happens',
  'happening',
  'happened',
  'write',
  'writes',
  'writing',
  'wrote',
  'written',
  'provide',
  'provides',
  'providing',
  'provided',
  'sit',
  'sits',
  'sitting',
  'sat',
  'stand',
  'stands',
  'standing',
  'stood',
  'lose',
  'loses',
  'losing',
  'lost',
  'pay',
  'pays',
  'paying',
  'paid',
  'meet',
  'meets',
  'meeting',
  'met',
  'include',
  'includes',
  'including',
  'included',
  'continue',
  'continues',
  'continuing',
  'continued',
  'set',
  'sets',
  'setting',
  'learn',
  'learns',
  'learning',
  'learned',
  'change',
  'changes',
  'changing',
  'changed',
  'lead',
  'leads',
  'leading',
  'led',
  'understand',
  'understands',
  'understanding',
  'understood',
  'watch',
  'watches',
  'watching',
  'watched',
  'follow',
  'follows',
  'following',
  'followed',
  'stop',
  'stops',
  'stopping',
  'stopped',
  'create',
  'creates',
  'creating',
  'created',
  'speak',
  'speaks',
  'speaking',
  'spoke',
  'spoken',
  'read',
  'reads',
  'reading',
  'allow',
  'allows',
  'allowing',
  'allowed',
  'add',
  'adds',
  'adding',
  'added',
  'spend',
  'spends',
  'spending',
  'spent',
  'grow',
  'grows',
  'growing',
  'grew',
  'grown',
  'open',
  'opens',
  'opening',
  'opened',
  'walk',
  'walks',
  'walking',
  'walked',
  'win',
  'wins',
  'winning',
  'won',
  'offer',
  'offers',
  'offering',
  'offered',
  'remember',
  'remembers',
  'remembering',
  'remembered',
  'love',
  'loves',
  'loving',
  'loved',
  'consider',
  'considers',
  'considering',
  'considered',
  'appear',
  'appears',
  'appearing',
  'appeared',
  'buy',
  'buys',
  'buying',
  'bought',
  'wait',
  'waits',
  'waiting',
  'waited',
  'serve',
  'serves',
  'serving',
  'served',
  'die',
  'dies',
  'dying',
  'died',
  'send',
  'sends',
  'sending',
  'sent',
  'expect',
  'expects',
  'expecting',
  'expected',
  'build',
  'builds',
  'building',
  'built',
  'stay',
  'stays',
  'staying',
  'stayed',
  'fall',
  'falls',
  'falling',
  'fell',
  'fallen',
  'cut',
  'cuts',
  'cutting',
  'reach',
  'reaches',
  'reaching',
  'reached',
  'kill',
  'kills',
  'killing',
  'killed',
  'remain',
  'remains',
  'remaining',
  'remained',
  'linkedin',
  'post',
  'posts',
  'share',
  'shared',
  'sharing',
  'comment',
  'comments',
  'like',
  'likes',
  'liked',
  'liking',
  'people',
  'person',
  'thing',
  'things',
  'way',
  'ways',
  'day',
  'days',
  'year',
  'years',
  'time',
  'times',
  'today',
  'week',
  'month',
]);

/**
 * Extract meaningful keywords from text content.
 * Returns array of lowercase keywords, filtered for stop words and minimum length.
 */
export function extractKeywords(content) {
  if (!content || typeof content !== 'string') return [];

  // Normalize and tokenize
  const words = content
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ') // Keep apostrophes and hyphens
    .split(/\s+/)
    .filter((word) => {
      // Filter criteria
      if (word.length < 4) return false; // Too short
      if (word.length > 25) return false; // Too long (probably garbage)
      if (STOP_WORDS.has(word)) return false; // Stop word
      if (/^\d+$/.test(word)) return false; // Pure number
      if (/^['-]+$/.test(word)) return false; // Just punctuation
      return true;
    });

  // Count frequency and return unique words sorted by frequency
  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // Top 20 keywords
    .map(([word]) => word);
}

// ─── Signal Weights ─────────────────────────────────────────────────

export const SIGNAL_WEIGHTS = {
  // Direct filter feedback
  filterApproved: { author: -1, analyzeForFilter: true },
  filterRejected: { author: +2, analyzeForKeep: true },

  // Post interactions
  liked: { author: +3, analyzeForKeep: true },
  commented: { author: +3, analyzeForKeep: true },
  shared: { author: +3, analyzeForKeep: true },

  // Negative signals
  hidden: { author: -10 }, // Hide posts by user
  unfollowed: { author: -10 }, // Unfollow user
  notInterested: { author: -2, analyzeForFilter: true },
};

// ─── Learning Data Management ───────────────────────────────────────

const DEFAULT_LEARNING_DATA = {
  authorReputation: {}, // { "Author Name": score }
  learnedKeywords: { keep: [], filter: [] },
  patternStats: {}, // { "pattern_source": { hits: 0, misses: 0 } }
};

/**
 * Process a feedback signal and update learning data.
 */
export async function processSignal(
  signal,
  { author, content, _category, matchedPatterns },
  getStorage,
  setStorage
) {
  const { learningData = { ...DEFAULT_LEARNING_DATA } } = await getStorage('learningData');
  const weights = SIGNAL_WEIGHTS[signal];

  if (!weights) {
    console.warn(`[LPF Learning] Unknown signal: ${signal}`);
    return;
  }

  // Update author reputation
  if (weights.author && author && author !== 'Unknown') {
    const normalizedAuthor = author.trim().toLowerCase();
    learningData.authorReputation[normalizedAuthor] =
      (learningData.authorReputation[normalizedAuthor] || 0) + weights.author;

    // Clamp reputation to [-100, 100]
    learningData.authorReputation[normalizedAuthor] = Math.max(
      -100,
      Math.min(100, learningData.authorReputation[normalizedAuthor])
    );

    console.log(
      `[LPF Learning] Author "${author}" reputation: ${learningData.authorReputation[normalizedAuthor]}`
    );
  }

  // Extract and store keywords
  if (content) {
    const keywords = extractKeywords(content);

    if (weights.analyzeForKeep && keywords.length > 0) {
      // Add to keep keywords, remove from filter if present
      for (const kw of keywords.slice(0, 5)) {
        // Top 5 keywords
        if (!learningData.learnedKeywords.keep.includes(kw)) {
          learningData.learnedKeywords.keep.push(kw);
        }
        const filterIdx = learningData.learnedKeywords.filter.indexOf(kw);
        if (filterIdx !== -1) {
          learningData.learnedKeywords.filter.splice(filterIdx, 1);
        }
      }
      // Limit keep keywords to 200
      learningData.learnedKeywords.keep = learningData.learnedKeywords.keep.slice(-200);
    }

    if (weights.analyzeForFilter && keywords.length > 0) {
      // Add to filter keywords, remove from keep if present
      for (const kw of keywords.slice(0, 5)) {
        if (!learningData.learnedKeywords.filter.includes(kw)) {
          learningData.learnedKeywords.filter.push(kw);
        }
        const keepIdx = learningData.learnedKeywords.keep.indexOf(kw);
        if (keepIdx !== -1) {
          learningData.learnedKeywords.keep.splice(keepIdx, 1);
        }
      }
      // Limit filter keywords to 200
      learningData.learnedKeywords.filter = learningData.learnedKeywords.filter.slice(-200);
    }
  }

  // Update pattern statistics
  if (matchedPatterns && matchedPatterns.length > 0) {
    const isHit = signal === 'filterApproved';
    const isMiss = signal === 'filterRejected';

    if (isHit || isMiss) {
      for (const pattern of matchedPatterns) {
        if (!learningData.patternStats[pattern]) {
          learningData.patternStats[pattern] = { hits: 0, misses: 0 };
        }
        if (isHit) {
          learningData.patternStats[pattern].hits++;
        } else {
          learningData.patternStats[pattern].misses++;
        }
      }
    }
  }

  await setStorage({ learningData });
}

/**
 * Get learning adjustments for classification.
 * Returns { authorAdjustment, keywordAdjustment, patternWeights }
 */
export function getLearningAdjustments(author, content, matchedPatterns, learningData) {
  const adjustments = {
    authorAdjustment: 0,
    keywordAdjustment: 0,
    patternWeights: {},
    dominated: null, // 'keep' or 'filter' if signal is very strong
  };

  if (!learningData) return adjustments;

  // Author reputation adjustment
  if (author && author !== 'Unknown') {
    const normalizedAuthor = author.trim().toLowerCase();
    const reputation = learningData.authorReputation?.[normalizedAuthor] || 0;

    if (reputation <= -10) {
      // Strong negative: boost filter confidence
      adjustments.authorAdjustment = 0.2;
    } else if (reputation <= -5) {
      adjustments.authorAdjustment = 0.1;
    } else if (reputation >= 10) {
      // Strong positive: reduce filter confidence
      adjustments.authorAdjustment = -0.3;
      if (reputation >= 20) {
        adjustments.dominated = 'keep';
      }
    } else if (reputation >= 5) {
      adjustments.authorAdjustment = -0.15;
    }
  }

  // Keyword adjustments
  if (content && learningData.learnedKeywords) {
    const contentLower = content.toLowerCase();
    let keepMatches = 0;
    let filterMatches = 0;

    for (const kw of learningData.learnedKeywords.keep || []) {
      if (contentLower.includes(kw)) keepMatches++;
    }
    for (const kw of learningData.learnedKeywords.filter || []) {
      if (contentLower.includes(kw)) filterMatches++;
    }

    // Net adjustment based on keyword matches
    if (keepMatches > filterMatches) {
      adjustments.keywordAdjustment = -0.1 * Math.min(keepMatches - filterMatches, 3);
    } else if (filterMatches > keepMatches) {
      adjustments.keywordAdjustment = 0.1 * Math.min(filterMatches - keepMatches, 3);
    }
  }

  // Pattern weight adjustments
  if (matchedPatterns && learningData.patternStats) {
    for (const pattern of matchedPatterns) {
      const stats = learningData.patternStats[pattern];
      if (stats) {
        const total = stats.hits + stats.misses;
        if (total >= 3) {
          // Need at least 3 data points
          const accuracy = stats.hits / total;
          // Scale from 0.5 (50% accuracy = no adjustment) to 1.5 (100%) or 0.3 (0%)
          adjustments.patternWeights[pattern] = 0.5 + accuracy;
        }
      }
    }
  }

  return adjustments;
}

/**
 * Apply learning adjustments to a classification result.
 */
export function applyLearningToClassification(result, author, content, learningData) {
  if (!result || !result.filter) return result;

  const adjustments = getLearningAdjustments(
    author,
    content,
    result.matchedPatterns || [],
    learningData
  );

  // If author has strong positive reputation, don't filter
  if (adjustments.dominated === 'keep') {
    return {
      ...result,
      filter: false,
      reason: 'Author has strong positive reputation',
      learningApplied: true,
    };
  }

  // Adjust confidence
  let adjustedConfidence = result.confidence;

  // Apply author adjustment
  adjustedConfidence += adjustments.authorAdjustment;

  // Apply keyword adjustment
  adjustedConfidence += adjustments.keywordAdjustment;

  // Apply pattern weight adjustments (average if multiple patterns)
  const patternWeightValues = Object.values(adjustments.patternWeights);
  if (patternWeightValues.length > 0) {
    const avgWeight = patternWeightValues.reduce((a, b) => a + b, 0) / patternWeightValues.length;
    adjustedConfidence *= avgWeight;
  }

  // Clamp confidence to [0, 1]
  adjustedConfidence = Math.max(0, Math.min(1, adjustedConfidence));

  // If confidence drops below threshold, don't filter
  if (adjustedConfidence < 0.4) {
    return {
      ...result,
      filter: false,
      confidence: adjustedConfidence,
      reason: 'Confidence reduced by learning',
      learningApplied: true,
    };
  }

  return {
    ...result,
    confidence: adjustedConfidence,
    learningApplied: true,
  };
}
