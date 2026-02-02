// LinkedIn Post Filter — Content Script
// Injects into LinkedIn pages to extract posts, observe interactions, and show filter UI.

(function () {
  'use strict';

  if (window.__linkedinPostFilterLoaded) return;
  window.__linkedinPostFilterLoaded = true;

  // ─── Configuration ───────────────────────────────────────────────

  const BATCH_DELAY_MS = 3000;       // wait this long after last new post before classifying
  const MIN_POST_LENGTH = 30;        // ignore very short posts
  const POST_PREVIEW_LEN = 280;      // characters shown in review panel

  // LinkedIn DOM selectors — multiple fallbacks since LI changes these
  const SELECTORS = {
    feedPost: [
      'div.feed-shared-update-v2',
      'div[data-id*="urn:li:activity"]',
      'div[data-urn*="urn:li:activity"]',
      'article[data-id]',
    ],
    postText: [
      '.feed-shared-update-v2__description .update-components-text span[dir="ltr"]',
      '.update-components-text span[dir="ltr"]',
      '.feed-shared-text span[dir="ltr"]',
      '.feed-shared-update-v2__description span.break-words',
      '.update-components-text .break-words',
      '.feed-shared-text .break-words',
    ],
    postAuthor: [
      '.update-components-actor__name span[aria-hidden="true"]',
      '.feed-shared-actor__name span[aria-hidden="true"]',
      '.update-components-actor__title span',
      'a.update-components-actor__meta-link span',
    ],
    postUrn: [
      '[data-urn]',
      '[data-id]',
    ],
    likeButton: [
      'button[aria-label*="Like"]',
      'button.react-button__trigger',
      'button[aria-label*="like"]',
    ],
    commentButton: [
      'button[aria-label*="Comment"]',
      'button[aria-label*="comment"]',
    ],
    repostButton: [
      'button[aria-label*="Repost"]',
      'button[aria-label*="repost"]',
      'button[aria-label*="Share"]',
    ],
    menuButton: [
      'button.feed-shared-control-menu__trigger',
      'button[aria-label*="more actions"]',
      'button[aria-label*="More actions"]',
    ],
    menuItems: [
      '.feed-shared-control-menu__content button',
      '[role="menuitem"]',
    ],
  };

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

  function q(el, selectorList) {
    if (typeof selectorList === 'string') selectorList = [selectorList];
    for (const sel of selectorList) {
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  function qAll(el, selectorList) {
    if (typeof selectorList === 'string') selectorList = [selectorList];
    for (const sel of selectorList) {
      const found = el.querySelectorAll(sel);
      if (found.length > 0) return Array.from(found);
    }
    return [];
  }

  function getPostId(el) {
    for (const sel of SELECTORS.postUrn) {
      const node = el.matches(sel) ? el : el.querySelector(sel);
      if (node) {
        const urn = node.getAttribute('data-urn') || node.getAttribute('data-id') || '';
        if (urn) return urn;
      }
    }
    // Fallback: hash the first 200 chars of text content
    const text = (el.textContent || '').trim().slice(0, 200);
    return 'hash_' + simpleHash(text);
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function getPostText(el) {
    const textEl = q(el, SELECTORS.postText);
    if (textEl) return textEl.textContent.trim();
    // Fallback: get all text from the description area
    const desc = el.querySelector('.feed-shared-update-v2__description-wrapper')
      || el.querySelector('.update-components-text');
    if (desc) return desc.textContent.trim();
    return '';
  }

  function getPostAuthor(el) {
    const authorEl = q(el, SELECTORS.postAuthor);
    return authorEl ? authorEl.textContent.trim() : 'Unknown';
  }

  // ─── Post Extraction ────────────────────────────────────────────

  function findAllPosts() {
    for (const sel of SELECTORS.feedPost) {
      const posts = document.querySelectorAll(sel);
      if (posts.length > 0) return Array.from(posts);
    }
    return [];
  }

  function extractPostData(el) {
    const id = getPostId(el);
    const content = getPostText(el);
    const author = getPostAuthor(el);
    return { id, content, author, element: el };
  }

  function processNewPosts() {
    const allPosts = findAllPosts();
    const newPosts = [];

    for (const el of allPosts) {
      const id = getPostId(el);
      if (state.processedPosts.has(id)) continue;
      state.processedPosts.add(id);

      const data = extractPostData(el);
      if (data.content.length < MIN_POST_LENGTH) continue;

      // Tag the DOM element
      el.dataset.lpfId = id;
      newPosts.push(data);

      // Attach interaction observers to this post
      attachInteractionObservers(el, data);
    }

    if (newPosts.length > 0) {
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
      const payload = batch.map(p => ({
        id: p.id,
        content: p.content.slice(0, 1500), // limit content sent to API
        author: p.author,
      }));

      updateBadge('…');

      const response = await chrome.runtime.sendMessage({
        type: 'classifyPosts',
        posts: payload,
      });

      if (response.error) {
        console.warn('Classification error:', response.error);
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
    const el = document.querySelector(`[data-lpf-id="${postId}"]`);
    if (!el) return;

    el.classList.add('lpf-filtered');

    // Add filter badge if not already present
    if (!el.querySelector('.lpf-badge')) {
      const badge = document.createElement('div');
      badge.className = 'lpf-badge';
      badge.innerHTML = `
        <span class="lpf-badge__icon">⊘</span>
        <span class="lpf-badge__label">${escHtml(classification.category || 'filtered')}</span>
        <span class="lpf-badge__reason">${escHtml(classification.reason || '')}</span>
        <button class="lpf-badge__show" title="Show this post">👁</button>
      `;

      badge.querySelector('.lpf-badge__show').addEventListener('click', (e) => {
        e.stopPropagation();
        el.classList.toggle('lpf-filtered--revealed');
      });

      el.style.position = 'relative';
      el.prepend(badge);
    }
  }

  function removeFilterVisual(postId) {
    const el = document.querySelector(`[data-lpf-id="${postId}"]`);
    if (!el) return;
    el.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
    const badge = el.querySelector('.lpf-badge');
    if (badge) badge.remove();
  }

  // ─── Interaction Observation ────────────────────────────────────

  function attachInteractionObservers(postEl, postData) {
    // Like button
    const likeBtn = q(postEl, SELECTORS.likeButton);
    if (likeBtn) {
      likeBtn.addEventListener('click', () => {
        // Small delay to let LinkedIn update the state
        setTimeout(() => {
          const wasLiked = likeBtn.getAttribute('aria-pressed') === 'true'
            || likeBtn.classList.contains('react-button--active');
          if (wasLiked) {
            sendInteraction(postData, 'liked');
          }
        }, 500);
      }, { capture: true });
    }

    // Comment button (just opening — actual comment submission is harder to track)
    const commentBtn = q(postEl, SELECTORS.commentButton);
    if (commentBtn) {
      commentBtn.addEventListener('click', () => {
        // We'll observe the comment form for submission
        setTimeout(() => observeCommentSubmission(postEl, postData), 500);
      }, { capture: true });
    }

    // Repost button
    const repostBtn = q(postEl, SELECTORS.repostButton);
    if (repostBtn) {
      repostBtn.addEventListener('click', () => {
        sendInteraction(postData, 'shared');
      }, { capture: true });
    }

    // Three-dot menu (hide, unfollow)
    const menuBtn = q(postEl, SELECTORS.menuButton);
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        setTimeout(() => observeMenuActions(postEl, postData), 300);
      }, { capture: true });
    }
  }

  function observeCommentSubmission(postEl, postData) {
    const form = postEl.querySelector('.comments-comment-box form, .comments-comment-texteditor');
    if (!form) return;

    const submitObserver = new MutationObserver(() => {
      // Look for newly added comments
      const comments = postEl.querySelectorAll('.comments-comment-item, .comments-comment-entity');
      if (comments.length > 0) {
        sendInteraction(postData, 'commented');
        submitObserver.disconnect();
      }
    });

    submitObserver.observe(postEl, { childList: true, subtree: true });
    // Clean up after 60 seconds
    setTimeout(() => submitObserver.disconnect(), 60000);
  }

  function observeMenuActions(postEl, postData) {
    // Watch for menu items appearing in the document
    const checkMenu = () => {
      const items = document.querySelectorAll(
        '.feed-shared-control-menu__content button, ' +
        '[role="menu"] [role="menuitem"], ' +
        '.artdeco-dropdown__content button'
      );
      for (const item of items) {
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
    // Also check again shortly in case the menu is still loading
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
        <h3>🔍 Post Filter</h3>
        <div id="lpf-panel__actions">
          <button id="lpf-panel__classify-btn" title="Classify visible posts now">⟳ Scan</button>
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
    const btn = document.createElement('button');
    btn.id = 'lpf-toggle';
    btn.innerHTML = '<span class="lpf-toggle__icon">⊘</span><span class="lpf-toggle__count" id="lpf-badge-count"></span>';
    btn.title = 'Open LinkedIn Post Filter';
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);
    return btn;
  }

  function togglePanel() {
    state.panelOpen = !state.panelOpen;
    const panel = document.getElementById('lpf-panel');
    panel.classList.toggle('lpf-panel--open', state.panelOpen);
    if (state.panelOpen) renderPanelContent();
  }

  function renderPanelContent() {
    const filtered = Object.entries(state.classifications)
      .filter(([, c]) => c.filter)
      .sort((a, b) => (b[1].confidence || 0) - (a[1].confidence || 0));

    const statsEl = document.getElementById('lpf-panel__stats');
    const listEl = document.getElementById('lpf-panel__list');
    const emptyEl = document.getElementById('lpf-panel__empty');

    statsEl.innerHTML = `
      <div class="lpf-stat">
        <strong>${Object.keys(state.classifications).length}</strong> scanned
      </div>
      <div class="lpf-stat">
        <strong>${filtered.length}</strong> filtered
      </div>
    `;

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = filtered.map(([id, c]) => {
      const postEl = document.querySelector(`[data-lpf-id="${id}"]`);
      const content = postEl ? getPostText(postEl) : '(post no longer visible)';
      const author = postEl ? getPostAuthor(postEl) : 'Unknown';
      const preview = content.slice(0, POST_PREVIEW_LEN) + (content.length > POST_PREVIEW_LEN ? '…' : '');
      const confidencePct = Math.round((c.confidence || 0) * 100);

      return `
        <div class="lpf-review-card" data-post-id="${escAttr(id)}">
          <div class="lpf-review-card__header">
            <span class="lpf-review-card__author">${escHtml(author)}</span>
            <span class="lpf-review-card__category">${escHtml(c.category || 'unknown')}</span>
          </div>
          <div class="lpf-review-card__preview">${escHtml(preview)}</div>
          <div class="lpf-review-card__reason">
            <em>${escHtml(c.reason || '')}</em>
            <span class="lpf-review-card__confidence">${confidencePct}%</span>
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

    // Attach event handlers
    listEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleReviewAction);
    });
  }

  function handleReviewAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const postId = btn.dataset.postId;
    const classification = state.classifications[postId];

    if (action === 'scroll') {
      const el = document.querySelector(`[data-lpf-id="${postId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const postEl = document.querySelector(`[data-lpf-id="${postId}"]`);
    const content = postEl ? getPostText(postEl) : '';
    const author = postEl ? getPostAuthor(postEl) : 'Unknown';
    const feedback = action === 'approve' ? 'approved' : 'rejected';

    chrome.runtime.sendMessage({
      type: 'recordFeedback',
      postId, content: content.slice(0, 500), author,
      category: classification?.category,
      feedback,
    });

    if (action === 'reject') {
      // User disagrees — unhide the post
      removeFilterVisual(postId);
      state.classifications[postId] = { ...classification, filter: false };
      showToast('Post restored', 'info');
    } else {
      // User agrees — keep it hidden
      showToast('Filter confirmed', 'info');
    }

    // Remove the card from the panel with animation
    const card = btn.closest('.lpf-review-card');
    if (card) {
      card.classList.add('lpf-review-card--dismissed');
      setTimeout(() => {
        card.remove();
        // Update count
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
    const el = document.getElementById('lpf-badge-count');
    if (el) {
      el.textContent = text || '';
      el.style.display = text ? 'flex' : 'none';
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

  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escAttr(s) {
    return s.replace(/[&"'<>]/g, c => ({
      '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;'
    })[c]);
  }

  // ─── Initialization ─────────────────────────────────────────────

  async function init() {
    // Check if extension is enabled
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    state.enabled = settings?.enabled !== false;

    if (!state.enabled) {
      console.log('LinkedIn Post Filter is disabled.');
      return;
    }

    // Check API key
    const { configured } = await chrome.runtime.sendMessage({ type: 'checkApiKey' });
    if (!configured) {
      showToast('LinkedIn Post Filter: Please set your API key in extension options.', 'error');
    }

    // Create UI
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

    // Observe the feed container, or fall back to body
    const feedContainer =
      document.querySelector('.scaffold-finite-scroll__content') ||
      document.querySelector('.core-rail') ||
      document.querySelector('main') ||
      document.body;

    observer.observe(feedContainer, { childList: true, subtree: true });

    console.log('LinkedIn Post Filter initialized.');
  }

  // ─── Message listener (for popup/options communication) ─────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggleEnabled') {
      state.enabled = msg.enabled;
      if (!state.enabled) {
        // Remove all filter visuals
        document.querySelectorAll('.lpf-filtered').forEach(el => {
          el.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
          const badge = el.querySelector('.lpf-badge');
          if (badge) badge.remove();
        });
      }
      sendResponse({ ok: true });
    }
    if (msg.type === 'rescanFeed') {
      state.processedPosts.clear();
      state.pendingPosts = [];
      state.classifications = {};
      document.querySelectorAll('.lpf-filtered').forEach(el => {
        el.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
        const badge = el.querySelector('.lpf-badge');
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
