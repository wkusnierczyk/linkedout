# Privacy Policy

**LinkedOut: Adaptive LinkedIn Post Filter**

*Last updated: February 4, 2026*

## Overview

LinkedOut is a browser extension that filters your LinkedIn feed. This policy explains what data is collected and how it is used.

## Data Collection

### Data Stored Locally (Never Leaves Your Browser)

The following data is stored in your browser's local extension storage and is never transmitted externally:

- **User preferences**: Filter settings, enabled categories, sensitivity level
- **Feedback history**: Your approve/reject decisions on filtered posts
- **Learning data**: Author reputation scores, learned keywords, pattern statistics
- **Cached classifications**: Previously classified posts to avoid redundant processing

You can export or delete all locally stored data from the extension's Settings page.

### Data Transmitted Externally (Optional, User-Initiated)

**LLM Classification Mode** (disabled by default):

When you explicitly enable LLM mode and provide your own Anthropic API key:

- **Post content**: Text from LinkedIn posts (up to 1500 characters per post) is sent to the Anthropic API for classification
- **No personally identifiable information**: Your name, email, or LinkedIn credentials are never transmitted

This feature is entirely opt-in. In the default local mode, **no data leaves your browser**.

## Data Sharing

- We do not sell, rent, or share your data with third parties
- When LLM mode is enabled, post content is sent only to Anthropic's API (subject to [Anthropic's Privacy Policy](https://www.anthropic.com/privacy))
- No analytics, tracking, or telemetry data is collected

## Data Retention

- Local data remains on your device until you clear it via Settings or uninstall the extension
- Data sent to Anthropic API is subject to Anthropic's data retention policies

## Your Rights

You have full control over your data:

- **Access**: Export all stored data from Settings
- **Deletion**: Clear all data from Settings, or uninstall the extension
- **Opt-out**: Disable LLM mode at any time to prevent external data transmission

## Security

- Your Anthropic API key is stored locally in Chrome's secure extension storage
- All API communications use HTTPS encryption
- No data is stored on any servers controlled by LinkedOut

## Changes to This Policy

Any changes to this privacy policy will be reflected in the "Last updated" date above. Continued use of the extension after changes constitutes acceptance.

## Contact

For privacy concerns or questions, please open an issue at:
https://github.com/wkusnierczyk/linkedout/issues

## Source Code

LinkedOut is open source. You can review exactly what data is accessed:
https://github.com/wkusnierczyk/linkedout
