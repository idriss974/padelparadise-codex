const state = {
  user: null,
  metrics: null,
  reservations: [],
  transactions: [],
  members: [],
  selectedDate: new Date().toISOString().split('T')[0],
};

const sections = document.querySelectorAll('[data-section]');
const navLinks = document.querySelectorAll('nav .nav-links li');
const loginSection = document.querySelector('[data-section="login"]');
const loginForm = document.getElementById('club-login-form');
const navActions = document.getElementById('club-nav-actions');
const toastContainer = document.getElementById('club-toast');

const dashboardMetrics = document.getElementById('club-dashboard-metrics');
const topPlayersList = document.getElementById('club-top-players');
const planningBody = document.getElementById('club-planning-body');
const transactionsBody = document.getElementById('club-transactions-body');
const membersBody = document.getElementById('club-members-body');
const datePicker = document.getElementById('club-date-picker');

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function switchView(view) {
  sections.forEach((section) => {
    const target = section.getAttribute('data-section');
    if (target === view) section.removeAttribute('hidden');
    else section.setAttribute('hidden', '');
  });
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === view));
}

function updateNav() {
  navActions.innerHTML = '';
  if (state.user) {
    const span = document.createElement('span');
    span.className = 'small';
    span.textContent = `Connecté en tant que ${state.user.name}`;
    const logout = document.createElement('button');
    logout.className = 'secondary';
    logout.textContent = 'Déconnexion';
    logout.addEventListener('click', async () => {
      await fetchJson('/api/auth/logout', { method: 'POST' });
      state.user = null;
      switchView('login');
      updateNav();
    });
    navActions.appendChild(span);
    navActions.appendChild(logout);
  } else {
    const link = document.createElement('a');
    link.href = '/';
    link.innerHTML = '<button class="secondary">Retour au site</button>';
    navActions.appendChild(link);
  }
}

async function attemptAutoLogin() {
  try {
    const me = await fetchJson('/api/users/me');
    if (me.user?.isAdmin) {
      state.user = me.user;
      loginSection.setAttribute('hidden', '');
      switchView('dashboard');
      updateNav();
      await loadDashboard();
      return true;
    }
  } catch (error) {
    // ignore
  }
  switchView('login');
  updateNav();
  return false;
}

function bindNavigation() {
  navLinks.forEach((link) => {
    link.addEventListener('click', async () => {
      if (!state.user) {
        showToast('Veuillez vous connecter.', 'error');
        return;
      }
      const view = link.dataset.view;
      switchView(view);
      if (view === 'planning') await loadPlanning();
      if (view === 'finances') await loadTransactions();
      if (view === 'membres') await loadMembers();
      if (view === 'dashboard') await loadDashboard();
    });
  });
}

async function loadDashboard() {
  if (!state.user) return;
  try {
    const metrics = await fetchJson('/api/admin/dashboard');
    state.metrics = metrics;
    dashboardMetrics.innerHTML = `
      <div class="stat-card">
        <span class="label">Réservations cette semaine</span>
        <span class="value">${metrics.reservationsThisWeek}</span>
      </div>
      <div class="stat-card">
        <span class="label">Revenus capturés</span>
        <span class="value">${metrics.totalRevenue.toFixed(2)} €</span>
      </div>
      <div class="stat-card">
        <span class="label">Matchs à venir</span>
        <span class="value">${metrics.upcomingMatches}</span>
      </div>
      <div class="stat-card">
        <span class="label">Membres actifs</span>
        <span class="value">${metrics.membersCount}</span>
      </div>
    `;
    topPlayersList.innerHTML = metrics.topPlayers
      .map(
        (player) => `
          <div class="list-item">
            <div class="flex between center">
              <strong>${player.name}</strong>
              <span class="badge">${player.rankingPoints} pts</span>
            </div>
            <div class="small">${player.matchesPlayed} matchs • ${player.winRate}% de victoires</div>
          </div>
        `,
      )
      .join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadPlanning() {
  if (!state.user) return;
  try {
    const data = await fetchJson(`/api/admin/reservations?date=${state.selectedDate}`);
    planningBody.innerHTML = data.reservations
      .map(
        (reservation) => `
          <tr>
            <td>${formatHour(reservation.startHour)} (${reservation.durationMinutes} min)</td>
            <td>Terrain ${reservation.courtNumber}</td>
            <td>${reservation.ownerName}</td>
            <td>${reservation.participants.join(', ') || '—'}</td>
            <td><span class="badge status ${reservation.status}">${reservation.status}</span></td>
          </tr>
        `,
      )
      .join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadTransactions() {
  if (!state.user) return;
  try {
    const data = await fetchJson('/api/admin/transactions');
    state.transactions = data.transactions || [];
    transactionsBody.innerHTML = state.transactions
      .map(
        (transaction) => `
          <tr>
            <td>${formatDate(transaction.createdAt)}</td>
            <td>${transaction.reservationId || '—'}</td>
            <td>${transaction.amount?.toFixed(2) || '0.00'}</td>
            <td>${transaction.status}</td>
            <td>${transaction.reference || '—'}</td>
          </tr>
        `,
      )
      .join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadMembers() {
  if (!state.user) return;
  try {
    const data = await fetchJson('/api/admin/members');
    state.members = data.members || [];
    membersBody.innerHTML = state.members
      .map(
        (member) => `
          <tr>
            <td>${member.name}</td>
            <td>${member.email}</td>
            <td>${member.level}</td>
            <td>${member.matchesPlayed}</td>
            <td>${member.rankingPoints}</td>
            <td>${formatDate(member.joinedAt)}</td>
          </tr>
        `,
      )
      .join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function formatHour(hourValue) {
  const hour = Math.floor(hourValue);
  const minutes = hourValue % 1 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}h${minutes}`;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(value)) : '—';
}

function bindPlanningControls() {
  if (!datePicker) return;
  datePicker.value = state.selectedDate;
  datePicker.addEventListener('change', async () => {
    state.selectedDate = datePicker.value;
    await loadPlanning();
  });
  document.getElementById('club-refresh-planning').addEventListener('click', loadPlanning);
}

function bindLogin() {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      await fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      const me = await fetchJson('/api/users/me');
      if (!me.user?.isAdmin) {
        showToast('Compte non autorisé', 'error');
        await fetchJson('/api/auth/logout', { method: 'POST' });
        return;
      }
      state.user = me.user;
      loginSection.setAttribute('hidden', '');
      switchView('dashboard');
      updateNav();
      await loadDashboard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function bootstrap() {
  bindNavigation();
  bindPlanningControls();
  bindLogin();
  await attemptAutoLogin();
}

bootstrap();
