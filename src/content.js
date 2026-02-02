// LinkedIn Post Filter — Content Script
// Injects into LinkedIn pages to extract posts, observe interactions, and show filter UI.
// Uses aria-label and structural detection since LinkedIn uses obfuscated class names.

(function () {
  'use strict';

  if (window.__linkedinPostFilterLoaded) return;
  window.__linkedinPostFilterLoaded = true;

  // ─── Configuration ───────────────────────────────────────────────

  const BATCH_DELAY_MS = 3000;       // wait this long after last new post before classifying
  const MIN_POST_LENGTH = 30;        // ignore very short posts
  const POST_PREVIEW_LEN = 280;      // characters shown in review panel

  // ─── State ───────────────────────────────────────────────────────

  const state = {
    processedPosts: new Set(),
    pendingPosts: [],
    batchTimer: null,
    classifications: {},  // postId → classification result
    panelOpen: false,
    enabled: true,
  };

  // ─── DOM Utilities ───────────────────────────────────────────────

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  // ─── Post Detection (structural / aria-based) ────────────────────

  function isPostElement(element) {
    // A post has a reaction button and is a direct child of the feed list
    const buttons = element.querySelectorAll('button');
    let hasReaction = false;
    for (const button of buttons) {
      const label = button.getAttribute('aria-label') || '';
      if (label.startsWith('Reaction button state:')) {
        hasReaction = true;
        break;
      }
    }
    return hasReaction;
  }

  function findFeedList() {
    // The feed is inside <main>. Find the center column (the one with reaction buttons),
    // then find the child container with many children.
    const main = document.querySelector('main');
    if (!main) return null;

    // Find the deepest container with 4+ children inside main
    function findRepeatingContainer(element, depth) {
      if (depth > 15) return null;
      for (const child of element.children) {
        if (child.children.length >= 4) {
          // Verify at least some children look like posts
          const childArray = Array.from(child.children);
          const postLikeCount = childArray.filter(c => isPostElement(c)).length;
          if (postLikeCount >= 1) {
            return child;
          }
        }
        const deeper = findRepeatingContainer(child, depth + 1);
        if (deeper) return deeper;
      }
      return null;
    }

    return findRepeatingContainer(main, 0);
  }

  function findAllPosts() {
    const feedList = findFeedList();
    if (!feedList) return [];

    return Array.from(feedList.children).filter(child => isPostElement(child));
  }

  function getPostId(element) {
    // Try data attributes first
    const urnNode = element.querySelector('[data-urn]') || element.querySelector('[data-id]');
    if (urnNode) {
      const urn = urnNode.getAttribute('data-urn') || urnNode.getAttribute('data-id') || '';
      if (urn) return urn;
    }
    // Fallback: hash the text content
    const text = (element.textContent || '').trim().slice(0, 200);
    return 'hash_' + simpleHash(text);
  }

  function getPostText(element) {
    // The post text is in span[dir="ltr"] elements, or we can look for the
    // longest meaningful text block that isn't button/author text.
    // First try span[dir="ltr"] which LinkedIn uses for post body text
    const ltrSpans = element.querySelectorAll('span[dir="ltr"]');
    if (ltrSpans.length > 0) {
      // Concatenate all ltr spans that have meaningful length
      const texts = Array.from(ltrSpans)
        .map(span => span.textContent.trim())
        .filter(text => text.length > 15);
      if (texts.length > 0) return texts.join(' ');
    }

    // Fallback: find the longest text node that isn't a button label
    const candidates = element.querySelectorAll('span, p, div');
    let longestText = '';
    for (const node of candidates) {
      // Skip if it's inside a button
      if (node.closest('button')) continue;
      const text = node.textContent.trim();
      if (text.length > longestText.length && text.length < 3000) {
        longestText = text;
      }
    }
    return longestText;
  }

  function getPostAuthor(element) {
    // Author is in the first link pointing to /in/ or /company/
    const authorLink = element.querySelector('a[href*="/in/"], a[href*="/company/"]');
    if (authorLink) {
      return authorLink.textContent.trim().replace(/\s+/g, ' ').slice(0, 60);
    }
    return 'Unknown';
  }

  // ─── Post Extraction ────────────────────────────────────────────

  function extractPostData(element) {
    const id = getPostId(element);
    const content = getPostText(element);
    const author = getPostAuthor(element);
    return { id, content, author, element };
  }

  function processNewPosts() {
    const allPosts = findAllPosts();
    const newPosts = [];

    for (const element of allPosts) {
      const id = getPostId(element);
      if (state.processedPosts.has(id)) continue;
      state.processedPosts.add(id);

      const data = extractPostData(element);
      if (data.content.length < MIN_POST_LENGTH) continue;

      // Tag the DOM element
      element.dataset.lpfId = id;
      newPosts.push(data);

      // Attach interaction observers to this post
      attachInteractionObservers(element, data);
    }

    if (newPosts.length > 0) {
      console.log(`[LPF] Found ${newPosts.length} new posts to classify.`);
      state.pendingPosts.push(...newPosts);
      scheduleBatchClassification();
    }
  }

  // ─── Batch Classification ───────────────────────────────────────

  function scheduleBatchClassification() {
    if (state.batchTimer) clearTimeout(state.batchTimer);
    state.batchTimer = setTimeout(async () => {
      if (state.pendingPosts.length === 0) return;

      const batch = state.pendingPosts.splice(0);
      const payload = batch.map(postData => ({
        id: postData.id,
        content: postData.content.slice(0, 1500),
        author: postData.author,
      }));

      updateBadge('…');

      const response = await chrome.runtime.sendMessage({
        type: 'classifyPosts',
        posts: payload,
      });

      if (response.error) {
        console.warn('[LPF] Classification error:', response.error);
        showToast(response.error, 'error');
        updateBadge('!');
        return;
      }

      let filterCount = 0;
      for (const result of response.results) {
        state.classifications[result.id] = result;
        if (result.filter) {
          filterCount++;
          applyFilterVisual(result.id, result);
        }
      }

      updateBadge(filterCount > 0 ? String(filterCount) : '');
      if (state.panelOpen) renderPanelContent();
    }, BATCH_DELAY_MS);
  }

  // ─── Filter Visuals ─────────────────────────────────────────────

  function applyFilterVisual(postId, classification) {
    const element = document.querySelector(`[data-lpf-id="${postId}"]`);
    if (!element) return;

    element.classList.add('lpf-filtered');

    if (!element.querySelector('.lpf-badge')) {
      const badge = document.createElement('div');
      badge.className = 'lpf-badge';
      badge.innerHTML = `
        <span class="lpf-badge__icon">⊘</span>
        <span class="lpf-badge__label">${escHtml(classification.category || 'filtered')}</span>
        <span class="lpf-badge__reason">${escHtml(classification.reason || '')}</span>
        <div class="lpf-badge__buttons">
          <button class="lpf-badge__btn lpf-badge__btn--preview" title="Preview this post">👁</button>
          <button class="lpf-badge__btn lpf-badge__btn--reject" title="Keep this post">＋</button>
          <button class="lpf-badge__btn lpf-badge__btn--approve" title="Remove this post">－</button>
        </div>
      `;

      badge.querySelector('.lpf-badge__btn--preview').addEventListener('click', (event) => {
        event.stopPropagation();
        element.classList.toggle('lpf-filtered--revealed');
      });

      badge.querySelector('.lpf-badge__btn--approve').addEventListener('click', (event) => {
        event.stopPropagation();
        const content = getPostText(element);
        const author = getPostAuthor(element);
        chrome.runtime.sendMessage({
          type: 'recordFeedback',
          postId, content: content.slice(0, 500), author,
          category: classification?.category,
          feedback: 'approved',
        });
        element.classList.remove('lpf-filtered--revealed');
        badge.querySelector('.lpf-badge__buttons').innerHTML = '<span class="lpf-badge__confirmed">Confirmed</span>';
        showToast('Filter confirmed', 'info');
      });

      badge.querySelector('.lpf-badge__btn--reject').addEventListener('click', (event) => {
        event.stopPropagation();
        const content = getPostText(element);
        const author = getPostAuthor(element);
        chrome.runtime.sendMessage({
          type: 'recordFeedback',
          postId, content: content.slice(0, 500), author,
          category: classification?.category,
          feedback: 'rejected',
        });
        removeFilterVisual(postId);
        state.classifications[postId] = { ...classification, filter: false };
        showToast('Post restored', 'info');
        updateBadge(
          String(Object.values(state.classifications).filter(c => c.filter).length)
        );
      });

      element.prepend(badge);
    }
  }

  function removeFilterVisual(postId) {
    const element = document.querySelector(`[data-lpf-id="${postId}"]`);
    if (!element) return;
    element.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
    const badge = element.querySelector('.lpf-badge');
    if (badge) badge.remove();
  }

  // ─── Interaction Observation ────────────────────────────────────

  function attachInteractionObservers(postElement, postData) {
    // Reaction (like) button — identified by aria-label
    const allButtons = postElement.querySelectorAll('button');

    for (const button of allButtons) {
      const label = button.getAttribute('aria-label') || '';

      if (label.startsWith('Reaction button state:')) {
        button.addEventListener('click', () => {
          setTimeout(() => {
            const currentLabel = button.getAttribute('aria-label') || '';
            if (!currentLabel.includes('no reaction')) {
              sendInteraction(postData, 'liked');
            }
          }, 500);
        }, { capture: true });
      }

      if (label === 'Comment') {
        button.addEventListener('click', () => {
          setTimeout(() => observeCommentSubmission(postElement, postData), 500);
        }, { capture: true });
      }

      if (label === 'Repost') {
        button.addEventListener('click', () => {
          sendInteraction(postData, 'shared');
        }, { capture: true });
      }

      if (label === 'View more options') {
        button.addEventListener('click', () => {
          setTimeout(() => observeMenuActions(postElement, postData), 300);
        }, { capture: true });
      }

      if (label === 'Hide Post') {
        button.addEventListener('click', () => {
          sendInteraction(postData, 'hidden');
        }, { capture: true });
      }
    }
  }

  function observeCommentSubmission(postElement, postData) {
    const submitObserver = new MutationObserver(() => {
      // Look for comment-like new content
      sendInteraction(postData, 'commented');
      submitObserver.disconnect();
    });

    submitObserver.observe(postElement, { childList: true, subtree: true });
    setTimeout(() => submitObserver.disconnect(), 60000);
  }

  function observeMenuActions(postElement, postData) {
    const checkMenu = () => {
      const menuItems = document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menuitem"]');
      for (const item of menuItems) {
        const text = (item.textContent || '').toLowerCase();
        if (text.includes("don't want to see") || text.includes('hide') || text.includes('not interested')) {
          item.addEventListener('click', () => sendInteraction(postData, 'hidden'), { once: true });
        }
        if (text.includes('unfollow')) {
          item.addEventListener('click', () => sendInteraction(postData, 'unfollowed'), { once: true });
        }
      }
    };

    checkMenu();
    setTimeout(checkMenu, 300);
  }

  function sendInteraction(postData, interaction) {
    chrome.runtime.sendMessage({
      type: 'recordInteraction',
      postId: postData.id,
      content: postData.content.slice(0, 500),
      author: postData.author,
      interaction,
    });
    showToast(`Recorded: ${interaction}`, 'info');
  }

  // ─── Review Panel ───────────────────────────────────────────────

  function createReviewPanel() {
    const panel = document.createElement('div');
    panel.id = 'lpf-panel';
    panel.innerHTML = `
      <div id="lpf-panel__header">
        <h3>LinkedOut</h3>
        <div id="lpf-panel__actions">
          <button id="lpf-panel__classify-btn" title="Classify visible posts now">Scan</button>
          <button id="lpf-panel__close-btn" title="Close panel">✕</button>
        </div>
      </div>
      <div id="lpf-panel__stats"></div>
      <div id="lpf-panel__list"></div>
      <div id="lpf-panel__empty">
        <p>No posts filtered yet.</p>
        <p class="lpf-panel__hint">Posts will be analyzed as they appear in your feed.</p>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('lpf-panel__close-btn').addEventListener('click', togglePanel);
    document.getElementById('lpf-panel__classify-btn').addEventListener('click', () => {
      state.processedPosts.clear();
      state.pendingPosts = [];
      processNewPosts();
    });

    return panel;
  }

  function createToggleButton() {
    const button = document.createElement('button');
    button.id = 'lpf-toggle';
    button.innerHTML = '<span class="lpf-toggle__icon">⊘</span><span class="lpf-toggle__count" id="lpf-badge-count"></span>';
    button.title = 'Open LinkedIn Post Filter';
    button.addEventListener('click', togglePanel);
    document.body.appendChild(button);
    return button;
  }

  function togglePanel() {
    state.panelOpen = !state.panelOpen;
    const panel = document.getElementById('lpf-panel');
    panel.classList.toggle('lpf-panel--open', state.panelOpen);
    if (state.panelOpen) renderPanelContent();
  }

  function renderPanelContent() {
    const filtered = Object.entries(state.classifications)
      .filter(([, classification]) => classification.filter)
      .sort((a, b) => (b[1].confidence || 0) - (a[1].confidence || 0));

    const statsElement = document.getElementById('lpf-panel__stats');
    const listElement = document.getElementById('lpf-panel__list');
    const emptyElement = document.getElementById('lpf-panel__empty');

    statsElement.innerHTML = `
      <div class="lpf-stat">
        <strong>${Object.keys(state.classifications).length}</strong> scanned
      </div>
      <div class="lpf-stat">
        <strong>${filtered.length}</strong> filtered
      </div>
    `;

    if (filtered.length === 0) {
      listElement.innerHTML = '';
      emptyElement.style.display = 'block';
      return;
    }

    emptyElement.style.display = 'none';
    listElement.innerHTML = filtered.map(([id, classification]) => {
      const postElement = document.querySelector(`[data-lpf-id="${id}"]`);
      const content = postElement ? getPostText(postElement) : '(post no longer visible)';
      const author = postElement ? getPostAuthor(postElement) : 'Unknown';
      const preview = content.slice(0, POST_PREVIEW_LEN) + (content.length > POST_PREVIEW_LEN ? '…' : '');
      const confidencePercent = Math.round((classification.confidence || 0) * 100);

      const fullContent = escHtml(content.slice(0, 1500));

      return `
        <div class="lpf-review-card" data-post-id="${escAttr(id)}">
          <div class="lpf-review-card__header">
            <span class="lpf-review-card__author">${escHtml(author)}</span>
            <span class="lpf-review-card__category">${escHtml(classification.category || 'unknown')}</span>
          </div>
          <div class="lpf-review-card__preview lpf-review-card__preview--collapsed">${fullContent}</div>
          <button class="lpf-review-card__expand">Show more</button>
          <div class="lpf-review-card__reason">
            <em>${escHtml(classification.reason || '')}</em>
            <span class="lpf-review-card__confidence">${confidencePercent}%</span>
          </div>
          <div class="lpf-review-card__actions">
            <button class="lpf-btn lpf-btn--approve" data-action="approve" data-post-id="${escAttr(id)}" title="Yes, filter this">
              ✓ Filter
            </button>
            <button class="lpf-btn lpf-btn--reject" data-action="reject" data-post-id="${escAttr(id)}" title="No, keep this">
              ✗ Keep
            </button>
            <button class="lpf-btn lpf-btn--scroll" data-action="scroll" data-post-id="${escAttr(id)}" title="Scroll to post">
              ↓
            </button>
          </div>
        </div>
      `;
    }).join('');

    listElement.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', handleReviewAction);
    });

    listElement.querySelectorAll('.lpf-review-card__expand').forEach(button => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const card = button.closest('.lpf-review-card');
        const preview = card.querySelector('.lpf-review-card__preview');
        const collapsed = preview.classList.toggle('lpf-review-card__preview--collapsed');
        button.textContent = collapsed ? 'Show more' : 'Show less';
      });
    });
  }

  function handleReviewAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const postId = button.dataset.postId;
    const classification = state.classifications[postId];

    if (action === 'scroll') {
      const element = document.querySelector(`[data-lpf-id="${postId}"]`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const postElement = document.querySelector(`[data-lpf-id="${postId}"]`);
    const content = postElement ? getPostText(postElement) : '';
    const author = postElement ? getPostAuthor(postElement) : 'Unknown';
    const feedback = action === 'approve' ? 'approved' : 'rejected';

    chrome.runtime.sendMessage({
      type: 'recordFeedback',
      postId, content: content.slice(0, 500), author,
      category: classification?.category,
      feedback,
    });

    if (action === 'reject') {
      removeFilterVisual(postId);
      state.classifications[postId] = { ...classification, filter: false };
      showToast('Post restored', 'info');
    } else {
      showToast('Filter confirmed', 'info');
    }

    const card = button.closest('.lpf-review-card');
    if (card) {
      card.classList.add('lpf-review-card--dismissed');
      setTimeout(() => {
        card.remove();
        const remaining = document.querySelectorAll('#lpf-panel__list .lpf-review-card:not(.lpf-review-card--dismissed)');
        if (remaining.length === 0) {
          document.getElementById('lpf-panel__empty').style.display = 'block';
        }
      }, 300);
    }

    updateBadge(
      String(Object.values(state.classifications).filter(c => c.filter).length)
    );
  }

  function updateBadge(text) {
    const element = document.getElementById('lpf-badge-count');
    if (element) {
      element.textContent = text || '';
      element.style.display = text ? 'flex' : 'none';
    }
  }

  // ─── Toast Notifications ────────────────────────────────────────

  function showToast(message, type = 'info') {
    let container = document.getElementById('lpf-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'lpf-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `lpf-toast lpf-toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('lpf-toast--visible'), 10);
    setTimeout(() => {
      toast.classList.remove('lpf-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ─── HTML Escaping ──────────────────────────────────────────────

  function escHtml(string) {
    const div = document.createElement('div');
    div.textContent = string;
    return div.innerHTML;
  }

  function escAttr(string) {
    return string.replace(/[&"'<>]/g, character => ({
      '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;'
    })[character]);
  }

  // ─── Initialization ─────────────────────────────────────────────

  async function init() {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    state.enabled = settings?.enabled !== false;

    if (!state.enabled) {
      console.log('[LPF] LinkedIn Post Filter is disabled.');
      return;
    }

    const { configured } = await chrome.runtime.sendMessage({ type: 'checkApiKey' });
    if (!configured) {
      showToast('LinkedOut: Please set your API key in extension options.', 'error');
    }

    createToggleButton();
    createReviewPanel();

    // Process posts already on page
    processNewPosts();

    // Watch for new posts (infinite scroll)
    const observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) processNewPosts();
    });

    const feedContainer = document.querySelector('main') || document.body;
    observer.observe(feedContainer, { childList: true, subtree: true });

    console.log('[LPF] LinkedIn Post Filter initialized.');
  }

  // ─── Message listener (for popup/options communication) ─────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggleEnabled') {
      state.enabled = message.enabled;
      if (!state.enabled) {
        document.querySelectorAll('.lpf-filtered').forEach(element => {
          element.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
          const badge = element.querySelector('.lpf-badge');
          if (badge) badge.remove();
        });
      }
      sendResponse({ ok: true });
    }
    if (message.type === 'rescanFeed') {
      state.processedPosts.clear();
      state.pendingPosts = [];
      state.classifications = {};
      document.querySelectorAll('.lpf-filtered').forEach(element => {
        element.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
        const badge = element.querySelector('.lpf-badge');
        if (badge) badge.remove();
      });
      processNewPosts();
      sendResponse({ ok: true });
    }
    return false;
  });

  // ─── Boot ───────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
