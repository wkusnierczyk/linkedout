<table>
  <tr>
    <td>
      <img src="graphics/out-logo.png" alt="logo" width="200" />
    </td>
    <td>
      <p><strong>LinkedOut</strong>: Adaptive LinkedIn Post Filter</p>
      An AI-powered Chrome extension that filters your LinkedIn feed using Claude to classify posts, learns from your feedback, and adapts to your preferences over time.
    </td>
  </tr>
</table>

## Status

[**Beta**] Ready for beta testing.
Core features complete. Local pattern matching works without any external dependencies.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Classification Modes](#classification-modes)
- [How Learning Works](#how-learning-works)
- [Architecture](#architecture)
- [Usage](#usage)
- [Cost Estimate](#cost-estimate)
- [Privacy](#privacy)
- [Legal Considerations](#legal-considerations)
- [Development](#development)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)

## Features

| Feature | Description |
| --- | --- |
| Local Classification | Privacy-first filtering using regex patterns — no data leaves your browser |
| LLM Classification | Optional AI-powered filtering using Claude for more nuanced detection |
| Review Panel | See all filtered posts in a slide-out panel, approve or reject each decision |
| Fold Mode | Collapse all posts to quickly navigate to filtered content |
| Reversible Feedback | Color-coded badges (orange/red/green) with undo support |
| Interaction Tracking | Automatically observes your likes, comments, hides, and unfollows as implicit preference signals |
| Adaptive Learning | Learns from your feedback — author reputation, keywords, pattern accuracy |
| Self-Healing | Automatically adapts when LinkedIn changes their DOM structure |
| Customizable | Add your own filter categories, keyword triggers, and adjust sensitivity |

## Known Issues

See [Known Limitations](#known-limitations) and [Roadmap](#roadmap) for the full list of issues and planned features.

## Quick Start

1. **Install**: Load the extension in Chrome Developer mode (see [Installing the Prototype](#installing-the-prototype))
2. **Browse**: Go to [LinkedIn](https://www.linkedin.com/feed) — posts are scanned automatically using local pattern matching
3. **Review**: Click the floating ⊘ button to see filtered posts and provide feedback
4. **Optional**: For more accurate classification, enable LLM mode in Settings and add your [Anthropic API key](https://console.anthropic.com/settings/keys)

## Classification Modes

LinkedOut offers two classification modes, selectable in Settings:

| Mode | Privacy | Accuracy | Cost | Learning |
|------|---------|----------|------|----------|
| **Local** (default) | All processing in browser | Good for common patterns | Free | Learns from feedback |
| **LLM** | Post content sent to Anthropic API | Better nuance detection | ~$0.30/month | Learns from feedback + builds preference profile |

### Local Mode (Default)

Local mode uses regex pattern matching to classify posts entirely within your browser. **No data leaves your device.**

**How it works:**

1. **Pattern Matching**: Each post is checked against regex patterns for 7 categories:
   - AI-Generated: Formulaic phrases like "in today's fast-paced world", buzzwords like "synergy", "leverage"
   - Thought Leadership: "unpopular opinion", "X lessons I learned", "grateful to announce"
   - Engagement Bait: "Agree?", "thoughts?", "tag someone who..."
   - Self-Promotion: "check out my", "link in bio", "we're hiring"
   - Politics: Political figures, partisan language, policy debates
   - Rage Bait: Generational attacks, "wake up sheeple", intentionally divisive content
   - Corporate Fluff: "excited to announce", "strategic partnership", award spam

2. **Sensitivity Levels**: Control how aggressive filtering is:
   | Level | Threshold | Confidence |
   |-------|-----------|------------|
   | Low | 2+ pattern matches required | Base 0.40 + 0.15 per match |
   | Medium | 1+ pattern matches required | Base 0.50 + 0.15 per match |
   | High | 1+ pattern matches required | Base 0.60 + 0.20 per match |

3. **Learning Adjustments**: Confidence is adjusted based on learned data (see [How Learning Works](#how-learning-works))

**Limitations:**
- Pattern-based detection may miss nuanced content
- Some patterns have known limitations (emoji patterns, quoted text)
- Cannot detect novel categories not covered by patterns

### LLM Mode

LLM mode sends post content to the Anthropic API for classification using Claude. **Requires API key.**

**How it works:**

1. **Prompt Construction**: Each batch of posts is sent with:
   - All category definitions (built-in and custom)
   - Current sensitivity level
   - Recent feedback examples (last 20)
   - Learned preference profile (if available)
   - Custom keyword triggers

2. **Claude Analysis**: Claude analyzes each post and returns:
   - Whether to filter (true/false)
   - Category classification
   - Confidence score (0.0–1.0)
   - Explanation of reasoning

3. **Learning**: Feedback updates the preference profile (see [How Learning Works](#how-learning-works))

**Advantages:**
- Better at detecting nuanced content
- Understands context and intent
- Can identify novel problematic patterns
- Adapts via natural language preference profile

**Considerations:**
- Requires Anthropic API key
- Post content (up to 1500 chars) sent to external API
- Costs ~$0.30/month for typical use
- See [Legal Considerations](#legal-considerations)

## How Learning Works

Both modes learn from your feedback to improve over time. The learning mechanisms differ by mode.

### Feedback Signals

LinkedOut captures these signals from your behavior:

| Signal | Source | Meaning |
|--------|--------|---------|
| **Approve filter (Hit)** | Click ◎ on filtered post | Correct filter — I want this hidden |
| **Reject filter (Miss)** | Click ○ on filtered post | Wrong filter — I want to see this |
| **Like** | Click reaction on any post | I enjoy this content |
| **Comment** | Comment on any post | I'm engaged with this content |
| **Share/Repost** | Share any post | I endorse this content |
| **Hide posts by user** | Use LinkedIn's hide option | I don't want content from this author |
| **Unfollow** | Unfollow a user | Strong signal against this author |

### Local Mode Learning

Local mode maintains three learning data structures in browser storage:

#### 1. Author Reputation

Tracks a score per author based on your interactions:

| Signal | Impact |
|--------|--------|
| Reject filter (false positive) | +2 |
| Like / Comment / Share | +3 |
| Approve filter (true positive) | -1 |
| Not interested | -2 |
| Hide posts by user | -10 |
| Unfollow | -10 |

**Effect on classification:**

| Reputation | Adjustment |
|------------|------------|
| < -5 | Boost filter confidence +10% |
| < -10 | Boost filter confidence +20% |
| > +5 | Reduce filter confidence -15% |
| > +10 | Reduce filter confidence -30% |
| > +20 | **Skip filtering entirely** (trusted author) |

#### 2. Learned Keywords

Keywords are extracted from posts when you give feedback:

| Feedback | Action |
|----------|--------|
| Reject filter / Like / Comment | Extract keywords → add to **keep** list |
| Approve filter / Not interested | Extract keywords → add to **filter** list |

**Effect on classification:**
- Keep keywords in content → reduce confidence (-10% per keyword, max -30%)
- Filter keywords in content → boost confidence (+10% per keyword, max +30%)

#### 3. Pattern Statistics

Tracks hit/miss rate for each regex pattern:

| Pattern | Hits | Misses | Accuracy |
|---------|------|--------|----------|
| `in today's fast-paced` | 15 | 3 | 83% |
| `excited to announce` | 8 | 7 | 53% |

**Effect on classification:**
- Patterns with <50% accuracy have reduced weight
- Weight scales from 0.5 (0% accuracy) to 1.5 (100% accuracy)

#### Storage Location

Learning data is stored in `chrome.storage.local` under the key `learningData`:

```javascript
{
  authorReputation: { "john smith": 5, "jane doe": -12 },
  learnedKeywords: {
    keep: ["kubernetes", "rust", "engineering"],
    filter: ["hustle", "grind", "motivated"]
  },
  patternStats: {
    "in today's fast-paced": { hits: 15, misses: 3 },
    "excited to announce": { hits: 8, misses: 7 }
  }
}
```

**Note:** This data is not currently viewable or editable through the UI. You can export all extension data from Settings → Export Data, which includes learning data as JSON.

### LLM Mode Learning

LLM mode uses two learning mechanisms:

#### 1. Feedback Examples

The last 20 feedback items are included in each classification prompt:

```
## Recent Feedback Examples
- [CORRECTLY FILTERED] Category: thought_leadership | "I'm humbled to announce..."
- [WRONGLY FILTERED] Category: engagement_bait | "What programming language should I learn?"
```

This gives Claude immediate context about your preferences.

#### 2. Preference Profile

After every 25 feedback items, Claude generates a natural language summary of your preferences:

```
This user dislikes:
- Generic motivational content and humble brags
- Posts that start with rhetorical questions designed to drive engagement
- Corporate announcements with excessive enthusiasm

This user tolerates:
- Technical discussions even if they use some jargon
- Job postings when they're informative rather than promotional
- Questions that seem genuine rather than engagement-seeking

Nuances:
- The user seems fine with self-promotion if it's genuinely informative
- Political content is okay if it's policy-focused rather than partisan
```

This profile is:
- **Viewable** in Settings → Learned Preference Profile
- **Regenerable** manually via the "Regenerate Now" button
- **Included** in every subsequent classification prompt

**Note:** The preference profile is human-readable but not directly editable. To influence it, provide more feedback — the profile regenerates every 25 feedback items.

### Manual Configuration

While learned data isn't directly editable, you can guide filtering through Settings:

| Setting | Effect |
|---------|--------|
| **Custom Keywords** | Posts containing these words are always flagged |
| **Custom Categories** | Define new category types with descriptions |
| **Category Toggles** | Enable/disable built-in categories |
| **Sensitivity** | Control filtering aggressiveness |

**Future improvements** (not yet implemented):
- Author allowlist/blocklist UI
- Learned keywords viewer/editor
- Import/export of learning data separately from full export

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ LinkedIn Page (content.js)                              │
│                                                         │
│  ┌──────────┐  extract  ┌-──────────┐  display          │
│  │ Feed DOM │──────────▶│ Post Data │──────────▶ UI     │
│  └──────────┘           └─────┬─────┘                   │
│       ▲ observe               │ classify                │
│       │ interactions          ▼                         │
│  ┌──────────┐         ┌──────────────┐                  │
│  │ Like/    │         │ Background   │                  │
│  │ Comment/ │────────▶│ Service      │◀── Settings      │
│  │ Hide     │ record  │ Worker       │                  │
│  └──────────┘         └──────┬───────┘                  │
│                              │ API call                 │
└──────────────────────────────┼──────────────────────────┘
                               ▼
                    ┌──────────────────┐
                    │  Claude API      │
                    │  (classification │
                    │   & learning)    │
                    └──────────────────┘
```

### File Structure

```
linkedout/
├── manifest.json              # Extension manifest (MV3)
├── src/
│   ├── background.js          # Service worker: API calls, storage, learning
│   ├── content.js             # Content script: DOM interaction, UI injection
│   ├── content.css            # Injected styles for filter overlay & panel
│   ├── patterns.js            # Local pattern matching for classification
│   ├── learning.js            # Feedback learning (author reputation, keywords)
│   ├── dom-healing.js         # Self-healing DOM detection
│   ├── popup/
│   │   ├── popup.html         # Toolbar popup: quick controls & stats
│   │   ├── popup.js
│   │   └── popup.css
│   └── options/
│       ├── options.html       # Full settings page
│       ├── options.js
│       └── options.css
├── tests/                     # Unit tests (Vitest)
└── README.md
```

### Data Flow

| Step | Stage | Description |
| --- | --- | --- |
| 1 | Extraction | Content script uses MutationObserver to detect posts as they load in the feed. Structural detection and aria-labels identify posts without relying on obfuscated class names. |
| 2 | Batching | New posts are collected and sent for classification after a 3-second debounce (configurable). This minimizes API calls. |
| 3 | Classification | Background worker builds a prompt including: enabled filter categories, sensitivity level, learned preference profile, and recent feedback examples. Posts are sent in batches. |
| 4 | Feedback Loop | User approvals/rejections are stored. After every 25 feedback items, the preference profile is regenerated by asking Claude to summarize patterns. This profile is then included in future classification prompts. |
| 5 | Implicit Learning | Observed interactions (likes = "I enjoy this", hides = "I don't want this") supplement explicit feedback when regenerating the preference profile. |

## Usage

### Installing the Prototype

This is a development build, not published to the Chrome Web Store.

1. Clone or download this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked** → select the repository folder
5. The ⊘ icon appears in your toolbar

To update after pulling changes: go to `chrome://extensions` and click the refresh icon on the LinkedOut card, then refresh any open LinkedIn tabs.

### Enabling/Disabling

**Quick toggle** (toolbar popup):
1. Click the ⊘ extension icon in your toolbar
2. Toggle the **Enabled** switch at the top

When disabled, all filter badges are removed and no scanning occurs. Your feedback history and settings are preserved.

### Configuring Categories

**From the popup** (quick access):
1. Click the ⊘ extension icon
2. Check/uncheck categories to enable/disable them
3. Changes apply immediately to new scans

**From Settings** (full control):
1. Click the ⊘ icon → **⚙ Settings**, or right-click the icon → **Options**
2. Scroll to **Filter Categories** to toggle built-in categories
3. Scroll to **Custom Categories** to add your own:
   - **ID**: Internal identifier (lowercase, underscores)
   - **Label**: Display name shown in badges
   - **Description**: Explains to Claude what this category means

### Filter Badges (On Posts)

When a post is filtered, a badge appears at the top of the post:

```
┌─────────────────────────────────────────────────────────────┐
│ ⊘  [CATEGORY]  Reason for filtering...        👁  ◎  ○    │
├─────────────────────────────────────────────────────────────┤
│                    (post content hidden)                    │
└─────────────────────────────────────────────────────────────┘
```

| Element | Description |
|---------|-------------|
| **⊘** | Filter icon |
| **[CATEGORY]** | The matched category (e.g., "Thought Leadership") |
| **Reason** | Claude's explanation for why this post was filtered |
| **👁 Preview** | Toggle post visibility — peek at the content without approving |
| **◎ Hit** | Good filter — keep it hidden and train the model that this was correct |
| **○ Miss** | Wrong filter — restore the post and train the model that this was a mistake |

#### Badge Colors

Badges are color-coded to indicate review status:

| Color | State | Meaning |
|-------|-------|---------|
| **Orange** | Pending | Filtered but not yet reviewed — waiting for your decision |
| **Red** | Confirmed | You approved the filter — post stays hidden |
| **Green** | Rejected | You rejected the filter — post is restored |

Decisions are reversible: confirmed badges show an undo (○) button, rejected badges show a re-filter (◎) button. Each action is recorded for learning, including reversals.

### Review Panel

Click the floating **⊘** button (bottom-right of LinkedIn) to open the review panel.

```
┌──────────────────────────────────────┐
│  LinkedOut              [Rescan] [✕] │
├──────────────────────────────────────┤
│  12 scanned   3 filtered             │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │ Author Name      [CATEGORY]   │  │
│  │ Post preview text here...     │  │
│  │ Reason • 87%                  │  │
│  │ [◎ Hit]  [○ Miss]             │  │
│  └────────────────────────────────┘  │
│  ...                                 │
└──────────────────────────────────────┘
```

**Header actions:**
| Button | Description |
|--------|-------------|
| **Rescan** | Clear all classifications and re-scan visible posts |
| **✕** | Close the panel |

**Stats bar:**
- **X scanned**: Total posts analyzed in this session
- **Y filtered**: Posts currently filtered (pending + confirmed)
- **Scanning...**: Appears when classification is in progress

**Card actions:**
| Button | Description |
|--------|-------------|
| **◎ Hit** | Good filter — confirm and hide the post (trains the model) |
| **○ Miss** | Wrong filter — reject and restore the post |
| **○ Undo** | (On confirmed cards) Reverse decision — restore the post |
| **◎ Undo** | (On rejected cards) Reverse decision — re-filter the post |

After confirming or rejecting, the card shows a status label (Confirmed/Rejected) with an undo button. Cards are color-coded to match badges: pending cards are neutral, confirmed cards have a red tint, rejected cards have a green tint.

### Filter Categories

Built-in categories (all enabled by default):

| Category | Description |
|----------|-------------|
| AI-Generated | Formulaic, buzzword-heavy posts that read as AI-written |
| Thought Leadership | Motivational platitudes, humble brags, LinkedIn-speak |
| Engagement Bait | "Agree?", polls with obvious answers, manufactured controversy |
| Self-Promotion | Thinly-veiled product plugs, constant self-congratulation |
| Politics | Political commentary and policy debates |
| Rage Bait | Intentionally provocative or outrage-inducing content |
| Corporate Fluff | Empty corporate announcements, press releases |

### Sensitivity Levels

| Level | Behavior |
|-------|----------|
| Low | Only filters posts that very clearly match (fewer false positives, more noise gets through) |
| Medium | Balanced (recommended) |
| High | Aggressively filters anything that plausibly matches (cleaner feed, more false positives) |

### Settings Page

Access via toolbar popup → **⚙ Settings** or right-click extension → **Options**.

| Section | Options |
|---------|---------|
| **API Key** | Enter your Anthropic API key |
| **Model** | Choose Claude model (Sonnet 4 for quality, Haiku 4.5 for cost) |
| **Sensitivity** | Low / Medium / High filtering threshold |
| **Filter Categories** | Toggle built-in categories on/off |
| **Custom Categories** | Add your own filter categories |
| **Custom Keywords** | Add trigger words that always flag posts |
| **Preference Profile** | View/regenerate your learned preference summary |
| **Data** | Export all data as JSON, or clear history |

## Cost Estimate

Each classification batch uses one Claude API call. Typical usage:

| Scenario | Posts/day | API calls | Est. cost/month |
|---|---|---|---|
| Light browsing | ~30 | ~6 | ~$0.10 |
| Regular use | ~100 | ~20 | ~$0.30 |
| Heavy scrolling | ~300 | ~60 | ~$1.00 |

Using Haiku instead of Sonnet reduces costs by ~5×.

## Privacy

- Your API key is stored locally in Chrome's extension storage
- Post content is sent to the Anthropic API for classification (text only, limited to 1500 chars)
- No data is sent anywhere else
- All feedback and interaction history is stored locally
- You can export or delete all data from Settings

## Legal Considerations

### What LinkedOut Is

LinkedOut is **source code**, not a service. It does not:
- Provide any service to users
- Access LinkedIn on your behalf
- Store, transmit, or process your data on any server
- **Export any feed data** — unless you explicitly enable LLM classification by configuring your own API key

The code is offered under the MIT license. **You** decide whether and how to use it. Any actions taken using this code are your responsibility.

### LinkedIn's Service Guarantees

LinkedIn's [User Agreement](https://www.linkedin.com/legal/user-agreement) provides services "AS IS" with no quality guarantees:

> "LINKEDIN AND ITS AFFILIATES MAKE NO REPRESENTATION OR WARRANTY ABOUT THE SERVICES"

They explicitly disclaim "FITNESS FOR A PARTICULAR PURPOSE" — meaning they make no promise that content will be professional, relevant, or high-quality.

### How the Code Works

| Activity | How It Works | Notes |
|----------|--------------|-------|
| Scraping | Does not scrape — reads DOM you already have access to | No automated data collection |
| Bots/automation | No bots — user-initiated, client-side filtering | You control when it runs |
| Display modification | Client-side only, your browser, your view | Like any browser extension |
| External API | Post content sent to Anthropic for classification | Requires your API key and explicit setup |

### Your Responsibilities

By enabling the AI classification feature (providing your own API key), **you** — not LinkedOut:
- Choose to send post content to a third-party API
- Accept full responsibility for compliance with LinkedIn's Terms of Service
- May be liable for any violation of LinkedIn's policies regarding data export
- Acknowledge that this may have consequences for your LinkedIn account

Without an API key configured, LinkedOut does not transmit any data externally.

### Your Rights

- You have [data portability rights](https://www.linkedin.com/legal/privacy-policy) under LinkedIn's Privacy Policy
- You control what happens in your own browser
- LinkedIn does not guarantee content quality — filtering noise is a reasonable personal choice

### Disclaimer

LinkedOut is source code provided "as is" under the MIT license, without warranty of any kind. The authors:
- Do not provide any service
- Are not responsible for how you use this code
- Are not lawyers; nothing here is legal advice

Review LinkedIn's [User Agreement](https://www.linkedin.com/legal/user-agreement) and [Privacy Policy](https://www.linkedin.com/legal/privacy-policy) to understand your own obligations.

## Development

### Make Targets

The project uses a Makefile for common development tasks. Variables can be overridden (e.g., `make lint NPM=pnpm`).

| Target | Description |
|--------|-------------|
| `make install` | Install dependencies |
| `make lint` | Run ESLint on source files |
| `make lint-fix` | Run ESLint with auto-fix |
| `make format` | Format code with Prettier |
| `make format-check` | Check formatting without changes |
| `make test` | Run tests |
| `make test-watch` | Run tests in watch mode |
| `make test-coverage` | Run tests with coverage report |
| `make check` | Run all checks (format, lint, test) |
| `make clean` | Remove `node_modules/` and `coverage/` |
| `make version` | Print current version |
| `make version V=x.y.z` | Set version in package.json and manifest.json |
| `make bump-major` | Bump major version (x.0.0) |
| `make bump-minor` | Bump minor version (x.y.0) |
| `make bump-patch` | Bump patch version (x.y.z) |
| `make help` | Show all available targets |

### LinkedIn DOM Resilience

LinkedIn frequently changes their DOM structure. The extension uses structural detection rather than brittle CSS selectors:

- **Feed detection**: Finds the deepest container within `<main>` that has 4+ children resembling posts
- **Post detection**: Identifies posts by the presence of a button with `aria-label` starting with "Reaction button state:"
- **Text extraction**: Uses `span[dir="ltr"]` elements, with fallback to longest text node
- **Author extraction**: Finds the first link pointing to `/in/` or `/company/`

### Self-Healing Detection

The extension includes self-healing capabilities to adapt when LinkedIn changes their DOM structure:

**How it works:**

1. **Detection tracking**: Each attempt to find posts is recorded as success/failure
2. **Health monitoring**: After 3+ consecutive failures, detection is marked unhealthy
3. **Pattern discovery**: When unhealthy, the extension scans for alternative patterns
4. **Automatic healing**: If a new pattern is found and works, it's persisted to storage
5. **User notification**: Toast messages inform you of layout changes and healing status

**What gets healed:**

| Selector | Detection Method |
|----------|-----------------|
| Reaction button label | Looks for buttons with `aria-label` containing "React", "Like", or "reaction" |

**Privacy note**: Self-healing analyzes DOM *structure* only (tag names, attributes), never user content. No personal information is captured or transmitted.

**Manual fallback**: If self-healing fails repeatedly:

1. Check the browser console for `[LPF]` log messages
2. Inspect the feed DOM in DevTools to identify what changed
3. Report the issue at [GitHub Issues](../../issues)

### Adding New Features

- **New filter categories**: Add to `DEFAULT_SETTINGS.categories` in `background.js`
- **New interaction types**: Add detection logic in `attachInteractionObservers()` in `content.js`
- **Custom classification models**: Modify the `classifyPosts()` function in `background.js`

## Known Limitations

| Limitation | Description |
|------------|-------------|
| **Virtual scrolling** | LinkedIn destroys and recreates DOM elements as you scroll. If you scroll away from a filtered post and back, the badge may be gone. The classification is preserved but the visual state is lost until rescan. See [#27](../../issues/27). |
| **Brief flash before filtering** | Posts appear momentarily before classification completes. There's no way to intercept posts before they render. |
| **DOM structure changes** | LinkedIn frequently updates their DOM. The extension attempts to self-heal by finding alternative patterns, but some changes may require manual updates. |
| **Storage limits** | Chrome extension storage is limited to ~5MB. Feedback history is automatically trimmed to stay within bounds. |
| **Model-dependent quality** | Classification accuracy depends on the Claude model and prompt. Haiku is faster/cheaper but less accurate than Sonnet. |
| **Extension reload requires page refresh** | If the extension is reloaded or updated, existing LinkedIn tabs need to be refreshed to reconnect. |

## Roadmap

### Planned Features

| Priority | Issue | Feature |
|----------|-------|---------|
| Medium | [#5](../../issues/5) | Inline re-categorization with category selector |
| Medium | [#10](../../issues/10) | Support multiple categories per post |
| Medium | [#20](../../issues/20) | Support novel categories proposed by Claude |
| Medium | [#25](../../issues/25) | Statistics page with time-binned analytics |
| Medium | [#38](../../issues/38) | Draggable floating button |
| Low | [#3](../../issues/3) | Mobile version |

### Open Bugs

| Issue | Description |
|-------|-------------|
| [#6](../../issues/6) | Cannot expand filtered post content — "more" link doesn't work |

### Recently Completed

| Issue | Feature |
|-------|---------|
| [#4](../../issues/4) | Self-diagnosing and self-healing DOM parsing |
| [#7](../../issues/7) | Reversible feedback with color-coded banners |
| [#11](../../issues/11) | Local pattern matching (privacy-first, no LLM required) |
| [#12](../../issues/12) | Legal considerations documentation |
| [#19](../../issues/19) | Cache classifications locally |
| [#26](../../issues/26) | Unified iconography for filter actions |
| [#27](../../issues/27) | Re-apply badges on scroll (virtual scroll resilience) |
| [#28](../../issues/28) | Fold all posts mode for easier navigation |
| [#9](../../issues/9) | Category labels display properly (sentence case) |
| [#13](../../issues/13) | Extension activation reliability on SPA navigation |
| [#15](../../issues/15) | "Scanning..." status indicator in review panel |
| [#21](../../issues/21) | Categories sorted alphabetically in popup and settings |

## License

MIT
