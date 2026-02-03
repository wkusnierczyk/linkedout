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

[**WIP**] Work in progress.  
LinkedOut is currently in a prototyping phase.


## Features

| Feature | Description |
| --- | --- |
| AI Classification | Posts are analyzed by Claude and categorized (AI-generated, thought leadership, engagement bait, politics, etc.) |
| Review Panel | See all filtered posts in a slide-out panel, approve or reject each decision |
| Interaction Tracking | Automatically observes your likes, comments, hides, and unfollows as implicit preference signals |
| Adaptive Learning | Builds a preference profile from your explicit feedback and observed behavior, improving over time |
| Customizable | Add your own filter categories, keyword triggers, and adjust sensitivity |

## Planned Features

| Feature | Issue | Description |
|---------|-------|-------------|
| Self-healing DOM | [#4](../../issues/4) | Automatically detect and fix broken selectors when LinkedIn changes their DOM structure |
| Inline re-categorization | [#5](../../issues/5) | Click the category label to correct misclassifications on the fly |
| Reversible feedback | [#7](../../issues/7) | Color-coded banners (red/green) with undo support for filter decisions |

## Known Issues

| Issue | Description |
|-------|-------------|
| [#6](../../issues/6) | "More" link to expand truncated posts doesn't work on filtered posts |
| [#8](../../issues/8) | Posts with certain emoji/Unicode characters cause API errors |

## Setup

### 1. Install the Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** and select this `linkedin-post-filter` directory
4. The extension icon (⊘) should appear in your toolbar

### 2. Configure API Key

1. Click the extension icon → **⚙ Settings** (or right-click → Options)
2. Enter your [Anthropic API key](https://console.anthropic.com/settings/keys)
3. Choose a model (Sonnet 4 recommended for quality, Haiku 4.5 for cost savings)
4. Click **Save API Key**

### 3. Start Filtering

1. Navigate to [LinkedIn](https://www.linkedin.com/feed)
2. Posts will be automatically scanned as they appear
3. A floating ⊘ button in the bottom-right shows the filter count
4. Click it to open the review panel

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
linkedin-post-filter/
├── manifest.json              # Extension manifest (MV3)
├── src/
│   ├── background.js          # Service worker: API calls, storage, learning
│   ├── content.js             # Content script: DOM interaction, UI injection
│   ├── content.css            # Injected styles for filter overlay & panel
│   ├── popup/
│   │   ├── popup.html         # Toolbar popup: quick controls & stats
│   │   ├── popup.js
│   │   └── popup.css
│   └── options/
│       ├── options.html       # Full settings page
│       ├── options.js
│       └── options.css
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

### Popup Controls

| Control | Description |
| --- | --- |
| Toggle | Enable/disable the filter |
| Category checkboxes | Quick toggle for each filter category |
| Rescan Feed | Re-process all visible posts |
| Settings | Open the full options page |

### Review Panel

Click the floating ⊘ button on LinkedIn to open the review panel.

| Action | Description |
| --- | --- |
| **✓ Filter** | Confirm the post should be filtered (trains the model) |
| **✗ Keep** | Reject the filter decision and restore the post |
| **↓** | Scroll to the post in the feed |

### Filter Categories

Built-in categories:
| Category | Description |
|---|---|
| AI-Generated | Formulaic, buzzword-heavy posts that read as AI-written |
| Thought Leadership | Motivational platitudes, humble brags, LinkedIn-speak |
| Engagement Bait | "Agree?", polls with obvious answers, manufactured controversy |
| Self-Promotion | Thinly-veiled product plugs, constant self-congratulation |
| Politics | Political commentary and policy debates |
| Rage Bait | Intentionally provocative or outrage-inducing content |
| Corporate Fluff | Empty corporate announcements, press releases |

You can add custom categories with your own descriptions in Settings.

### Sensitivity Levels

| Level | Behavior |
|---|---|
| Low | Only filters posts that very clearly match (fewer false positives, more noise) |
| Medium | Balanced (recommended) |
| High | Aggressively filters anything that plausibly matches (more false positives, cleaner feed) |

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

## Development

### LinkedIn DOM Resilience

LinkedIn frequently changes their DOM structure. The extension uses structural detection rather than brittle CSS selectors:

- **Feed detection**: Finds the deepest container within `<main>` that has 4+ children resembling posts
- **Post detection**: Identifies posts by the presence of a button with `aria-label` starting with "Reaction button state:"
- **Text extraction**: Uses `span[dir="ltr"]` elements, with fallback to longest text node
- **Author extraction**: Finds the first link pointing to `/in/` or `/company/`

If classification stops working after a LinkedIn update:

1. Check the browser console for `[LPF]` log messages
2. Inspect the feed DOM in DevTools to identify what changed
3. Update the detection functions in `content.js` (`findFeedList`, `isPostElement`, `getPostText`, `getPostAuthor`)
4. Reload the extension

See [#4](../../issues/4) for planned self-healing capability.

### Adding New Features

- **New filter categories**: Add to `DEFAULT_SETTINGS.categories` in `background.js`
- **New interaction types**: Add detection logic in `attachInteractionObservers()` in `content.js`
- **Custom classification models**: Modify the `classifyPosts()` function in `background.js`

## Limitations

- LinkedIn's DOM structure may change, requiring detection logic updates (see [#4](../../issues/4) for planned self-healing)
- Classification quality depends on the AI model and prompt
- No way to filter posts before they briefly appear (there's a flash before classification completes)
- Browser extension storage has limits (~5MB for `chrome.storage.local`); history is automatically trimmed

## License

MIT
