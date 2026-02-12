document.addEventListener('DOMContentLoaded', async () => {
  const enabledToggle = document.getElementById('enabled-toggle');
  const apiWarning = document.getElementById('api-warning');
  const categoriesEl = document.getElementById('categories');

  // Load state
  const [settings, stats, apiStatus] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getSettings' }),
    chrome.runtime.sendMessage({ type: 'getStats' }),
    chrome.runtime.sendMessage({ type: 'checkApiKey' }),
  ]);

  // API key warning (only relevant in LLM mode)
  if (!apiStatus.configured && settings.filterMode === 'llm') {
    apiWarning.hidden = false;
  }

  // Enable toggle
  enabledToggle.checked = settings.enabled !== false;
  enabledToggle.addEventListener('change', async () => {
    settings.enabled = enabledToggle.checked;
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs
        .sendMessage(tab.id, { type: 'toggleEnabled', enabled: settings.enabled })
        .catch(() => {});
    }
  });

  // Stats
  document.getElementById('stat-filtered').textContent = stats.filtered || 0;
  document.getElementById('stat-approved').textContent = stats.approved || 0;
  document.getElementById('stat-rejected').textContent = stats.rejected || 0;

  // Categories (sorted alphabetically by label)
  const allCats = { ...settings.categories };
  for (const custom of settings.customCategories || []) {
    allCats[custom.id] = custom;
  }

  const sortedCats = Object.entries(allCats).sort((a, b) =>
    (a[1].label || a[0]).localeCompare(b[1].label || b[0])
  );

  for (const [id, cat] of sortedCats) {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <label for="cat-${id}">${cat.label}</label>
      <input type="checkbox" id="cat-${id}" data-cat-id="${id}" ${cat.enabled ? 'checked' : ''}>
    `;
    categoriesEl.appendChild(row);
  }

  categoriesEl.addEventListener('change', async (e) => {
    const catId = e.target.dataset.catId;
    if (!catId) return;
    if (settings.categories[catId]) {
      settings.categories[catId].enabled = e.target.checked;
    } else {
      const custom = (settings.customCategories || []).find((c) => c.id === catId);
      if (custom) custom.enabled = e.target.checked;
    }
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
  });

  // Rescan
  document.getElementById('rescan-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'rescanFeed' }).catch(() => {});
    }
    window.close();
  });

  // Settings
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Open options link
  document.getElementById('open-options-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
