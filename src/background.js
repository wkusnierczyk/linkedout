// LinkedIn Post Filter — Background Service Worker
// Handles: AI classification, feedback storage, preference learning

// ─── Default Settings ────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  enabled: true,
  autoClassify: true,
  sensitivity: 'medium', // low | medium | high
  categories: {
    ai_generated:      { enabled: true,  label: 'AI-Generated',      description: 'Posts that read as AI-written: formulaic structure, buzzword-heavy, generic advice' },
    thought_leadership: { enabled: true,  label: 'Thought Leadership', description: 'Schematic "thought leadership": motivational platitudes, humble brags dressed as insights, LinkedIn-speak' },
    engagement_bait:   { enabled: true,  label: 'Engagement Bait',    description: 'Polls with obvious answers, "Agree?", ragebait, manufactured controversy for clicks' },
    self_promotion:    { enabled: false, label: 'Self-Promotion',     description: 'Thinly-veiled product plugs, "excited to announce" humble brags, constant self-congratulation' },
    politics:          { enabled: false, label: 'Politics',           description: 'Political commentary, partisan takes, government policy debates' },
    rage_bait:         { enabled: true,  label: 'Rage Bait',          description: 'Intentionally provocative or outrage-inducing hot takes' },
    corporate_fluff:   { enabled: false, label: 'Corporate Fluff',    description: 'Empty corporate announcements, "thrilled to share" press releases' },
  },
  customCategories: [],
  customKeywords: [],
};

const MAX_HISTORY = 500;
const PROFILE_REGEN_THRESHOLD = 25; // regenerate profile every N new feedback items

// ─── Helpers ─────────────────────────────────────────────────────────

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(data) {
  return chrome.storage.local.set(data);
}

async function getSettings() {
  const { settings } = await getStorage('settings');
  return settings || { ...DEFAULT_SETTINGS };
}

async function getApiKey() {
  const { apiKey } = await getStorage('apiKey');
  return apiKey || null;
}

// Sanitize text to remove orphaned Unicode surrogates that break JSON.stringify
function sanitizeText(text) {
  if (!text) return '';
  // Remove orphaned high surrogates (not followed by low surrogate)
  // and orphaned low surrogates (not preceded by high surrogate)
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD')
             .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

// ─── AI Classification ───────────────────────────────────────────────

function buildClassificationPrompt(posts, settings, preferenceProfile, recentFeedback) {
  const enabledCategories = Object.entries(settings.categories)
    .filter(([, v]) => v.enabled)
    .map(([id, v]) => `- **${id}**: ${v.description}`)
    .join('\n');

  const customCats = (settings.customCategories || [])
    .filter(c => c.enabled)
    .map(c => `- **${c.id}**: ${c.description}`)
    .join('\n');

  const keywords = (settings.customKeywords || []).length > 0
    ? `\n## Keyword Triggers\nAlso filter posts containing these keywords/phrases: ${settings.customKeywords.join(', ')}`
    : '';

  const feedbackSection = recentFeedback.length > 0
    ? `\n## Recent Feedback Examples\nHere are recent posts the user gave feedback on:\n${recentFeedback.map(f =>
        `- [${f.feedback === 'approved' ? 'CORRECTLY FILTERED' : 'WRONGLY FILTERED'}] Category: ${f.category || 'none'} | "${sanitizeText(f.contentPreview)}"`
      ).join('\n')}`
    : '';

  const profileSection = preferenceProfile
    ? `\n## Learned User Preferences\n${preferenceProfile}`
    : '';

  const postsBlock = posts.map((p, i) => (
    `### Post ${i} (id: ${p.id})\nAuthor: ${sanitizeText(p.author)}\n---\n${sanitizeText(p.content)}\n---`
  )).join('\n\n');

  return `You are a LinkedIn post classifier. Analyze each post and determine whether it should be filtered from the user's feed.

## Active Filter Categories
${enabledCategories}
${customCats}
${keywords}

## Sensitivity: ${settings.sensitivity}
- low: Only filter posts that very clearly and obviously match a category (high confidence required)
- medium: Filter posts that likely match a category
- high: Aggressively filter anything that plausibly matches

${profileSection}
${feedbackSection}

## Posts to Classify

${postsBlock}

Respond ONLY with a JSON array (no markdown fences, no preamble):
[
  {
    "id": "the_post_id",
    "filter": true_or_false,
    "category": "category_id_or_null",
    "confidence": 0.0_to_1.0,
    "reason": "One sentence explanation"
  }
]`;
}

async function classifyPosts(posts) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'No API key configured. Open extension options to set it.' };
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    return { results: posts.map(p => ({ id: p.id, filter: false })) };
  }

  // Gather learned context
  const { preferenceProfile, feedbackHistory } = await getStorage(['preferenceProfile', 'feedbackHistory']);
  const recent = (feedbackHistory || []).slice(-20).map(f => ({
    feedback: f.feedback,
    category: f.category,
    contentPreview: (f.content || '').slice(0, 120),
  }));

  const prompt = buildClassificationPrompt(posts, settings, preferenceProfile, recent);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.model || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('API error:', response.status, errBody);
      return { error: `API error ${response.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse JSON — strip any accidental markdown fences
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const results = JSON.parse(clean);

    // Store classification results
    await storeClassifications(posts, results);

    return { results };
  } catch (err) {
    console.error('Classification failed:', err);
    return { error: `Classification failed: ${err.message}` };
  }
}

async function storeClassifications(posts, results) {
  const { classificationCache = {} } = await getStorage('classificationCache');
  const now = Date.now();
  for (const r of results) {
    classificationCache[r.id] = { ...r, timestamp: now };
  }
  // Prune old entries (keep last 1000)
  const entries = Object.entries(classificationCache);
  if (entries.length > 1000) {
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const pruned = Object.fromEntries(entries.slice(-1000));
    await setStorage({ classificationCache: pruned });
  } else {
    await setStorage({ classificationCache });
  }
}

// ─── Feedback & Interaction Recording ────────────────────────────────

async function recordFeedback(postId, content, author, category, feedback) {
  const { feedbackHistory = [], feedbackCountSinceRegen = 0 } = await getStorage([
    'feedbackHistory', 'feedbackCountSinceRegen'
  ]);

  feedbackHistory.push({
    postId, content: (content || '').slice(0, 500), author,
    category, feedback, // 'approved' | 'rejected'
    timestamp: Date.now(),
  });

  // Trim history
  const trimmed = feedbackHistory.slice(-MAX_HISTORY);
  const newCount = (feedbackCountSinceRegen || 0) + 1;

  await setStorage({
    feedbackHistory: trimmed,
    feedbackCountSinceRegen: newCount,
  });

  // Update stats
  await updateStats(feedback === 'approved' ? 'approved' : 'rejected');

  // Auto-regenerate preference profile if threshold reached
  if (newCount >= PROFILE_REGEN_THRESHOLD) {
    regeneratePreferenceProfile(); // fire and forget
  }
}

async function recordInteraction(postId, content, author, interaction) {
  const { interactionHistory = [] } = await getStorage('interactionHistory');

  interactionHistory.push({
    postId, content: (content || '').slice(0, 500), author,
    interaction, // 'liked' | 'commented' | 'hidden' | 'unfollowed' | 'shared'
    timestamp: Date.now(),
  });

  await setStorage({
    interactionHistory: interactionHistory.slice(-MAX_HISTORY),
  });

  // Positive interactions count as implicit "don't filter this" feedback
  if (interaction === 'liked' || interaction === 'commented' || interaction === 'shared') {
    await updateStats('implicitKeep');
  } else if (interaction === 'hidden' || interaction === 'unfollowed') {
    await updateStats('implicitFilter');
  }
}

async function updateStats(type) {
  const { stats = { filtered: 0, approved: 0, rejected: 0, implicitKeep: 0, implicitFilter: 0 } } =
    await getStorage('stats');
  if (type === 'filtered') stats.filtered++;
  else if (type === 'approved') stats.approved++;
  else if (type === 'rejected') stats.rejected++;
  else if (type === 'implicitKeep') stats.implicitKeep++;
  else if (type === 'implicitFilter') stats.implicitFilter++;
  await setStorage({ stats });
}

// ─── Preference Profile Learning ─────────────────────────────────────

async function regeneratePreferenceProfile() {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  const { feedbackHistory = [], interactionHistory = [] } = await getStorage([
    'feedbackHistory', 'interactionHistory'
  ]);

  if (feedbackHistory.length + interactionHistory.length < 5) return; // not enough data

  const feedbackSummary = feedbackHistory.slice(-100).map(f =>
    `[${f.feedback}] category=${f.category || 'none'} | "${sanitizeText((f.content || '').slice(0, 150))}"`
  ).join('\n');

  const interactionSummary = interactionHistory.slice(-100).map(i =>
    `[${i.interaction}] "${sanitizeText((i.content || '').slice(0, 150))}"`
  ).join('\n');

  const prompt = `Analyze this LinkedIn user's feedback and interaction history to create a concise preference profile for post filtering.

## Feedback on Filtered Posts (approved = correctly filtered, rejected = incorrectly filtered)
${feedbackSummary || 'None yet'}

## Observed Interactions (liked/commented = engaged positively, hidden/unfollowed = disliked)
${interactionSummary || 'None yet'}

Create a concise preference profile (max 300 words) that captures:
1. What types of content the user clearly dislikes or wants filtered
2. What types of content the user enjoys and should NOT be filtered
3. Any patterns or nuances in their preferences
4. Edge cases or subtleties to watch for

Write this as direct instructions for a future classifier, e.g. "This user dislikes X but tolerates Y when Z."
Respond ONLY with the profile text, no preamble.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return;

    const data = await response.json();
    const profile = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    await setStorage({
      preferenceProfile: profile,
      feedbackCountSinceRegen: 0,
      profileLastUpdated: Date.now(),
    });

    console.log('Preference profile regenerated.');
  } catch (err) {
    console.error('Profile regeneration failed:', err);
  }
}

// ─── Message Handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (!handler) {
    sendResponse({ error: `Unknown message type: ${message.type}` });
    return false;
  }
  // All handlers are async, so we return true and call sendResponse later
  handler(message, sender).then(sendResponse).catch(err => {
    console.error(`Handler error [${message.type}]:`, err);
    sendResponse({ error: err.message });
  });
  return true; // keep the message channel open for async response
});

const messageHandlers = {
  async classifyPosts({ posts }) {
    return classifyPosts(posts);
  },

  async recordFeedback({ postId, content, author, category, feedback }) {
    await recordFeedback(postId, content, author, category, feedback);
    return { ok: true };
  },

  async recordInteraction({ postId, content, author, interaction }) {
    await recordInteraction(postId, content, author, interaction);
    return { ok: true };
  },

  async getSettings() {
    return getSettings();
  },

  async saveSettings({ settings }) {
    await setStorage({ settings });
    return { ok: true };
  },

  async getStats() {
    const { stats = { filtered: 0, approved: 0, rejected: 0, implicitKeep: 0, implicitFilter: 0 } } =
      await getStorage('stats');
    return stats;
  },

  async getPreferenceProfile() {
    const { preferenceProfile, profileLastUpdated } = await getStorage([
      'preferenceProfile', 'profileLastUpdated'
    ]);
    return { profile: preferenceProfile || null, lastUpdated: profileLastUpdated || null };
  },

  async regenerateProfile() {
    await regeneratePreferenceProfile();
    const { preferenceProfile, profileLastUpdated } = await getStorage([
      'preferenceProfile', 'profileLastUpdated'
    ]);
    return { profile: preferenceProfile, lastUpdated: profileLastUpdated };
  },

  async getHistory() {
    const { feedbackHistory = [], interactionHistory = [] } = await getStorage([
      'feedbackHistory', 'interactionHistory'
    ]);
    return { feedbackHistory, interactionHistory };
  },

  async clearHistory() {
    await setStorage({
      feedbackHistory: [],
      interactionHistory: [],
      preferenceProfile: null,
      profileLastUpdated: null,
      feedbackCountSinceRegen: 0,
      classificationCache: {},
      stats: { filtered: 0, approved: 0, rejected: 0, implicitKeep: 0, implicitFilter: 0 },
    });
    return { ok: true };
  },

  async exportData() {
    const data = await getStorage([
      'settings', 'feedbackHistory', 'interactionHistory',
      'preferenceProfile', 'stats'
    ]);
    return data;
  },

  async checkApiKey() {
    const key = await getApiKey();
    return { configured: !!key };
  },
};

// ─── Install / Update ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await setStorage({ settings: { ...DEFAULT_SETTINGS } });
    console.log('LinkedIn Post Filter installed with default settings.');
  }
});
