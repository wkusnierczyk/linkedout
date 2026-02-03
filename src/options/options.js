document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });

  // ─── API Key ──────────────────────────────────────────────────
  const apiKeyInput = document.getElementById('api-key');
  const keyStatus = document.getElementById('key-status');
  const { configured } = await chrome.runtime.sendMessage({ type: 'checkApiKey' });
  keyStatus.textContent = configured ? 'API key is configured.' : 'No API key set.';

  document.getElementById('save-key-btn').addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    await chrome.storage.local.set({ apiKey: key });
    keyStatus.textContent = 'API key saved.';
    apiKeyInput.value = '';
  });

  // ─── Model ────────────────────────────────────────────────────
  const modelSelect = document.getElementById('model-select');
  if (settings.model) modelSelect.value = settings.model;
  modelSelect.addEventListener('change', async () => {
    settings.model = modelSelect.value;
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
  });

  // ─── Sensitivity ──────────────────────────────────────────────
  const radios = document.querySelectorAll('input[name="sensitivity"]');
  for (const r of radios) {
    r.checked = r.value === (settings.sensitivity || 'medium');
    r.addEventListener('change', async () => {
      settings.sensitivity = r.value;
      await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
    });
  }

  // ─── Categories ───────────────────────────────────────────────
  const catsEl = document.getElementById('categories');
  const sortedBuiltIn = Object.entries(settings.categories || {}).sort((a, b) =>
    (a[1].label || a[0]).localeCompare(b[1].label || b[0])
  );
  for (const [id, cat] of sortedBuiltIn) {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div>
        <label for="cat-${id}">${cat.label}</label>
        <div class="cat-desc">${cat.description}</div>
      </div>
      <input type="checkbox" id="cat-${id}" data-cat-id="${id}" ${cat.enabled ? 'checked' : ''}>
    `;
    catsEl.appendChild(row);
  }
  catsEl.addEventListener('change', async (e) => {
    const catId = e.target.dataset.catId;
    if (!catId || !settings.categories[catId]) return;
    settings.categories[catId].enabled = e.target.checked;
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
  });

  // ─── Custom Categories ────────────────────────────────────────
  const customEl = document.getElementById('custom-categories');

  function renderCustomCategories() {
    customEl.innerHTML = '';
    const sortedCustom = (settings.customCategories || []).slice().sort((a, b) =>
      (a.label || a.id).localeCompare(b.label || b.id)
    );
    for (const cat of sortedCustom) {
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div>
          <label>${cat.label}</label>
          <div class="cat-desc">${cat.description}</div>
        </div>
        <button data-remove="${cat.id}">Remove</button>
      `;
      customEl.appendChild(row);
    }
    customEl.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        settings.customCategories = (settings.customCategories || []).filter(
          (c) => c.id !== btn.dataset.remove
        );
        await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
        renderCustomCategories();
      });
    });
  }
  renderCustomCategories();

  document.getElementById('add-custom-btn').addEventListener('click', async () => {
    const id = document.getElementById('custom-id').value.trim().replace(/\s+/g, '_').toLowerCase();
    const label = document.getElementById('custom-label').value.trim();
    const desc = document.getElementById('custom-desc').value.trim();
    if (!id || !label || !desc) return;
    if (!settings.customCategories) settings.customCategories = [];
    settings.customCategories.push({ id, label, description: desc, enabled: true });
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
    document.getElementById('custom-id').value = '';
    document.getElementById('custom-label').value = '';
    document.getElementById('custom-desc').value = '';
    renderCustomCategories();
  });

  // ─── Keywords ─────────────────────────────────────────────────
  const keywordsEl = document.getElementById('keywords');

  function renderKeywords() {
    keywordsEl.innerHTML = '';
    for (const kw of settings.customKeywords || []) {
      const tag = document.createElement('span');
      tag.className = 'keyword-tag';
      tag.innerHTML = `${kw} <button data-kw="${kw}">&times;</button>`;
      keywordsEl.appendChild(tag);
    }
    keywordsEl.querySelectorAll('[data-kw]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        settings.customKeywords = (settings.customKeywords || []).filter(
          (k) => k !== btn.dataset.kw
        );
        await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
        renderKeywords();
      });
    });
  }
  renderKeywords();

  document.getElementById('add-keyword-btn').addEventListener('click', async () => {
    const input = document.getElementById('keyword-input');
    const kw = input.value.trim();
    if (!kw) return;
    if (!settings.customKeywords) settings.customKeywords = [];
    if (!settings.customKeywords.includes(kw)) {
      settings.customKeywords.push(kw);
      await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
    }
    input.value = '';
    renderKeywords();
  });

  // ─── Preference Profile ───────────────────────────────────────
  const profileBox = document.getElementById('profile-box');
  const profileUpdated = document.getElementById('profile-updated');
  const { profile, lastUpdated } = await chrome.runtime.sendMessage({
    type: 'getPreferenceProfile',
  });
  if (profile) {
    profileBox.textContent = profile;
    profileUpdated.textContent = `Last updated: ${new Date(lastUpdated).toLocaleString()}`;
  }

  document.getElementById('regen-profile-btn').addEventListener('click', async () => {
    profileBox.textContent = 'Regenerating...';
    const result = await chrome.runtime.sendMessage({ type: 'regenerateProfile' });
    profileBox.textContent = result.profile || 'Not enough data yet.';
    if (result.lastUpdated) {
      profileUpdated.textContent = `Last updated: ${new Date(result.lastUpdated).toLocaleString()}`;
    }
  });

  // ─── Data ─────────────────────────────────────────────────────
  document.getElementById('export-btn').addEventListener('click', async () => {
    const data = await chrome.runtime.sendMessage({ type: 'exportData' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedout-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('clear-btn').addEventListener('click', async () => {
    if (
      !confirm(
        'This will delete all feedback history, interaction data, and your learned preference profile. Continue?'
      )
    )
      return;
    await chrome.runtime.sendMessage({ type: 'clearHistory' });
    profileBox.textContent = 'No profile generated yet.';
    profileUpdated.textContent = '';
  });
});
