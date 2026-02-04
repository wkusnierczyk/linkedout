// LinkedIn Post Filter — Content Script
// Injects into LinkedIn pages to extract posts, observe interactions, and show filter UI.
// Uses aria-label and structural detection since LinkedIn uses obfuscated class names.

(function () {
  'use strict';

  if (window.__linkedinPostFilterLoaded) return;
  window.__linkedinPostFilterLoaded = true;

  // ─── Configuration ───────────────────────────────────────────────

  const BATCH_DELAY_MS = 3000; // wait this long after last new post before classifying
  const MIN_POST_LENGTH = 30; // ignore very short posts
  const INIT_RETRY_DELAY_MS = 500; // delay between init retries
  const INIT_MAX_RETRIES = 20; // max retries waiting for feed (10 seconds total)

  // ─── UI Labels (for i18n support) ─────────────────────────────────

  const LABELS = {
    badge: {
      previewPost: 'Preview this post',
      approveFilter: 'Good filter — hide this post',
      rejectFilter: 'Wrong filter — keep this post',
      reFilter: 'Re-filter this post',
      restorePost: 'Undo — restore this post',
    },
    panel: {
      showMore: 'Show more',
      showLess: 'Show less',
      statusConfirmed: 'Confirmed',
      statusRejected: 'Rejected',
      buttonHit: '◎ Hit',
      buttonMiss: '○ Miss',
      buttonUndo: '◎ Undo',
      buttonUndoMiss: '○ Undo',
    },
    toast: {
      filterConfirmed: 'Filter confirmed',
      postRestored: 'Post restored',
    },
  };

  // ─── State ───────────────────────────────────────────────────────

  const state = {
    processedPosts: new Set(),
    pendingPosts: [],
    batchTimer: null,
    classifications: {}, // postId → classification result
    panelOpen: false,
    enabled: true,
    initialized: false, // tracks if UI has been created
    lastUrl: location.href, // for SPA navigation detection
    contextValid: true, // tracks if extension context is still valid
    scanning: false, // tracks if classification is in progress
  };

  // ─── State Management ─────────────────────────────────────────────

  function updateClassification(postId, updates) {
    const current = state.classifications[postId] || {};
    state.classifications[postId] = { ...current, ...updates };
    return state.classifications[postId];
  }

  function getClassification(postId) {
    return state.classifications[postId];
  }

  function getPendingFilterCount() {
    return Object.values(state.classifications).filter((c) => c.filter && !c.confirmed).length;
  }

  // ─── Safe Messaging ─────────────────────────────────────────────

  async function sendMessage(message) {
    if (!state.contextValid) {
      return { error: 'context_invalidated' };
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (err) {
      if (
        err.message?.includes('Extension context invalidated') ||
        err.message?.includes('message channel closed')
      ) {
        state.contextValid = false;
        state.enabled = false;
        showToast('Extension reloaded. Please refresh the page.', 'error');
        return { error: 'context_invalidated' };
      }
      throw err;
    }
  }

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
          const postLikeCount = childArray.filter((c) => isPostElement(c)).length;
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

    return Array.from(feedList.children).filter((child) => isPostElement(child));
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
        .map((span) => span.textContent.trim())
        .filter((text) => text.length > 15);
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

      // Always tag the DOM element (LinkedIn may have re-rendered it)
      element.dataset.lpfId = id;

      // Re-apply filter visual if we have a classification for this post
      const classification = state.classifications[id];
      if (
        (classification?.filter || classification?.rejected) &&
        !element.querySelector('.lpf-badge')
      ) {
        applyFilterVisual(id, classification);
      }

      if (state.processedPosts.has(id)) continue;
      state.processedPosts.add(id);

      const data = extractPostData(element);
      if (data.content.length < MIN_POST_LENGTH) continue;

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
      const postDataById = {};
      const payload = batch.map((postData) => {
        postDataById[postData.id] = {
          content: postData.content.slice(0, 1500),
          author: postData.author,
        };
        return {
          id: postData.id,
          content: postData.content.slice(0, 1500),
          author: postData.author,
        };
      });

      updateBadge('…');
      state.scanning = true;
      if (state.panelOpen) renderPanelContent();

      const response = await sendMessage({
        type: 'classifyPosts',
        posts: payload,
      });

      state.scanning = false;

      if (response?.error === 'context_invalidated') return;

      if (response?.error) {
        console.warn('[LPF] Classification error:', response.error);
        showToast(response.error, 'error');
        updateBadge('!');
        if (state.panelOpen) renderPanelContent();
        return;
      }

      let filterCount = 0;
      for (const result of response.results) {
        const postData = postDataById[result.id] || {};
        state.classifications[result.id] = {
          ...result,
          content: postData.content,
          author: postData.author,
        };
        if (result.filter) {
          filterCount++;
          applyFilterVisual(result.id, state.classifications[result.id]);
        }
      }

      updateBadge(filterCount > 0 ? String(filterCount) : '');
      if (state.panelOpen) renderPanelContent();
    }, BATCH_DELAY_MS);
  }

  // ─── Filter Visuals ─────────────────────────────────────────────

  function findPostElement(postId) {
    // CSS.escape handles special characters in the postId (e.g., colons in URNs)
    return document.querySelector(`[data-lpf-id="${CSS.escape(postId)}"]`);
  }

  function applyFilterVisual(postId, classification) {
    const element = findPostElement(postId);
    if (!element) return;

    // Only hide content if post is filtered (not rejected)
    if (classification.filter) {
      element.classList.add('lpf-filtered');
    }

    if (!element.querySelector('.lpf-badge')) {
      const badge = createBadge(element, postId, classification);
      element.prepend(badge);
    }
  }

  function createBadge(element, postId, classification) {
    const badge = document.createElement('div');
    badge.className = 'lpf-badge';

    // Create all elements once — visibility controlled by CSS classes
    badge.innerHTML = `
      <span class="lpf-badge__icon">⊘</span>
      <span class="lpf-badge__label">${escHtml(classification.categoryLabel || 'Filtered')}</span>
      <span class="lpf-badge__reason">${escHtml(classification.reason || '')}</span>
      <div class="lpf-badge__buttons">
        <button class="lpf-badge__btn lpf-badge__btn--preview" title="${escAttr(LABELS.badge.previewPost)}">👁</button>
        <button class="lpf-badge__btn lpf-badge__btn--approve" title="${escAttr(LABELS.badge.approveFilter)}">◎</button>
        <button class="lpf-badge__btn lpf-badge__btn--reject" title="${escAttr(LABELS.badge.rejectFilter)}">○</button>
      </div>
    `;

    // Attach event listeners once
    badge.querySelector('.lpf-badge__btn--preview').addEventListener('click', (event) => {
      event.stopPropagation();
      element.classList.toggle('lpf-filtered--revealed');
    });

    badge.querySelector('.lpf-badge__btn--approve').addEventListener('click', (event) => {
      event.stopPropagation();
      handleFeedback(badge, element, postId, 'approved');
    });

    badge.querySelector('.lpf-badge__btn--reject').addEventListener('click', (event) => {
      event.stopPropagation();
      handleFeedback(badge, element, postId, 'rejected');
    });

    // Set initial visibility state
    updateBadgeVisibility(badge, classification);

    return badge;
  }

  function updateBadgeVisibility(badge, classification) {
    // Update badge color class
    badge.classList.remove('lpf-badge--confirmed', 'lpf-badge--rejected');

    const previewBtn = badge.querySelector('.lpf-badge__btn--preview');
    const approveBtn = badge.querySelector('.lpf-badge__btn--approve');
    const rejectBtn = badge.querySelector('.lpf-badge__btn--reject');

    if (classification.rejected) {
      // Rejected: green badge, show only Hit button
      badge.classList.add('lpf-badge--rejected');
      previewBtn.classList.add('lpf-hidden');
      approveBtn.classList.remove('lpf-hidden');
      rejectBtn.classList.add('lpf-hidden');
      approveBtn.title = LABELS.badge.reFilter;
    } else if (classification.confirmed) {
      // Confirmed: red badge, show Preview and Miss buttons
      badge.classList.add('lpf-badge--confirmed');
      previewBtn.classList.remove('lpf-hidden');
      approveBtn.classList.add('lpf-hidden');
      rejectBtn.classList.remove('lpf-hidden');
      rejectBtn.title = LABELS.badge.restorePost;
    } else {
      // Pending: default badge, show all buttons
      previewBtn.classList.remove('lpf-hidden');
      approveBtn.classList.remove('lpf-hidden');
      rejectBtn.classList.remove('lpf-hidden');
      approveBtn.title = LABELS.badge.approveFilter;
      rejectBtn.title = LABELS.badge.rejectFilter;
    }
  }

  // ─── Feedback Processing (shared logic) ────────────────────────────

  /**
   * Process feedback action — updates state and records to background.
   * Returns the updated classification.
   * UI updates are handled separately by callers.
   */
  function processFeedback(postId, feedback, content, author) {
    const classification = getClassification(postId);

    // Record feedback to background
    sendMessage({
      type: 'recordFeedback',
      postId,
      content: content.slice(0, 500),
      author,
      category: classification?.category,
      feedback,
    });

    // Update state through centralized function
    if (feedback === 'approved') {
      return updateClassification(postId, { filter: true, confirmed: true, rejected: false });
    } else {
      return updateClassification(postId, { filter: false, confirmed: false, rejected: true });
    }
  }

  /**
   * Apply visual changes to a post element based on classification state.
   */
  function applyPostElementClasses(element, classification) {
    if (!element) return;

    if (classification.rejected) {
      // Rejected: remove filter styling
      element.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
    } else if (classification.filter) {
      // Filtered (pending or confirmed): apply filter styling
      element.classList.add('lpf-filtered');
      if (classification.confirmed) {
        // Confirmed: ensure not revealed
        element.classList.remove('lpf-filtered--revealed');
      }
    }
  }

  /**
   * Refresh all dependent UI after a feedback action.
   */
  function refreshFeedbackUI() {
    if (state.panelOpen) renderPanelContent();
    updateBadge(String(getPendingFilterCount()));
  }

  function handleFeedback(badge, element, postId, feedback) {
    const content = getPostText(element);
    const author = getPostAuthor(element);

    // Process feedback (state + background)
    const updated = processFeedback(postId, feedback, content, author);

    // Apply element-specific visual changes
    applyPostElementClasses(element, updated);

    // Show appropriate toast
    showToast(
      feedback === 'approved' ? LABELS.toast.filterConfirmed : LABELS.toast.postRestored,
      'info'
    );

    // Update badge visibility and refresh UI
    updateBadgeVisibility(badge, updated);
    refreshFeedbackUI();
  }

  // ─── Interaction Observation ────────────────────────────────────

  function attachInteractionObservers(postElement, postData) {
    // Reaction (like) button — identified by aria-label
    const allButtons = postElement.querySelectorAll('button');

    for (const button of allButtons) {
      const label = button.getAttribute('aria-label') || '';

      if (label.startsWith('Reaction button state:')) {
        button.addEventListener(
          'click',
          () => {
            setTimeout(() => {
              const currentLabel = button.getAttribute('aria-label') || '';
              if (!currentLabel.includes('no reaction')) {
                sendInteraction(postData, 'liked');
              }
            }, 500);
          },
          { capture: true }
        );
      }

      if (label === 'Comment') {
        button.addEventListener(
          'click',
          () => {
            setTimeout(() => observeCommentSubmission(postElement, postData), 500);
          },
          { capture: true }
        );
      }

      if (label === 'Repost') {
        button.addEventListener(
          'click',
          () => {
            sendInteraction(postData, 'shared');
          },
          { capture: true }
        );
      }

      if (label === 'View more options') {
        button.addEventListener(
          'click',
          () => {
            setTimeout(() => observeMenuActions(postElement, postData), 300);
          },
          { capture: true }
        );
      }

      if (label === 'Hide Post') {
        button.addEventListener(
          'click',
          () => {
            sendInteraction(postData, 'hidden');
          },
          { capture: true }
        );
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
      const menuItems = document.querySelectorAll(
        '[role="menu"] [role="menuitem"], [role="menuitem"]'
      );
      for (const item of menuItems) {
        const text = (item.textContent || '').toLowerCase();
        if (
          text.includes("don't want to see") ||
          text.includes('hide') ||
          text.includes('not interested')
        ) {
          item.addEventListener('click', () => sendInteraction(postData, 'hidden'), { once: true });
        }
        if (text.includes('unfollow')) {
          item.addEventListener('click', () => sendInteraction(postData, 'unfollowed'), {
            once: true,
          });
        }
      }
    };

    checkMenu();
    setTimeout(checkMenu, 300);
  }

  function sendInteraction(postData, interaction) {
    sendMessage({
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
          <button id="lpf-panel__classify-btn" title="Rescan visible posts">Rescan</button>
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
      state.classifications = {};
      // Remove existing filter visuals
      document.querySelectorAll('.lpf-filtered').forEach((element) => {
        element.classList.remove('lpf-filtered', 'lpf-filtered--revealed');
        const badge = element.querySelector('.lpf-badge');
        if (badge) badge.remove();
      });
      processNewPosts();
    });

    return panel;
  }

  function createToggleButton() {
    const button = document.createElement('button');
    button.id = 'lpf-toggle';
    button.innerHTML =
      '<span class="lpf-toggle__icon">⊘</span><span class="lpf-toggle__count" id="lpf-badge-count"></span>';
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
      .filter(
        ([, classification]) =>
          classification.filter || classification.confirmed || classification.rejected
      )
      .sort((a, b) => (b[1].confidence || 0) - (a[1].confidence || 0));

    const statsElement = document.getElementById('lpf-panel__stats');
    const listElement = document.getElementById('lpf-panel__list');
    const emptyElement = document.getElementById('lpf-panel__empty');

    const scanningIndicator = state.scanning
      ? '<div class="lpf-stat lpf-stat--scanning">Scanning...</div>'
      : '';

    statsElement.innerHTML = `
      <div class="lpf-stat">
        <strong>${Object.keys(state.classifications).length}</strong> scanned
      </div>
      <div class="lpf-stat">
        <strong>${filtered.length}</strong> filtered
      </div>
      ${scanningIndicator}
    `;

    if (filtered.length === 0) {
      listElement.innerHTML = '';
      emptyElement.style.display = 'block';
      return;
    }

    emptyElement.style.display = 'none';
    listElement.innerHTML = filtered
      .map(([id, classification]) => {
        const content = classification.content || '(no content)';
        const author = classification.author || 'Unknown';
        const confidencePercent = Math.round((classification.confidence || 0) * 100);
        const fullContent = escHtml(content.slice(0, 1500));

        let statusClass = '';
        let actionsHtml = '';

        if (classification.confirmed) {
          // Confirmed: show Miss button to undo
          statusClass = 'lpf-review-card--confirmed';
          actionsHtml = `
            <span class="lpf-review-card__status lpf-review-card__status--confirmed">${escHtml(LABELS.panel.statusConfirmed)}</span>
            <button class="lpf-btn lpf-btn--reject" data-action="reject" data-post-id="${escAttr(id)}" title="${escAttr(LABELS.badge.restorePost)}">${escHtml(LABELS.panel.buttonUndoMiss)}</button>
          `;
        } else if (classification.rejected) {
          // Rejected: show Hit button to undo
          statusClass = 'lpf-review-card--rejected';
          actionsHtml = `
            <span class="lpf-review-card__status lpf-review-card__status--rejected">${escHtml(LABELS.panel.statusRejected)}</span>
            <button class="lpf-btn lpf-btn--approve" data-action="approve" data-post-id="${escAttr(id)}" title="${escAttr(LABELS.badge.reFilter)}">${escHtml(LABELS.panel.buttonUndo)}</button>
          `;
        } else {
          // Pending: show both buttons
          actionsHtml = `
            <button class="lpf-btn lpf-btn--approve" data-action="approve" data-post-id="${escAttr(id)}" title="${escAttr(LABELS.badge.approveFilter)}">${escHtml(LABELS.panel.buttonHit)}</button>
            <button class="lpf-btn lpf-btn--reject" data-action="reject" data-post-id="${escAttr(id)}" title="${escAttr(LABELS.badge.rejectFilter)}">${escHtml(LABELS.panel.buttonMiss)}</button>
          `;
        }

        return `
        <div class="lpf-review-card ${statusClass}" data-post-id="${escAttr(id)}">
          <div class="lpf-review-card__header">
            <span class="lpf-review-card__author">${escHtml(author)}</span>
            <span class="lpf-review-card__category">${escHtml(classification.categoryLabel || 'Unknown')}</span>
          </div>
          <div class="lpf-review-card__preview lpf-review-card__preview--collapsed">${fullContent}</div>
          <button class="lpf-review-card__expand">${escHtml(LABELS.panel.showMore)}</button>
          <div class="lpf-review-card__reason">
            <em>${escHtml(classification.reason || '')}</em>
            <span class="lpf-review-card__confidence">${confidencePercent}%</span>
          </div>
          <div class="lpf-review-card__actions">${actionsHtml}</div>
        </div>
      `;
      })
      .join('');

    listElement.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        handleReviewAction(event);
      });
    });

    listElement.querySelectorAll('.lpf-review-card__expand').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const card = button.closest('.lpf-review-card');
        const preview = card.querySelector('.lpf-review-card__preview');
        const collapsed = preview.classList.toggle('lpf-review-card__preview--collapsed');
        button.textContent = collapsed ? LABELS.panel.showMore : LABELS.panel.showLess;
      });
    });
  }

  function handleReviewAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const postId = button.dataset.postId;
    const feedback = action === 'approve' ? 'approved' : 'rejected';

    const postElement = findPostElement(postId);
    const content = postElement ? getPostText(postElement) : '';
    const author = postElement ? getPostAuthor(postElement) : 'Unknown';

    // Process feedback (state + background)
    const updated = processFeedback(postId, feedback, content, author);

    // Apply element-specific visual changes
    applyPostElementClasses(postElement, updated);

    // Show appropriate toast
    showToast(
      feedback === 'approved' ? LABELS.toast.filterConfirmed : LABELS.toast.postRestored,
      'info'
    );

    // Update badge visibility if element exists
    if (postElement) {
      const badge = postElement.querySelector('.lpf-badge');
      if (badge) {
        updateBadgeVisibility(badge, updated);
      }
    }

    // Refresh UI
    refreshFeedbackUI();
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
    return string.replace(
      /[&"'<>]/g,
      (character) =>
        ({
          '&': '&amp;',
          '"': '&quot;',
          "'": '&#39;',
          '<': '&lt;',
          '>': '&gt;',
        })[character]
    );
  }

  // ─── Initialization ─────────────────────────────────────────────

  function isOnFeedPage() {
    const path = location.pathname;
    return path === '/' || path.startsWith('/feed');
  }

  async function waitForFeed(maxRetries = INIT_MAX_RETRIES) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const feed = findFeedList();
      if (feed) {
        console.log(`[LPF] Feed found after ${attempt + 1} attempt(s).`);
        return true;
      }
      await new Promise((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
    }
    console.log('[LPF] Feed not found after retries.');
    return false;
  }

  async function init() {
    // Skip if already initialized or not on a feed page
    if (state.initialized) {
      console.log('[LPF] Already initialized.');
      return;
    }

    // Get settings via safe messaging
    const settings = await sendMessage({ type: 'getSettings' });
    if (settings?.error === 'context_invalidated') return;

    state.enabled = settings?.enabled !== false;

    if (!state.enabled) {
      console.log('[LPF] LinkedIn Post Filter is disabled.');
      return;
    }

    // Check API key
    const apiCheck = await sendMessage({ type: 'checkApiKey' });
    if (apiCheck?.error === 'context_invalidated') return;

    if (!apiCheck?.configured) {
      showToast('LinkedOut: Please set your API key in extension options.', 'error');
    }

    // Create UI elements (always, so button is visible)
    createToggleButton();
    createReviewPanel();
    state.initialized = true;

    // If on feed page, wait for feed and start processing
    if (isOnFeedPage()) {
      const feedFound = await waitForFeed();
      if (feedFound) {
        processNewPosts();
      }
    }

    // Watch for new posts (infinite scroll)
    const observer = new MutationObserver((mutations) => {
      if (!state.contextValid) return;
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

    // Watch for SPA navigation
    setupSpaNavigationDetection();

    console.log('[LPF] LinkedIn Post Filter initialized.');
  }

  function setupSpaNavigationDetection() {
    // Detect URL changes (SPA navigation)
    const urlObserver = new MutationObserver(() => {
      if (location.href !== state.lastUrl) {
        const wasOnFeed = state.lastUrl.includes('/feed') || state.lastUrl.endsWith('.com/');
        const nowOnFeed = isOnFeedPage();
        state.lastUrl = location.href;

        console.log(`[LPF] SPA navigation detected: ${location.pathname}`);

        // If navigated to feed, re-scan for posts
        if (nowOnFeed && !wasOnFeed) {
          console.log('[LPF] Navigated to feed, scanning for posts...');
          waitForFeed().then((found) => {
            if (found) processNewPosts();
          });
        } else if (nowOnFeed) {
          // Still on feed, just process any new posts
          processNewPosts();
        }
      }
    });

    urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Message listener (for popup/options communication) ─────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggleEnabled') {
      state.enabled = message.enabled;
      if (!state.enabled) {
        document.querySelectorAll('.lpf-filtered').forEach((element) => {
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
      document.querySelectorAll('.lpf-filtered').forEach((element) => {
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
