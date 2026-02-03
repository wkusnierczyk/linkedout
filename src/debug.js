const output = document.getElementById('output');

function log(text) {
  output.textContent += '\n' + text;
  output.scrollTop = output.scrollHeight;
}

document.getElementById('settings-btn').addEventListener('click', async () => {
  const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
  log('Settings: ' + JSON.stringify(settings, null, 2));
});

document.getElementById('apikey-btn').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'checkApiKey' });
  log('API key configured: ' + result.configured);
});

document.getElementById('inspect-btn').addEventListener('click', async () => {
  log('Inspecting LinkedIn tab DOM...');
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/feed*' });
  const tab = tabs[0];
  if (!tab) {
    log('No LinkedIn feed tab found. Open https://www.linkedin.com/feed in another tab first.');
    return;
  }
  log('Found tab: ' + tab.url);

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const report = {};

      // Walk down from main to find the repeating feed items
      const main = document.querySelector('main');
      if (!main) return { error: 'no main element' };

      // Recursively find the first element that has many similar children (the feed list)
      function findRepeatingContainer(el, depth) {
        if (depth > 10) return null;
        for (const child of el.children) {
          if (child.children.length >= 3) {
            // Check if children look similar (same tag)
            const tags = Array.from(child.children).map((c) => c.tagName);
            const mostCommon = tags.sort(
              (a, b) => tags.filter((t) => t === b).length - tags.filter((t) => t === a).length
            )[0];
            const sameTagCount = tags.filter((t) => t === mostCommon).length;
            if (sameTagCount >= 3 && sameTagCount / tags.length > 0.5) {
              return {
                element: child,
                depth,
                childCount: child.children.length,
                childTag: mostCommon,
              };
            }
          }
          const deeper = findRepeatingContainer(child, depth + 1);
          if (deeper) return deeper;
        }
        return null;
      }

      const container = findRepeatingContainer(main, 0);
      if (!container) return { error: 'no repeating container found' };

      report.container = {
        tag: container.element.tagName,
        className: (container.element.className || '').toString().slice(0, 200),
        depth: container.depth,
        childCount: container.childCount,
        childTag: container.childTag,
      };

      // Sample the first few feed items
      const items = Array.from(container.element.children).slice(0, 5);
      report.items = items.map((item, _i) => {
        const info = {
          tag: item.tagName,
          className: (item.className || '').toString().slice(0, 200),
          dataAttrs: Object.keys(item.dataset),
          role: item.getAttribute('role'),
          ariaLabel: item.getAttribute('aria-label'),
          id: item.id || null,
        };

        // Find text content — look for the longest text block
        const textNodes = item.querySelectorAll('span, p, div');
        let longestText = '';
        let longestEl = null;
        for (const tn of textNodes) {
          const t = (tn.textContent || '').trim();
          if (t.length > longestText.length && t.length < 2000) {
            longestText = t;
            longestEl = tn;
          }
        }
        info.longestTextPreview = longestText.slice(0, 150);
        if (longestEl) {
          info.longestTextSelector = {
            tag: longestEl.tagName,
            className: (longestEl.className || '').toString().slice(0, 120),
          };
        }

        // Find anything that looks like an author name
        const buttons = item.querySelectorAll('a, button');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          // Author links are typically short text inside anchor tags near the top
          if (btn.tagName === 'A' && text.length > 2 && text.length < 60 && !info.possibleAuthor) {
            const href = btn.getAttribute('href') || '';
            if (href.includes('/in/') || href.includes('/company/')) {
              info.possibleAuthor = { text, href: href.slice(0, 100) };
            }
          }
        }

        // Look for like/comment/repost buttons
        const allButtons = item.querySelectorAll('button');
        info.buttonLabels = Array.from(allButtons)
          .map((b) => b.getAttribute('aria-label') || b.textContent.trim())
          .filter((t) => t.length > 0 && t.length < 60)
          .slice(0, 10);

        return info;
      });

      // Drill into the center column (the one with reaction buttons)
      const feedColumn = items.find((item) => {
        const btns = item.querySelectorAll('button');
        return Array.from(btns).some((b) =>
          (b.getAttribute('aria-label') || '').includes('Reaction')
        );
      });

      if (feedColumn) {
        // Walk down to find the repeating list inside the feed column
        function findDeepRepeating(el, depth) {
          if (depth > 15) return null;
          for (const child of el.children) {
            if (child.children.length >= 4) {
              return { element: child, depth, childCount: child.children.length };
            }
            const deeper = findDeepRepeating(child, depth + 1);
            if (deeper) return deeper;
          }
          return null;
        }

        const feedList = findDeepRepeating(feedColumn, 0);
        if (feedList) {
          report.feedList = {
            tag: feedList.element.tagName,
            className: (feedList.element.className || '').toString().slice(0, 200),
            depth: feedList.depth,
            childCount: feedList.childCount,
          };

          const feedChildren = Array.from(feedList.element.children).slice(0, 8);
          report.feedChildren = feedChildren.map((el) => {
            const btns = el.querySelectorAll('button');
            const btnLabels = Array.from(btns)
              .map((b) => b.getAttribute('aria-label') || '')
              .filter((t) => t.length > 0)
              .slice(0, 6);

            let author = null;
            const link = el.querySelector('a[href*="/in/"], a[href*="/company/"]');
            if (link) author = link.textContent.trim().slice(0, 60);

            // Get the full text content preview
            const textContent = el.textContent.trim().slice(0, 200);

            return {
              tag: el.tagName,
              className: (el.className || '').toString().slice(0, 150),
              childCount: el.children.length,
              author,
              buttonLabels: btnLabels,
              textPreview: textContent,
            };
          });
        } else {
          // Just dump the tree structure of feedColumn up to depth 5
          function dumpTree(el, d) {
            if (d > 5) return null;
            return {
              tag: el.tagName,
              className: (el.className || '').toString().slice(0, 80),
              childCount: el.children.length,
              children: Array.from(el.children)
                .slice(0, 6)
                .map((c) => dumpTree(c, d + 1))
                .filter(Boolean),
            };
          }
          report.feedColumnTree = dumpTree(feedColumn, 0);
        }
      }

      // (legacy) Drill into the item that looks like the feed (has reaction buttons)
      const feedItem = items.find((item) => {
        const buttons = item.querySelectorAll('button');
        return Array.from(buttons).some((b) =>
          (b.getAttribute('aria-label') || '').includes('Reaction')
        );
      });

      if (feedItem) {
        // Find all descendants that have reaction buttons — these are individual posts
        const allDescendants = feedItem.querySelectorAll('*');
        const postCandidates = [];
        for (const el of allDescendants) {
          const btns = el.querySelectorAll(':scope > * button, :scope > * > * button');
          const hasReaction = Array.from(btns).some((b) =>
            (b.getAttribute('aria-label') || '').includes('Reaction')
          );
          const hasComment = Array.from(btns).some((b) =>
            (b.getAttribute('aria-label') || '').includes('Comment')
          );
          if (hasReaction && hasComment) {
            // Check this isn't a parent of another candidate
            const isParentOfExisting = postCandidates.some((c) => el.contains(c.el) && el !== c.el);
            if (!isParentOfExisting) {
              postCandidates.push({ el, depth: 0 });
            }
          }
        }

        // Filter to only the innermost matching elements
        const posts = postCandidates.filter(
          (c) => !postCandidates.some((other) => c.el.contains(other.el) && c.el !== other.el)
        );

        report.postCount = posts.length;
        report.posts = posts.slice(0, 3).map(({ el }) => {
          // Get the path from feedItem to this element
          const path = [];
          let cursor = el;
          while (cursor && cursor !== feedItem) {
            const parent = cursor.parentElement;
            if (parent) {
              const idx = Array.from(parent.children).indexOf(cursor);
              path.unshift({
                tag: cursor.tagName,
                index: idx,
                className: (cursor.className || '').toString().slice(0, 80),
              });
            }
            cursor = parent;
          }

          // Get post text
          const spans = el.querySelectorAll('span[dir="ltr"], span.break-words');
          const textFromSpans = Array.from(spans)
            .map((s) => s.textContent.trim())
            .filter((t) => t.length > 20)
            .slice(0, 2);

          // Get author
          let author = null;
          const links = el.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
          if (links.length > 0) {
            author = {
              text: links[0].textContent.trim().slice(0, 60),
              href: links[0].getAttribute('href').slice(0, 100),
            };
          }

          return {
            tag: el.tagName,
            className: (el.className || '').toString().slice(0, 200),
            path,
            author,
            textFromSpans,
            buttonLabels: Array.from(el.querySelectorAll('button'))
              .map((b) => b.getAttribute('aria-label') || '')
              .filter((t) => t.length > 0)
              .slice(0, 8),
          };
        });
      }

      return report;
    },
  });

  log(JSON.stringify(results[0]?.result, null, 2));
});
