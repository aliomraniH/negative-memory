const state = {
  status: null,
  stats: null,
  tools: null,
  config: null,
};

document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    loadTabData(tab.dataset.tab);
  });
});

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function loadTabData(tab) {
  switch (tab) {
    case 'overview':
      await loadOverview();
      break;
    case 'setup':
      await loadSetup();
      break;
    case 'tools':
      await loadTools();
      break;
    case 'patterns':
      await loadPatterns();
      break;
    case 'sessions':
      await loadSessions();
      break;
  }
}

async function loadOverview() {
  try {
    const [status, stats] = await Promise.all([fetchJSON('/api/status'), fetchJSON('/api/stats')]);
    state.status = status;
    state.stats = stats;

    document.getElementById('db-status').innerHTML = status.database_connected
      ? '<span class="status-badge success"><span class="status-dot success"></span>Connected</span>'
      : '<span class="status-badge danger"><span class="status-dot danger"></span>Disconnected</span>';

    document.getElementById('ap-count').innerHTML = `<div class="stat-value">${stats.total_antipatterns}</div><div class="stat-label">${stats.embeddings_generated} with embeddings</div>`;

    const aiConfigured = status.openai_configured || status.anthropic_configured;
    const providerLabel = status.active_provider === 'openai' ? 'OpenAI' : 'Anthropic';
    document.getElementById('api-status').innerHTML = aiConfigured
      ? `<span class="status-badge success"><span class="status-dot success"></span>${providerLabel}</span><div class="stat-label mt-4" style="font-family:var(--font-mono);font-size:0.78rem">${status.provider_model}</div>`
      : '<span class="status-badge danger"><span class="status-dot danger"></span>Not Set</span>';

    document.getElementById('session-count').innerHTML = `<div class="stat-value">${stats.planning_sessions}</div><div class="stat-label">${stats.tool_invocations} tool calls logged</div>`;

    renderBarChart('cat-chart', stats.by_category, stats.total_antipatterns, categoryColors);
    renderBarChart('sev-chart', stats.by_severity, stats.total_antipatterns, severityColors);
    renderTopPatterns(stats.top_patterns);
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

const categoryColors = {
  security_vulnerability: '#ef4444',
  performance_issue: '#f59e0b',
  architecture_smell: '#8b5cf6',
  database_antipattern: '#3b82f6',
  devops_misconfiguration: '#06b6d4',
  error_handling: '#f97316',
  testing_gap: '#ec4899',
  data_integrity: '#22c55e',
};

const severityColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
  info: '#3b82f6',
};

const categoryLabels = {
  security_vulnerability: 'Security',
  performance_issue: 'Performance',
  architecture_smell: 'Architecture',
  database_antipattern: 'Database',
  devops_misconfiguration: 'DevOps',
  error_handling: 'Error Handling',
  testing_gap: 'Testing',
  data_integrity: 'Data Integrity',
};

function renderBarChart(containerId, data, total, colors) {
  const container = document.getElementById(containerId);
  if (!data || Object.keys(data).length === 0) {
    container.innerHTML = '<div class="loading">No data</div>';
    return;
  }

  const maxVal = Math.max(...Object.values(data));
  let html = '';

  for (const [key, val] of Object.entries(data)) {
    const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
    const color = colors[key] || '#6366f1';
    const label = categoryLabels[key] || key.replace(/_/g, ' ');
    html += `
      <div class="bar-row">
        <span class="bar-label">${label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="bar-count">${val}</span>
      </div>`;
  }

  container.innerHTML = html;
}

function renderTopPatterns(patterns) {
  const container = document.getElementById('top-patterns');
  if (!patterns || patterns.length === 0) {
    container.innerHTML = '<div class="loading">No patterns found</div>';
    return;
  }

  let html = `<table>
    <thead><tr>
      <th>Title</th>
      <th>Category</th>
      <th>Severity</th>
      <th>Surfaced</th>
      <th>Helpful</th>
      <th>Confidence</th>
    </tr></thead><tbody>`;

  for (const p of patterns) {
    html += `<tr>
      <td style="color:var(--text-primary);font-weight:500">${escapeHtml(p.title)}</td>
      <td><span class="category-tag">${categoryLabels[p.category] || p.category}</span></td>
      <td><span class="severity-tag ${p.severity}">${p.severity}</span></td>
      <td>${p.times_surfaced}</td>
      <td>${p.times_helpful}</td>
      <td>${(p.confidence_score * 100).toFixed(0)}%</td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function populateModelSelects(status) {
  const providerSelect = document.getElementById('provider-select');
  const providerModelSelect = document.getElementById('provider-model-select');
  const judgeProviderSelect = document.getElementById('judge-provider-select');
  const judgeSelect = document.getElementById('judge-model-select');
  const embedProviderSelect = document.getElementById('embed-provider-select');
  const embedSelect = document.getElementById('embed-model-select');

  const allModels = status.available_models || [];

  function getModelsFor(provider) {
    const found = allModels.find(m => m.provider === provider);
    return found ? found.models : [];
  }

  function populateSelect(selectEl, models, currentValue) {
    selectEl.innerHTML = models.map(m =>
      `<option value="${m}" ${m === currentValue ? 'selected' : ''}>${m}</option>`
    ).join('');
  }

  function bindProviderChange(providerEl, modelEl, currentModel) {
    populateSelect(modelEl, getModelsFor(providerEl.value), currentModel);
    if (!providerEl._listenerAdded) {
      providerEl.addEventListener('change', () => {
        populateSelect(modelEl, getModelsFor(providerEl.value), '');
      });
      providerEl._listenerAdded = true;
    }
  }

  providerSelect.value = status.active_provider || 'anthropic';
  judgeProviderSelect.value = status.judge_provider || 'openai';
  embedProviderSelect.value = status.embedding_provider || 'anthropic';

  bindProviderChange(providerSelect, providerModelSelect, status.provider_model);
  bindProviderChange(judgeProviderSelect, judgeSelect, status.judge_model);
  bindProviderChange(embedProviderSelect, embedSelect, status.embedding_model);
}

async function saveProviderSettings() {
  const provider = document.getElementById('provider-select').value;
  const provider_model = document.getElementById('provider-model-select').value;
  const judge_provider = document.getElementById('judge-provider-select').value;
  const judge_model = document.getElementById('judge-model-select').value;
  const embedding_provider = document.getElementById('embed-provider-select').value;
  const embedding_model = document.getElementById('embed-model-select').value;
  const statusEl = document.getElementById('provider-save-status');

  try {
    const res = await fetch('/api/settings/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, provider_model, judge_provider, judge_model, embedding_provider, embedding_model }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to save');
    statusEl.innerHTML = `<span class="status-badge success"><span class="status-dot success"></span>Applied: Provider=${result.active_provider}, Judge=${result.judge_provider}, Embed=${result.embedding_provider}</span>`;
    state.status = { ...state.status, ...result };
    setTimeout(() => { statusEl.innerHTML = ''; }, 5000);
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--danger);font-size:0.82rem">Failed to save: ${err.message}</span>`;
  }
}

async function loadSetup() {
  try {
    const [status, config] = await Promise.all([fetchJSON('/api/status'), fetchJSON('/api/mcp-config')]);
    state.status = status;
    state.config = config;

    populateModelSelects(status);

    function envRow(name, subtitle, isSet, preview) {
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:500">${name}</div>
            <div style="font-size:0.8rem;color:var(--text-muted)">${subtitle}</div>
          </div>
          ${isSet
            ? `<span class="status-badge success"><span class="status-dot success"></span>${preview || 'Set'}</span>`
            : '<span class="status-badge danger"><span class="status-dot danger"></span>Missing</span>'}
        </div>`;
    }

    let envHtml = envRow('DATABASE_URL', 'PostgreSQL connection', status.database_url_set, 'Set');
    envHtml += envRow('OPENAI_API_KEY', 'OpenAI API access', status.openai_configured, status.openai_key_preview);
    envHtml += envRow('ANTHROPIC_API_KEY', 'Anthropic API access', status.anthropic_configured, status.anthropic_key_preview);
    const pLabel = status.active_provider === 'openai' ? 'OpenAI' : 'Anthropic';
    const jLabel = status.judge_provider === 'openai' ? 'OpenAI' : 'Anthropic';
    const eLabel = status.embedding_provider === 'openai' ? 'OpenAI' : 'Anthropic';
    envHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:500">Provider Role</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">General AI completions</div>
        </div>
        <span style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary)">${pLabel} / ${status.provider_model}</span>
      </div>`;
    envHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:500">Judge Role</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">Plan critique & deep analysis</div>
        </div>
        <span style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary)">${jLabel} / ${status.judge_model}</span>
      </div>`;
    envHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0">
        <div>
          <div style="font-weight:500">Embedding Role</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">Anti-pattern search embeddings</div>
        </div>
        <span style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary)">${eLabel} / ${status.embedding_model}</span>
      </div>`;

    document.getElementById('env-status').innerHTML = envHtml;

    let stepsHtml = '';
    for (const step of config.setup_steps) {
      let isComplete = false;
      if (step.status_key === 'ai_key_set') isComplete = status.openai_configured || status.anthropic_configured;
      else if (step.status_key === 'database_url_set') isComplete = status.database_url_set;

      stepsHtml += `
        <div class="setup-step">
          <div class="step-number ${isComplete ? 'complete' : ''}">${isComplete ? '\u2713' : step.step}</div>
          <div class="step-content">
            <h4>${escapeHtml(step.title)}</h4>
            <p>${escapeHtml(step.description)}</p>
            ${step.command ? `<div class="code-block" style="margin-top:8px;padding:8px 12px"><code>${escapeHtml(step.command)}</code></div>` : ''}
          </div>
        </div>`;
    }
    document.getElementById('setup-steps').innerHTML = stepsHtml;

    const configJson = JSON.stringify(config.mcp_config, null, 2);
    document.getElementById('mcp-config-json').textContent = configJson;

    const endpointEl = document.getElementById('mcp-endpoint-url');
    if (endpointEl && config.mcp_endpoint) {
      endpointEl.textContent = config.mcp_endpoint;
    }

  } catch (err) {
    console.error('Failed to load setup:', err);
  }
}

async function loadTools() {
  try {
    const data = await fetchJSON('/api/tools');
    state.tools = data.tools;

    let html = '';
    for (const tool of data.tools) {
      html += `
        <div class="tool-card">
          <h3>${escapeHtml(tool.name)}</h3>
          <p>${escapeHtml(tool.description)}</p>
          <div class="usage">${escapeHtml(tool.usage)}</div>
          ${tool.required_params.length > 0 ? `
            <div class="params">
              ${tool.required_params.map((p) => `<span class="param-tag">${escapeHtml(p)}</span>`).join('')}
            </div>` : ''}
        </div>`;
    }
    document.getElementById('tools-grid').innerHTML = html;
  } catch (err) {
    console.error('Failed to load tools:', err);
  }
}

async function loadPatterns() {
  try {
    const category = document.getElementById('filter-category').value;
    const severity = document.getElementById('filter-severity').value;
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (severity) params.set('severity', severity);
    params.set('limit', '35');

    const data = await fetchJSON('/api/antipatterns?' + params.toString());

    let html = `<table>
      <thead><tr>
        <th>Title</th>
        <th>Category</th>
        <th>Severity</th>
        <th>Tech Stack</th>
        <th>Confidence</th>
        <th>Surfaced</th>
      </tr></thead><tbody>`;

    for (const ap of data.antipatterns) {
      const techTags = (ap.tech_stack || []).slice(0, 4).map((t) =>
        `<span class="param-tag">${escapeHtml(t)}</span>`
      ).join('');

      html += `<tr>
        <td>
          <div style="font-weight:500;color:var(--text-primary)">${escapeHtml(ap.title)}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${escapeHtml(ap.description?.substring(0, 100))}...</div>
        </td>
        <td><span class="category-tag">${categoryLabels[ap.category] || ap.category}</span></td>
        <td><span class="severity-tag ${ap.severity}">${ap.severity}</span></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap">${techTags}</div></td>
        <td>${(ap.confidence_score * 100).toFixed(0)}%</td>
        <td>${ap.times_surfaced}</td>
      </tr>`;
    }

    html += '</tbody></table>';
    html += `<div style="padding:12px;color:var(--text-muted);font-size:0.82rem">Showing ${data.antipatterns.length} of ${data.total} entries</div>`;
    document.getElementById('patterns-table').innerHTML = html;
  } catch (err) {
    console.error('Failed to load patterns:', err);
  }
}

async function loadSessions() {
  try {
    const stats = state.stats || await fetchJSON('/api/stats');

    if (!stats.recent_sessions || stats.recent_sessions.length === 0) {
      document.getElementById('sessions-table').innerHTML = '<div class="loading">No judge sessions recorded yet. Submit a plan critique to see results here.</div>';
      return;
    }

    let html = `<table>
      <thead><tr>
        <th>Task</th>
        <th>Status</th>
        <th>Risk Score</th>
        <th>Date</th>
      </tr></thead><tbody>`;

    for (const s of stats.recent_sessions) {
      const date = new Date(s.created_at).toLocaleString();
      const riskColor = s.risk_score > 0.7 ? 'danger' : s.risk_score > 0.3 ? 'warning' : 'success';

      html += `<tr>
        <td style="color:var(--text-primary);font-weight:500;max-width:400px">${escapeHtml(s.task_description?.substring(0, 100))}</td>
        <td><span class="status-badge ${s.status === 'critiqued' ? 'warning' : s.status === 'approved' ? 'success' : 'danger'}">${s.status}</span></td>
        <td><span class="status-badge ${riskColor}">${s.risk_score != null ? (s.risk_score * 100).toFixed(0) + '%' : 'N/A'}</span></td>
        <td style="color:var(--text-muted);font-size:0.82rem">${date}</td>
      </tr>`;
    }

    html += '</tbody></table>';
    document.getElementById('sessions-table').innerHTML = html;
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

document.getElementById('filter-category').addEventListener('change', loadPatterns);
document.getElementById('filter-severity').addEventListener('change', loadPatterns);


function copyConfig() {
  const text = document.getElementById('mcp-config-json').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('#mcp-config .copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TOTAL_TESTS = 16;
let healthTestsRunning = false;

function setTestStatus(testId, status, icon) {
  const card = document.getElementById('test-' + testId);
  if (!card) return;
  card.className = 'health-test-card status-' + status;
  const iconEl = card.querySelector('.health-test-icon');
  if (iconEl) {
    iconEl.className = 'health-test-icon ' + status;
    const icons = { pass: '\u2713', fail: '\u2717', warn: '!', running: '\u2026', skipped: '-' };
    iconEl.textContent = icons[status] || '-';
  }
}

function setTestResult(testId, result) {
  setTestStatus(testId, result.status);
  const resultEl = document.getElementById('test-' + testId)?.querySelector('.health-test-result');
  if (!resultEl) return;

  let html = `<div class="health-test-message">
    <span>${escapeHtml(result.message)}</span>
    <span class="duration">${result.duration_ms}ms</span>
  </div>`;

  if (result.details) {
    const detailId = 'detail-' + testId;
    html += `<button class="health-test-details-toggle" onclick="toggleDetails('${detailId}')">Show details</button>`;
    html += `<div class="health-test-details" id="${detailId}" style="display:none">${escapeHtml(result.details)}</div>`;
  }

  resultEl.innerHTML = html;
}

function toggleDetails(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const btn = el.previousElementSibling;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (btn) btn.textContent = 'Hide details';
  } else {
    el.style.display = 'none';
    if (btn) btn.textContent = 'Show details';
  }
}

function updateHealthSummary() {
  const cards = document.querySelectorAll('.health-test-card');
  let pass = 0, fail = 0, warn = 0, total = 0;
  cards.forEach((card) => {
    if (card.classList.contains('status-pass')) { pass++; total++; }
    else if (card.classList.contains('status-fail')) { fail++; total++; }
    else if (card.classList.contains('status-warn')) { warn++; total++; }
  });
  const el = document.getElementById('health-summary');
  if (total === 0) {
    el.textContent = '';
    return;
  }
  const parts = [];
  if (pass) parts.push(pass + ' passed');
  if (warn) parts.push(warn + ' warnings');
  if (fail) parts.push(fail + ' failed');
  el.innerHTML = parts.join(' / ') + ` <span style="color:var(--text-muted)">(${total} total)</span>`;
}

async function runOneTest(testId) {
  setTestStatus(testId, 'running');
  const resultEl = document.getElementById('test-' + testId)?.querySelector('.health-test-result');
  if (resultEl) resultEl.innerHTML = '';

  try {
    const res = await fetch('/api/health/run/' + testId);
    const result = await res.json();
    setTestResult(testId, result);
  } catch (err) {
    setTestResult(testId, { status: 'fail', message: err.message, duration_ms: 0 });
  }
  updateHealthSummary();
}

async function runAllTests() {
  if (healthTestsRunning) return;
  healthTestsRunning = true;

  const btn = document.getElementById('run-all-tests-btn');
  btn.textContent = 'Running...';
  btn.disabled = true;

  const progressEl = document.getElementById('health-progress');
  const progressBar = document.getElementById('health-progress-bar');
  const progressCount = document.getElementById('health-progress-count');
  const progressLabel = document.getElementById('health-progress-label');
  progressEl.style.display = 'block';
  progressBar.style.width = '0%';

  document.querySelectorAll('.health-test-card').forEach((card) => {
    card.className = 'health-test-card';
    const icon = card.querySelector('.health-test-icon');
    if (icon) { icon.className = 'health-test-icon'; icon.textContent = '-'; }
    const result = card.querySelector('.health-test-result');
    if (result) result.innerHTML = '';
  });
  document.getElementById('health-summary').textContent = '';

  let completed = 0;

  try {
    const response = await fetch('/api/health/run-all');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === 'start') {
          setTestStatus(data.testId, 'running');
          progressLabel.textContent = 'Running: ' + data.testId.replace(/_/g, ' ');
        } else if (data.type === 'result') {
          setTestResult(data.testId, data.result);
          completed++;
          const pct = (completed / TOTAL_TESTS) * 100;
          progressBar.style.width = pct + '%';
          progressCount.textContent = completed + '/' + TOTAL_TESTS;
        } else if (data.type === 'done') {
          break;
        }
      }
    }
  } catch (err) {
    console.error('Health check stream error:', err);
  }

  progressLabel.textContent = 'Complete';
  progressBar.style.width = '100%';
  btn.textContent = 'Run All Tests';
  btn.disabled = false;
  healthTestsRunning = false;
  updateHealthSummary();
}

loadOverview();
