const API = '/api';

function getCsrf() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

async function apiFetch(path, options = {}) {
  return fetch(API + path, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

async function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(body),
  });
}

async function apiPatch(path, body) {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(body),
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  const breadcrumb = document.querySelector('.current-page');
  const loginScreen = document.querySelector('.login-screen');
  const appContainer = document.querySelector('.app-container');
  const loginForm = document.getElementById('login-form');
  const userNameDisplay = document.querySelector('.user-name');
  const logoutBtn = document.querySelector('.logout-btn');
  const passwordToggle = document.querySelector('.password-toggle');
  const passwordInput = document.getElementById('login-password');
  const imageUpload = document.getElementById('imageUpload');
  const fileInput = document.getElementById('fileInput');

  // ── Login ──────────────────────────────────────────────────────────────────
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;
    try {
      const res = await apiPost('/auth/login/', { username, password });
      const data = await res.json();
      if (!res.ok) { showLoginError(data.error || 'Login failed.'); return; }
      clearLoginError();
      userNameDisplay.textContent = data.username;
      loginScreen.classList.add('hidden');
      appContainer.classList.remove('hidden');
      loadInitialData();
    } catch {
      showLoginError('Cannot connect to server. Make sure the backend is running at http://127.0.0.1:8000');
    }
  });

  function showLoginError(msg) {
    let err = document.getElementById('login-error');
    if (!err) {
      err = document.createElement('p');
      err.id = 'login-error';
      err.style.cssText = 'color:#dc2626;font-size:13px;margin-top:-8px;font-weight:600;';
      loginForm.querySelector('.login-submit').before(err);
    }
    err.textContent = msg;
  }

  function clearLoginError() {
    const err = document.getElementById('login-error');
    if (err) err.remove();
  }

  // ── Password toggle ────────────────────────────────────────────────────────
  passwordToggle.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    passwordToggle.textContent = type === 'password' ? '👁️' : '🙈';
  });

  // ── Logout ─────────────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    await apiPost('/auth/logout/', {});
    loginScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
    loginForm.reset();
    userNameDisplay.textContent = 'Username';
    passwordInput.type = 'password';
    passwordToggle.textContent = '👁️';
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const targetPage = item.dataset.page;
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      breadcrumb.textContent = item.textContent.trim();
      views.forEach(view => view.classList.remove('active'));
      const targetView = document.getElementById(`${targetPage}-view`);
      if (targetView) targetView.classList.add('active');
      if (targetPage === 'document') loadProjectsDatalist();
      if (targetPage === 'reports') loadReports();
      if (targetPage === 'projects') loadProjects();
      if (targetPage === 'dashboard') loadDashboard();
      if (targetPage === 'environmental') loadEnvironmental();
      if (targetPage === 'settings') loadSettings();
    });
  });

  // ── Image upload ───────────────────────────────────────────────────────────
  if (imageUpload && fileInput) {
    imageUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        const p = imageUpload.querySelector('p');
        if (p) p.textContent = `📷 ${fileInput.files[0].name}`;
      }
    });
  }

  // ── Save inspection → Report ───────────────────────────────────────────────
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const projectName = document.getElementById('projectName').value.trim();
      const leadInspector = document.getElementById('leadInspector').value.trim();
      const inspectionDate = document.getElementById('inspectionDate').value;
      const statusVal = document.getElementById('status').value;
      const riskScoreRaw = document.getElementById('riskScore').value.trim();
      const locationVal = document.getElementById('location').value.trim();
      const notesVal = document.getElementById('inspectionNote').value.trim();

      if (!projectName) { alert('Please enter a Project Name.'); return; }
      if (!inspectionDate) { alert('Please enter an Inspection Date.'); return; }

      const riskScore = parseFloat(riskScoreRaw);
      if (isNaN(riskScore) || riskScore < 0 || riskScore > 10) {
        alert('Risk Score must be a number between 0 and 10.');
        return;
      }

      saveBtn.innerHTML = '⏳ Saving...';
      saveBtn.disabled = true;

      try {
        const projectId = await findOrCreateProject(projectName);
        if (!projectId) { alert('Failed to create project.'); return; }

        const res = await apiPost('/reports/', {
          title: projectName,
          project: projectId,
          date: inspectionDate,
          location: locationVal || '—',
          status: statusVal || 'open',
          risk_score: riskScore,
          key_findings: `Inspector: ${leadInspector || 'N/A'}\n${notesVal}`.trim(),
        });

        if (!res.ok) {
          const err = await res.json();
          alert('Save failed: ' + JSON.stringify(err));
          return;
        }

        clearDocumentForm();
        await Promise.all([loadReports(), loadStats()]);
        alert('Inspection saved successfully!');
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        saveBtn.innerHTML = '💾 Save';
        saveBtn.disabled = false;
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function findOrCreateProject(name) {
    const res = await apiFetch(`/projects/?name=${encodeURIComponent(name)}`);
    if (res.ok) {
      const data = await res.json();
      const results = data.results || data;
      if (results.length > 0) return results[0].id;
    }
    const createRes = await apiPost('/projects/', { name, location: name, status: 'active' });
    if (createRes.ok) {
      const project = await createRes.json();
      return project.id;
    }
    return null;
  }

  async function loadProjectsDatalist() {
    const datalist = document.getElementById('projects-list');
    if (!datalist) return;
    const res = await apiFetch('/projects/');
    if (!res.ok) return;
    const data = await res.json();
    const projects = data.results || data;
    datalist.innerHTML = projects.map(p => `<option value="${p.name}">`).join('');
  }

  function clearDocumentForm() {
    ['projectName', 'leadInspector', 'inspectionDate', 'riskScore', 'location', 'inspectionNote'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.value = 'open';
    if (fileInput) fileInput.value = '';
    const p = imageUpload ? imageUpload.querySelector('p') : null;
    if (p) p.innerHTML = '📷 Drop your images, or <span>browse</span>';
  }

  const STATUS_META = {
    open:      { label: 'Open',        bg: '#f1f5f9', color: '#475569' },
    in_review: { label: 'In Review',   bg: '#dbeafe', color: '#1e40af' },
    critical:  { label: 'Critical',    bg: '#fee2e2', color: '#991b1b' },
    completed: { label: 'Completed',   bg: '#dcfce7', color: '#166534' },
  };

  function statusBadgeHtml(status) {
    const m = STATUS_META[status] || STATUS_META.open;
    return `<span class="report-status-badge" style="background:${m.bg};color:${m.color}">${m.label}</span>`;
  }

  function riskColor(score) {
    return score >= 8 ? '#dc2626' : score >= 6 ? '#f97316' : score >= 4 ? '#eab308' : '#22c55e';
  }

  let selectedRow = null;
  let currentReport = null;

  async function loadReports() {
    const [repRes, projRes] = await Promise.all([
      apiFetch('/reports/'),
      apiFetch('/projects/'),
    ]);
    if (!repRes.ok) return;

    const repData  = await repRes.json();
    const reports  = repData.results || repData;

    if (projRes.ok) {
      const projData = await projRes.json();
      const projects = projData.results || projData;
      const titleEl  = document.getElementById('reports-header-title');
      if (titleEl && projects.length)
        titleEl.textContent = `REPORTS › ${projects[0].name.toUpperCase()}`;
    }

    renderReports(reports);
  }

  function renderReports(reports) {
    const tbody = document.querySelector('#reports-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!reports.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">No reports yet.</td></tr>';
      return;
    }

    reports.forEach(r => {
      const tr = document.createElement('tr');
      const score = parseFloat(r.risk_score);
      tr.innerHTML = `
        <td style="font-weight:700;color:#475569;font-size:12px">${r.report_id}</td>
        <td style="font-weight:600">${r.title}</td>
        <td>${r.date}</td>
        <td>${r.location}</td>
        <td>${statusBadgeHtml(r.status)}</td>
        <td>${r.lead_inspector_name || '—'}</td>
        <td style="font-weight:800;color:${riskColor(score)}">${score.toFixed(1)}</td>
      `;
      tr.addEventListener('click', () => {
        if (selectedRow) selectedRow.classList.remove('selected');
        tr.classList.add('selected');
        selectedRow = tr;
        showPreview(r);
      });
      tbody.appendChild(tr);
    });

    // Auto-select first row
    if (tbody.firstElementChild) tbody.firstElementChild.click();
  }

  function showPreview(r) {
    currentReport = r;
    document.getElementById('preview-empty').classList.add('hidden');
    const content = document.getElementById('preview-content');
    content.classList.remove('hidden');

    const score = parseFloat(r.risk_score);
    setEl('prev-report-id',  r.report_id);
    setEl('prev-title',      r.title);
    setEl('prev-date',       r.date);
    setEl('prev-location',   r.location);
    setEl('prev-inspector',  r.lead_inspector_name || '—');
    setEl('prev-findings',   r.key_findings || '—');

    const riskEl = document.getElementById('prev-risk');
    if (riskEl) { riskEl.textContent = `${score.toFixed(1)} / 10`; riskEl.style.color = riskColor(score); riskEl.style.fontWeight = '800'; }

    const statusBadge = document.getElementById('prev-status-badge');
    if (statusBadge) statusBadge.innerHTML = statusBadgeHtml(r.status);
  }

  // ── Full report modal ───────────────────────────────────────────────────────
  document.getElementById('open-report-btn')?.addEventListener('click', () => {
    if (!currentReport) return;
    const r = currentReport;
    const score = parseFloat(r.risk_score);

    setEl('modal-report-id',  r.report_id);
    setEl('modal-title',      r.title);
    setEl('modal-date',       r.date);
    setEl('modal-project',    r.project_name || '—');
    setEl('modal-location',   r.location);
    setEl('modal-inspector',  r.lead_inspector_name || '—');
    setEl('modal-findings',   r.key_findings || '—');

    const modalRisk = document.getElementById('modal-risk');
    if (modalRisk) { modalRisk.textContent = `${score.toFixed(1)} / 10`; modalRisk.style.color = riskColor(score); modalRisk.style.fontWeight = '800'; }

    const modalStatus = document.getElementById('modal-status');
    if (modalStatus) modalStatus.innerHTML = statusBadgeHtml(r.status);

    document.getElementById('report-modal').classList.remove('hidden');
  });

  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    document.getElementById('report-modal').classList.add('hidden');
  });

  document.getElementById('report-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('report-modal'))
      document.getElementById('report-modal').classList.add('hidden');
  });

  async function loadStats() {
    const res = await apiFetch('/stats/');
    if (!res.ok) return;
    const s = await res.json();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    // Dashboard stat cards
    set('stat-active-projects',   s.active_projects);
    set('stat-critical-reports',  s.critical_risk_reports);
    set('stat-in-review',         s.reports_in_review);
    set('stat-completed-repairs', s.completed_repairs);
    // Reports page counters
    set('open-count',      s.total_open_reports);
    set('review-count',    s.reports_in_review);
    set('critical-count',  s.critical_risk_reports);
    set('completed-count', s.total_completed_reports);
  }

  // ── Dashboard panels ────────────────────────────────────────────────────────
  async function loadDashboard() {
    await Promise.all([loadDashboardHotspots(), loadDashboardMaintenance(), loadDashboardTrend(), loadGeospatialOverview()]);
  }

  async function loadGeospatialOverview() {
    const [projRes, envRes, zonesRes] = await Promise.all([
      apiFetch('/projects/'),
      apiFetch('/environmental-risks/'),
      apiFetch('/geospatial-zones/'),
    ]);

    const proj  = projRes.ok  ? ((await projRes.json()).results  || [])[0] : null;
    const env   = envRes.ok   ? ((await envRes.json()).results   || [])[0] : null;
    const zones = zonesRes.ok ? ((await zonesRes.json()).results || [])    : [];

    if (proj) {
      setEl('geo-popup-name',     proj.name);
      setEl('geo-popup-location', proj.location);
    }
    if (env) {
      const score = env.overall_risk_score;
      const scoreEl = document.getElementById('geo-popup-score');
      if (scoreEl) {
        scoreEl.textContent = `Overall Risk: ${score} / 10`;
        scoreEl.style.color = score >= 8 ? '#dc2626' : score >= 6 ? '#f97316' : '#eab308';
        scoreEl.style.fontWeight = '700';
      }
    }

    const zoneLabels = document.getElementById('geo-zone-labels');
    if (zoneLabels) {
      const zoneColors = {
        fault_line: '#dc2626', liquefaction: '#f97316',
        erosion: '#eab308', flood: '#3b82f6', general: '#6366f1',
      };
      const riskLabels = { zone_a: 'Zone A', zone_b: 'Zone B', zone_c: 'Zone C' };
      zoneLabels.innerHTML = zones.length
        ? zones.map(z => {
            const c = zoneColors[z.zone_type] || '#94a3b8';
            const label = z.name.length > 22 ? z.name.slice(0, 22) + '…' : z.name;
            return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
              background:${c}22;color:${c};padding:3px 8px;border-radius:999px;margin:2px 2px 0 0;">
              <span style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0;"></span>
              ${label} <span style="opacity:0.65">(${riskLabels[z.risk_level] || z.risk_level})</span>
            </span>`;
          }).join('')
        : '<span style="font-size:11px;color:#94a3b8;">No zones recorded.</span>';
    }
  }

  async function loadDashboardHotspots() {
    const plan = document.getElementById('hotspot-floor-plan');
    const tooltip = document.getElementById('hotspot-tooltip');
    if (!plan || !tooltip) return;

    const res = await apiFetch('/risk-hotspots/');
    if (!res.ok) return;
    const data = await res.json();
    const hotspots = data.results || data;

    plan.innerHTML = '';
    hotspots.forEach(h => {
      const dot = document.createElement('div');
      dot.className = `hotspot ${h.severity}`;
      dot.style.top  = `${h.position_y}%`;
      dot.style.left = `${h.position_x}%`;

      dot.addEventListener('mouseenter', e => {
        tooltip.innerHTML = `<strong>${h.title}</strong><br>${h.description}`;
        tooltip.classList.add('visible');
      });
      dot.addEventListener('mousemove', e => {
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top  = (e.clientY - 10) + 'px';
      });
      dot.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));

      plan.appendChild(dot);
    });
  }

  async function loadDashboardMaintenance() {
    const tbody = document.querySelector('.priorities-table tbody');
    if (!tbody) return;

    const res = await apiFetch('/maintenance-priorities/');
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.results || data).slice(0, 6);

    const statusStyle = {
      pending:     'background:#fef3c7;color:#92400e',
      in_progress: 'background:#dbeafe;color:#1e40af',
      completed:   'background:#dcfce7;color:#166534',
      deferred:    'background:#f1f5f9;color:#64748b',
    };
    const statusLabel = {
      pending: 'Pending', in_progress: 'In Progress',
      completed: 'Completed', deferred: 'Deferred',
    };

    tbody.innerHTML = items.map(item => {
      const score = parseFloat(item.risk_score);
      const scoreColor = score >= 8 ? '#dc2626' : score >= 5 ? '#f97316' : '#22c55e';
      return `<tr>
        <td><input type="checkbox"></td>
        <td style="font-weight:600">${item.title}</td>
        <td>${item.location}</td>
        <td><span style="font-weight:800;color:${scoreColor}">${score.toFixed(1)}</span></td>
        <td><span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${statusStyle[item.status] || ''}">${statusLabel[item.status] || item.status}</span></td>
      </tr>`;
    }).join('');
  }

  async function loadDashboardTrend() {
    const container = document.getElementById('trend-chart-container');
    if (!container) return;

    const res = await apiFetch('/damage-trends/');
    if (!res.ok) return;
    const data = await res.json();
    const trends = data.results || data;
    if (!trends.length) return;

    // Group by severity and sort by date
    const bySev = {};
    trends.forEach(t => {
      if (!bySev[t.severity]) bySev[t.severity] = [];
      bySev[t.severity].push(t);
    });
    Object.values(bySev).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));

    const dates = [...new Set(trends.map(t => t.date))].sort();
    const W = 480, H = 190;
    const pad = { t: 16, r: 16, b: 28, l: 28 };
    const cW = W - pad.l - pad.r;
    const cH = H - pad.t - pad.b;
    const maxVal = 10;
    const x = i  => pad.l + (i / (dates.length - 1)) * cW;
    const y = v  => pad.t + cH - (v / maxVal) * cH;

    const palette = { critical: '#dc2626', high: '#f97316', moderate: '#f59e0b', low: '#22c55e' };

    // Grid lines
    const grid = [0, 2, 4, 6, 8, 10].map(v => `
      <line x1="${pad.l}" y1="${y(v)}" x2="${W - pad.r}" y2="${y(v)}" stroke="#e2e8f0" stroke-width="1"/>
      <text x="${pad.l - 4}" y="${y(v) + 4}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>
    `).join('');

    // Month labels
    const xLabels = dates.map((d, i) => {
      const label = new Date(d + 'T00:00:00').toLocaleString('default', { month: 'short' });
      return `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#94a3b8">${label}</text>`;
    }).join('');

    // Lines + dots per severity
    const lines = Object.entries(bySev).map(([sev, pts]) => {
      const color = palette[sev] || '#94a3b8';
      const polyPts = pts.map(p => `${x(dates.indexOf(p.date))},${y(p.value)}`).join(' ');
      const dots = pts.map(p =>
        `<circle cx="${x(dates.indexOf(p.date))}" cy="${y(p.value)}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`
      ).join('');
      return `
        <polyline points="${polyPts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}`;
    }).join('');

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="display:block;">
        ${grid}${xLabels}${lines}
      </svg>`;
  }

  // ── Environmental View ─────────────────────────────────────────────────────
  let envRiskId = null;

  async function loadEnvironmental() {
    const [envRes, zonesRes] = await Promise.all([
      apiFetch('/environmental-risks/'),
      apiFetch('/geospatial-zones/'),
    ]);
    if (!envRes.ok) return;

    const envData   = await envRes.json();
    const zonesData = zonesRes.ok ? await zonesRes.json() : { results: [] };
    const env   = (envData.results  || envData)[0];
    const zones = zonesData.results || zonesData;

    if (!env) return;
    envRiskId = env.id;

    // ── Fetch project info once ────────────────────────────────────────────
    const projRes = await apiFetch(`/projects/${env.project}/`);
    const proj = projRes.ok ? await projRes.json() : null;

    // ── Map badge ──────────────────────────────────────────────────────────
    if (proj) {
      setEl('env-badge-name',     proj.name);
      setEl('env-badge-location', proj.location);
    }
    const scoreColor = env.overall_risk_score >= 8 ? '#dc2626'
                     : env.overall_risk_score >= 6 ? '#f97316' : '#eab308';
    const el = document.getElementById('env-badge-score');
    if (el) {
      el.textContent = `Overall Risk: ${env.overall_risk_score} / 10`;
      el.style.color = scoreColor;
    }

    // ── Panel subtitle ─────────────────────────────────────────────────────
    const subtitle = document.getElementById('env-project-subtitle');
    if (subtitle && proj) subtitle.textContent = proj.name;

    // ── Select dropdowns ───────────────────────────────────────────────────
    const faultSel = document.getElementById('env-fault-select');
    if (faultSel) faultSel.value = env.fault_line_proximity;

    const liqSel = document.getElementById('env-liq-select');
    if (liqSel) liqSel.value = env.soil_liquefaction_risk;

    const erosionSel = document.getElementById('env-erosion-select');
    if (erosionSel) erosionSel.value = env.erosion_potential;

    // ── Risk score input + meter ───────────────────────────────────────────
    const riskInput = document.getElementById('env-risk-score-input');
    if (riskInput) {
      riskInput.value = env.overall_risk_score;
      riskInput.oninput = () => updateEnvMeter(parseFloat(riskInput.value) || 0);
    }
    const score = env.overall_risk_score;
    updateEnvMeter(score);

    // ── Geospatial zones ───────────────────────────────────────────────────
    const zonesList = document.getElementById('env-zones-list');
    if (zonesList) {
      const zoneColors = {
        fault_line:   '#dc2626',
        liquefaction: '#f97316',
        erosion:      '#eab308',
        flood:        '#3b82f6',
        general:      '#6366f1',
      };
      const riskLabels = { zone_a: 'Zone A', zone_b: 'Zone B', zone_c: 'Zone C' };
      zonesList.innerHTML = zones.length
        ? zones.map(z => `
            <div class="env-zone-tag">
              <span class="env-zone-dot" style="background:${zoneColors[z.zone_type] || '#94a3b8'}"></span>
              <span>${z.name} <span style="opacity:0.6">(${riskLabels[z.risk_level] || z.risk_level})</span></span>
            </div>`).join('')
        : '<span style="font-size:12px;color:#94a3b8;">No zones recorded.</span>';
    }

    // ── Additional analysis ────────────────────────────────────────────────
    const textarea = document.getElementById('env-additional-analysis');
    if (textarea) textarea.value = env.additional_analysis || '';

    // ── Save button ────────────────────────────────────────────────────────
    const saveBtn = document.getElementById('env-save-btn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!envRiskId) return;
        saveBtn.innerHTML = '⏳ Saving…';
        saveBtn.disabled  = true;
        const res = await apiPatch(`/environmental-risks/${envRiskId}/`, {
          fault_line_proximity:   document.getElementById('env-fault-select')?.value,
          soil_liquefaction_risk: document.getElementById('env-liq-select')?.value,
          erosion_potential:      document.getElementById('env-erosion-select')?.value,
          overall_risk_score:     parseFloat(document.getElementById('env-risk-score-input')?.value) || 0,
          additional_analysis:    document.getElementById('env-additional-analysis')?.value || '',
        });
        saveBtn.innerHTML = '💾 Save Analysis';
        saveBtn.disabled  = false;
        if (res.ok) {
          const updated = await res.json();
          updateEnvMeter(updated.overall_risk_score);
          alert('Changes saved.');
        } else {
          alert('Save failed.');
        }
      };
    }
  }

  function updateEnvMeter(score) {
    const fill = document.getElementById('env-risk-fill');
    if (fill) fill.style.width = `${Math.max(0, (1 - score / 10) * 100).toFixed(1)}%`;
    const riskLevel = score >= 8 ? 'critical' : score >= 6 ? 'high' : score >= 4 ? 'moderate' : 'low';
    const label = document.getElementById('env-risk-label');
    if (label) { label.textContent = riskLevel.toUpperCase(); label.className = `risk-label ${riskLevel}`; }
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async function loadSettings() {
    const username = document.querySelector('.user-name')?.textContent?.trim() || '—';
    setEl('s-username', username);

    const roleEl = document.getElementById('s-role');
    if (roleEl) {
      const isAdmin = username.toLowerCase() === 'admin';
      roleEl.textContent = isAdmin ? 'Administrator' : 'Inspector';
      roleEl.style.background = isAdmin ? '#dbeafe' : '#dcfce7';
      roleEl.style.color      = isAdmin ? '#1e40af' : '#166534';
    }

    setEl('s-last-login', new Date().toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }));

    const [repRes, inspRes, projRes, zonesRes] = await Promise.all([
      apiFetch('/reports/'),
      apiFetch('/inspections/'),
      apiFetch('/projects/'),
      apiFetch('/geospatial-zones/'),
    ]);

    if (repRes.ok)  { const d = await repRes.json();  setEl('s-total-reports',      d.count ?? (d.results || d).length); }
    if (inspRes.ok) { const d = await inspRes.json(); setEl('s-total-inspections',   d.count ?? (d.results || d).length); }

    if (projRes.ok) {
      const d = await projRes.json();
      const projects = d.results || d;
      const active = projects.find(p => p.status === 'active') || projects[0];
      if (active) {
        setEl('s-active-project',  active.name);
        setEl('s-project-status',  active.status === 'active' ? 'Active Monitoring' : active.status);
      }
    }

    if (zonesRes.ok) {
      const d = await zonesRes.json();
      const zones = d.results || d;
      setEl('s-zones-count', `${zones.length} zone${zones.length !== 1 ? 's' : ''}`);
      const hasA = zones.some(z => z.risk_level === 'zone_a');
      const hasB = zones.some(z => z.risk_level === 'zone_b');
      const riskEl = document.getElementById('s-risk-level');
      if (riskEl) {
        riskEl.textContent      = hasA ? 'Critical' : hasB ? 'Moderate' : 'Low';
        riskEl.style.background = hasA ? '#fee2e2' : hasB ? '#fef3c7' : '#dcfce7';
        riskEl.style.color      = hasA ? '#991b1b' : hasB ? '#92400e' : '#166634';
      }
    }
  }

  function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  async function loadInitialData() {
    await Promise.all([loadReports(), loadStats(), loadProjects(), loadDashboard(), loadEnvironmental()]);
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = '<p style="color:#94a3b8;padding:12px;">Loading projects…</p>';

    const res = await apiFetch('/projects/');
    if (!res.ok) { grid.innerHTML = '<p style="color:#dc2626;">Failed to load projects.</p>'; return; }

    const data = await res.json();
    const projects = data.results || data;

    if (!projects.length) {
      grid.innerHTML = '<p style="color:#94a3b8;padding:12px;">No projects yet.</p>';
      return;
    }

    const statusMeta = {
      active:    { label: 'Active',    bg: '#dcfce7', color: '#166534' },
      completed: { label: 'Completed', bg: '#dbeafe', color: '#1e40af' },
      on_hold:   { label: 'On Hold',   bg: '#fef3c7', color: '#92400e' },
      cancelled: { label: 'Cancelled', bg: '#fee2e2', color: '#991b1b' },
    };

    const bodyGradients = {
      active:    'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #0ea5e9 100%)',
      completed: 'linear-gradient(135deg, #166534 0%, #16a34a 100%)',
      on_hold:   'linear-gradient(135deg, #92400e 0%, #f59e0b 100%)',
      cancelled: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
    };

    grid.innerHTML = projects.map(p => {
      const meta = statusMeta[p.status] || statusMeta.active;
      const grad = bodyGradients[p.status] || bodyGradients.active;
      const desc = p.description
        ? (p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description)
        : 'No description provided.';

      return `
        <div class="project-card">
          <div class="project-header">
            <strong>${p.name}</strong>
            <span style="background:${meta.bg};color:${meta.color};font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;">
              ${meta.label}
            </span>
          </div>
          <div class="project-body" style="background:${grad};position:relative;overflow:hidden;">
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:space-around;padding:0 16px;">
              <div style="text-align:center;color:white;">
                <div style="font-size:22px;font-weight:800;">${p.inspection_count}</div>
                <div style="font-size:10px;opacity:0.85;font-weight:600;">INSPECTIONS</div>
              </div>
              <div style="width:1px;height:36px;background:rgba(255,255,255,0.3);"></div>
              <div style="text-align:center;color:white;">
                <div style="font-size:22px;font-weight:800;">${p.report_count}</div>
                <div style="font-size:10px;opacity:0.85;font-weight:600;">REPORTS</div>
              </div>
            </div>
          </div>
          <div class="project-footer">
            <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
              <span style="font-size:11px;color:#94a3b8;">${p.location}</span>
              <p style="margin:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${desc}</p>
            </div>
            <span class="menu" style="flex-shrink:0;margin-left:8px;">☰</span>
          </div>
        </div>`;
    }).join('');
  }
});
