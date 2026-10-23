let state = { roster: [], events: [], pending: null, integration: {}, bedrock: {} };
let selectedPerson = null;
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));

const icons = {
  home: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.6V21h13V9.6M9.2 21v-6.3h5.6V21"/>',
  handoff: '<path d="M4 8h15M15 4l4 4-4 4"/><path d="M20 16H5M9 12l-4 4 4 4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-3 2.3-5 5.5-5s5 2 5.5 5"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 15c2.2.5 3.5 2.1 3.8 4"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 7.5V12l3 2"/>',
  ring: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
  'arrow-up-right': '<path d="M6 18 18 6M9 6h9v9"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'trend-up': '<path d="m4 16 5-5 3 3 7-8"/><path d="M14 6h5v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4.5M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s6-5.2 6-10.3A6 6 0 0 0 6 10.7C6 15.8 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2"/>',
  'arrow-right': '<path d="M4 12h15M14 7l5 5-5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4.2 4L19 7"/>',
  shield: '<path d="m12 3 7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>'
};

function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => {
    const name = node.dataset.icon;
    if (!icons[name] || node.querySelector('svg')) return;
    node.innerHTML = `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { code: data.code });
  return data;
}

function currentPending() { return state.events.find(event => event.status === 'attention') || null; }

function sourceLabel(event) {
  return event?.source === 'ring-webhook' ? 'Ring webhook' : event?.source === 'ring-simulator' ? 'Ring simulator' : 'Local record';
}

function render() {
  const pending = currentPending();
  state.pending = pending;
  $('#nav-count').textContent = pending ? '1' : '0';
  $('#integration-mode').textContent = state.integration?.mode === 'connected' ? 'Live API connected' : 'Sandbox mode';
  $('#integration-mode').className = state.integration?.mode === 'connected' ? 'live-copy' : '';
  if (pending) {
    $('#hero-title').textContent = 'One arrival needs verification';
    $('#hero-detail').textContent = 'A visitor is waiting at the front entrance. Check the roster before you release.';
    $('#attention-title').textContent = 'Arrival at front entrance';
    $('#attention-detail').textContent = `${pending.detail} No child can be released until the pickup claim is verified.`;
    $('#attention-time').textContent = pending.time;
    $('#attention-location').textContent = pending.location || 'Front entrance';
    $('#attention-source').textContent = sourceLabel(pending);
    $('#attention-device').textContent = pending.deviceName || pending.deviceId || 'Ring device';
    $('#attention-type').textContent = String(pending.ringType || 'arrival').replaceAll('_', ' ');
    $('#modal-time').textContent = pending.time;
    $('#attention-card').classList.remove('quiet-state');
  } else {
    $('#hero-title').textContent = 'All arrivals are accounted for';
    $('#hero-detail').textContent = 'No handoffs are waiting for a decision. You can keep the front desk moving.';
    $('#attention-title').textContent = 'No pending arrivals';
    $('#attention-detail').textContent = 'The next Ring arrival will appear here for verification.';
    $('#attention-time').textContent = '—';
    $('#attention-location').textContent = 'Front entrance';
    $('#attention-source').textContent = 'Waiting for event';
    $('#attention-device').textContent = '—';
    $('#attention-type').textContent = '—';
    $('#attention-card').classList.add('quiet-state');
  }
  $('#roster-list').innerHTML = state.roster.map(person => `<div class="roster-row"><div class="person-avatar ${person.color}">${esc(person.initials)}</div><div><strong>${esc(person.name)}</strong><small>${esc(person.role)} · ${esc(person.child)}</small></div><span class="window">${esc(person.window)}</span></div>`).join('');
  $('#activity-list').innerHTML = state.events.slice(0, 5).map(event => {
    const good = event.status === 'approved';
    const icon = good ? 'check' : event.status === 'escalated' ? 'shield' : 'alert';
    return `<div class="activity-row"><div class="activity-marker ${good ? '' : 'attention'}" data-icon="${icon}"></div><div class="activity-body"><strong>${esc(event.label)}</strong><small>${esc(event.detail)} <span>${esc(event.time)}</span></small></div></div>`;
  }).join('');
  renderIcons();
  requestAnimationFrame(() => document.querySelectorAll('.roster-row,.activity-row').forEach((row, index) => row.style.setProperty('--row-delay', `${Math.min(index, 5) * 45}ms`)));
}

function openModal() {
  const pending = currentPending();
  if (!pending) return showToast('There are no arrivals waiting for review.');
  selectedPerson = null;
  $('#claim-code').value = '';
  $('#modal-result').className = 'modal-result';
  $('#modal-result').textContent = '';
  $('#decision-explanation').hidden = true;
  $('#decision-explanation').innerHTML = '';
  $('#person-options').innerHTML = state.roster.map(person => `<button class="person-option" data-person="${person.id}"><div class="person-avatar ${person.color}">${esc(person.initials)}</div><strong>${esc(person.name)}</strong><small>${esc(person.child)}</small><span class="selection-tick" data-icon="check"></span></button>`).join('');
  renderIcons($('#person-options'));
  document.querySelectorAll('.person-option').forEach(button => button.addEventListener('click', () => {
    selectedPerson = button.dataset.person;
    document.querySelectorAll('.person-option').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
    showToast(`${button.querySelector('strong').textContent} selected`);
  }));
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#claim-code').focus(), 260);
}

function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); }

async function verify() {
  const pending = currentPending();
  const code = $('#claim-code').value;
  const result = $('#modal-result');
  if (!pending || !selectedPerson) { result.className = 'modal-result error'; result.textContent = 'Select the visitor’s claimed identity first.'; return; }
  if (!/^\d{4}$/.test(code)) { result.className = 'modal-result error'; result.textContent = 'Enter the visitor’s four-digit claim code.'; return; }
  $('#verify-btn').disabled = true;
  try {
    const data = await request('/api/verify', { method: 'POST', body: JSON.stringify({ eventId: pending.id, personId: selectedPerson, code }) });
    result.className = `modal-result ${data.valid ? 'success' : 'error'}`;
    result.innerHTML = `<span data-icon="${data.valid ? 'check' : 'alert'}"></span>${esc(data.message)}`;
    renderIcons(result);
    const explanation = data.explanation;
    if (explanation) {
      const liveTag = explanation.mode === 'live' ? 'Amazon Bedrock' : 'Policy explainer';
      $('#decision-explanation').hidden = false;
      $('#decision-explanation').innerHTML = `<div class="explanation-head"><span data-icon="shield"></span><strong>${esc(liveTag)}</strong><span class="explanation-model">${esc(explanation.model || '')}</span></div><p>${esc(explanation.text)}</p>`;
      renderIcons($('#decision-explanation'));
    }
    state = await request('/api/state');
    render();
    if (data.valid) { showToast('Handoff approved and added to the audit trail.'); setTimeout(closeModal, 1100); }
  } catch (error) { result.className = 'modal-result error'; result.textContent = error.message; }
  finally { $('#verify-btn').disabled = false; }
}

async function simulateArrival() {
  const button = $('#simulate-arrival');
  button.classList.add('is-loading');
  try { await request('/api/ring/simulator/event', { method: 'POST', body: JSON.stringify({}) }); state = await request('/api/state'); render(); showToast('Ring arrival received — review the visitor.'); }
  catch (error) { showToast(error.message); }
  finally { setTimeout(() => button.classList.remove('is-loading'), 350); }
}

async function syncRing() {
  const button = $('#sync-ring');
  button.classList.add('is-loading');
  try {
    const data = await request('/api/ring/devices');
    showToast(`${data.devices?.data?.length || data.devices?.length || 0} Ring devices synced.`);
  } catch (error) {
    showToast(error.code === 'RING_NOT_LINKED' ? 'Add RING_ACCESS_TOKEN to connect a live account.' : error.message);
  } finally { setTimeout(() => button.classList.remove('is-loading'), 550); }
}

async function escalate() {
  const pending = currentPending();
  if (!pending) return;
  try { await request('/api/resolve', { method: 'POST', body: JSON.stringify({ eventId: pending.id }) }); state = await request('/api/state'); render(); closeModal(); showToast('Escalated to the guardian. Nothing was released.'); }
  catch (error) { showToast(error.message); }
}

function openDrawer(title, kicker, body) {
  $('#drawer-title').textContent = title;
  $('#drawer-kicker').textContent = kicker;
  $('#drawer-body').innerHTML = body;
  renderIcons($('#drawer-body'));
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
}

function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }

function showRosterDrawer() {
  const rows = state.roster.map(person => `<div class="drawer-row"><div class="person-avatar ${person.color}">${esc(person.initials)}</div><div class="drawer-copy"><strong>${esc(person.name)}</strong><small>${esc(person.role)} · ${esc(person.child)}<br>Pickup window ${esc(person.window)}</small></div><span class="drawer-chip">ACTIVE</span></div>`).join('');
  openDrawer('Pickup roster', 'TODAY · OAKLINE CENTER', `${rows}<div class="drawer-note"><span data-icon="shield"></span> Roster changes are kept behind the coordinator account so every release decision has a clear owner.</div>`);
}

function showAuditDrawer() {
  const rows = state.events.map(event => {
    const chip = event.status === 'approved' ? '<span class="drawer-chip">APPROVED</span>' : event.status === 'rejected' ? '<span class="drawer-chip fail">BLOCKED</span>' : event.status === 'escalated' ? '<span class="drawer-chip warn">ESCALATED</span>' : '<span class="drawer-chip warn">PENDING</span>';
    const evidence = `${sourceLabel(event)} · ${event.deviceName || event.deviceId || 'Ring device'}${event.policyStatus ? ` · ${event.policyStatus.replaceAll('_', ' ')}` : ''}`;
    const explanation = event.explanation?.text ? `<div class="audit-explanation">${esc(event.explanation.text)}</div>` : '';
    return `<div class="drawer-row audit-row"><div class="activity-marker ${event.status === 'approved' ? '' : 'attention'}" data-icon="${event.status === 'approved' ? 'check' : event.status === 'escalated' ? 'shield' : 'alert'}"></div><div class="drawer-copy"><strong>${esc(event.label)}</strong><small>${esc(event.detail)}<br>${esc(event.time)} · ${esc(evidence)}</small>${explanation}</div>${chip}</div>`;
  }).join('');
  openDrawer('Audit trail', 'DECISIONS · LAST 24 HOURS', rows || '<div class="drawer-note">No activity has been recorded yet.</div>');
}

function showNotificationsDrawer() {
  openDrawer('Notifications', 'LIVE SHIFT', `<div class="drawer-row"><div class="attention-icon small" data-icon="${currentPending() ? 'alert' : 'check'}"></div><div class="drawer-copy"><strong>${currentPending() ? 'Arrival needs verification' : 'All arrivals accounted for'}</strong><small>${currentPending() ? 'A Ring event is waiting at the front entrance.' : 'There are no unresolved arrivals in the queue.'}</small></div></div><div class="drawer-row"><div class="activity-marker" data-icon="ring"></div><div class="drawer-copy"><strong>Ring connection healthy</strong><small>Event receiver is ready. Device sync is available from the sidebar.</small></div><span class="drawer-chip">LIVE</span></div>`);
}

function showProfileDrawer() {
  openDrawer('Your account', 'COORDINATOR PROFILE', `<div class="profile-card"><div class="avatar avatar-navy">AR</div><div><strong>Alex Rivera</strong><small>Site coordinator · Oakline Center</small></div></div><button class="drawer-action" id="drawer-shift"><span>Shift preferences</span><span data-icon="arrow-right"></span></button><button class="drawer-action" id="drawer-privacy"><span>Privacy and security</span><span data-icon="arrow-right"></span></button><div class="drawer-note" style="margin-top:18px"><span data-icon="shield"></span> PickupPass uses claim codes and an authorized roster. It does not use face recognition.</div>`);
  $('#drawer-shift').addEventListener('click', () => showToast('Shift preferences are already set for Oakline Center.'));
  $('#drawer-privacy').addEventListener('click', () => showToast('Your verification records stay on this site.'));
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

$('#open-verification').addEventListener('click', openModal);
$('#attention-arrow').addEventListener('click', openModal);
$('#simulate-arrival').addEventListener('click', simulateArrival);
$('#sync-ring').addEventListener('click', syncRing);
$('#manage-roster').addEventListener('click', showRosterDrawer);
$('#view-audit').addEventListener('click', showAuditDrawer);
$('#notifications-btn').addEventListener('click', showNotificationsDrawer);
$('#profile-btn').addEventListener('click', showProfileDrawer);
$('#site-switcher').addEventListener('click', () => showToast('Oakline Center is the active site.'));
$('#close-drawer').addEventListener('click', closeDrawer);
$('#close-modal').addEventListener('click', closeModal);
$('#verify-btn').addEventListener('click', verify);
$('#escalate-btn').addEventListener('click', escalate);
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) closeModal(); });
$('#drawer').addEventListener('click', event => { if (event.target === $('#drawer')) closeDrawer(); });
$('#claim-code').addEventListener('keydown', event => { if (event.key === 'Enter') verify(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#modal').classList.contains('open')) closeModal(); if (event.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer(); });

renderIcons();
request('/api/state').then(data => { state = data; render(); }).catch(error => showToast(error.message));
