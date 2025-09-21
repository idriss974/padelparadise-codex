const state = {
  settings: null,
  user: null,
  stats: null,
  reservations: [],
  matches: [],
  community: [],
  notifications: [],
  alerts: [],
  selectedDate: new Date().toISOString().split('T')[0],
  reservationMode: 'book',
};

const sections = document.querySelectorAll('[data-section]');
const navLinks = document.querySelectorAll('nav .nav-links li');
const navActions = document.querySelector('.nav-actions');
const authModal = document.getElementById('auth-modal');
const authModalContent = document.getElementById('auth-modal-content');
const toastContainer = document.getElementById('toast-container');

const reservationFormCard = document.getElementById('reservation-form-card');
const reservationSummaryCard = document.getElementById('reservation-summary-card');
const matchesContainer = document.getElementById('matches-container');
const communityList = document.getElementById('community-list');
const profileGrid = document.getElementById('profile-grid');
const notificationList = document.getElementById('notification-list');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Une erreur est survenue');
  }
  return data;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function switchView(view) {
  sections.forEach((section) => {
    const sectionView = section.getAttribute('data-section');
    if (sectionView === view) {
      section.removeAttribute('hidden');
    } else {
      section.setAttribute('hidden', '');
    }
  });
  navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.view === view);
  });
}

function openAuthModal(mode = 'login') {
  authModal.removeAttribute('hidden');
  authModalContent.innerHTML = renderAuthForm(mode);
  const form = authModalContent.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    try {
      if (mode === 'login') {
        await fetchJson('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Connexion réussie', 'success');
      } else {
        payload.level = payload.level || 'Intermédiaire';
        await fetchJson('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Bienvenue ! Profil créé avec succès', 'success');
      }
      closeAuthModal();
      await hydrate();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  authModalContent.querySelectorAll('[data-switch]').forEach((button) => {
    button.addEventListener('click', () => openAuthModal(button.dataset.switch));
  });

  authModal.addEventListener('click', (event) => {
    if (event.target === authModal) {
      closeAuthModal();
    }
  });
}

function closeAuthModal() {
  authModal.setAttribute('hidden', '');
  authModalContent.innerHTML = '';
}

function renderAuthForm(mode) {
  if (mode === 'login') {
    return `
      <h3>Connexion</h3>
      <form>
        <label>
          Adresse e-mail
          <input type="email" name="email" required autocomplete="email" />
        </label>
        <label>
          Mot de passe
          <input type="password" name="password" required autocomplete="current-password" />
        </label>
        <div class="modal-actions">
          <button type="button" class="secondary" data-switch="register">Créer un compte</button>
          <button type="submit">Se connecter</button>
        </div>
      </form>
    `;
  }
  return `
    <h3>Créer un compte</h3>
    <form>
      <div class="form-row">
        <label>
          Prénom / Nom
          <input type="text" name="name" required placeholder="Votre nom" />
        </label>
        <label>
          Niveau
          <select name="level">
            <option value="Débutant">Débutant</option>
            <option value="Intermédiaire" selected>Intermédiaire</option>
            <option value="Avancé">Avancé</option>
            <option value="Pro">Pro</option>
          </select>
        </label>
      </div>
      <label>
        Adresse e-mail
        <input type="email" name="email" required autocomplete="email" />
      </label>
      <label>
        Mot de passe (8 caractères minimum)
        <input type="password" name="password" required autocomplete="new-password" minlength="8" />
      </label>
      <div class="modal-actions">
        <button type="button" class="secondary" data-switch="login">J'ai déjà un compte</button>
        <button type="submit">S'inscrire</button>
      </div>
    </form>
  `;
}

function updateNavActions() {
  navActions.innerHTML = '';
  if (state.user) {
    const welcome = document.createElement('span');
    welcome.className = 'small';
    welcome.textContent = `Bonjour, ${state.user.name}`;
    const logout = document.createElement('button');
    logout.className = 'secondary';
    logout.textContent = 'Déconnexion';
    logout.addEventListener('click', async () => {
      await fetchJson('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.stats = null;
      showToast('À très vite sur les terrains !', 'info');
      updateNavActions();
      switchView('hero');
    });
    if (state.user.isAdmin) {
      const adminLink = document.createElement('a');
      adminLink.href = '/club';
      adminLink.innerHTML = '<button>Interface Club</button>';
      navActions.appendChild(adminLink);
    }
    navActions.appendChild(welcome);
    navActions.appendChild(logout);
  } else {
    const login = document.createElement('button');
    login.className = 'secondary';
    login.textContent = 'Connexion';
    login.addEventListener('click', () => openAuthModal('login'));
    const register = document.createElement('button');
    register.textContent = "S'inscrire";
    register.addEventListener('click', () => openAuthModal('register'));
    navActions.appendChild(login);
    navActions.appendChild(register);
  }
}

function renderReservationForm() {
  if (!state.settings) return;
  const courts = state.settings.courts || [
    { id: 1, name: 'Terrain 1' },
    { id: 2, name: 'Terrain 2' },
    { id: 3, name: 'Terrain 3' },
    { id: 4, name: 'Terrain 4' },
  ];
  const startHours = Array.from({ length: 14 }, (_, index) => 8 + index);
  const durations = [60, 90, 120];

  reservationFormCard.innerHTML = `
    <form id="reservation-form" class="reservation-form">
      <div class="grid">
        <label>
          Date
          <input type="date" name="date" value="${state.selectedDate}" min="${state.selectedDate}" required />
        </label>
        <label>
          Heure de début
          <select name="startHour" required>
            ${startHours
              .map((hour) => `<option value="${hour}">${formatHour(hour)}</option>`)
              .join('')}
          </select>
        </label>
        <label>
          Durée
          <select name="durationMinutes" required>
            ${durations
              .map((duration) => `<option value="${duration}">${duration} minutes</option>`)
              .join('')}
          </select>
        </label>
      </div>
      <div>
        <p class="small">Sélection du terrain</p>
        <div class="flex wrap" id="court-selector">
          ${courts
            .map(
              (court, index) => `
                <button type="button" class="secondary" data-court="${court.id}" ${index === 0 ? 'data-active' : ''}>
                  ${court.name}
                </button>
              `,
            )
            .join('')}
        </div>
        <input type="hidden" name="courtNumber" value="${courts[0].id}" />
      </div>
      <div>
        <label>
          Inviter des joueurs (emails séparés par des virgules)
          <input type="text" name="invitees" placeholder="ex: ami@club.fr, partenaire@padel.com" />
        </label>
      </div>
      <label class="flex center" style="gap: 0.5rem">
        <input type="checkbox" name="splitPayment" value="true" />
        Activer le paiement partagé (split payment)
      </label>
      <button type="submit">Réserver et payer</button>
    </form>
  `;

  const form = document.getElementById('reservation-form');
  const courtButtons = reservationFormCard.querySelectorAll('[data-court]');
  const hiddenCourtInput = form.querySelector('input[name="courtNumber"]');

  courtButtons.forEach((button) => {
    button.addEventListener('click', () => {
      courtButtons.forEach((btn) => btn.removeAttribute('data-active'));
      button.setAttribute('data-active', '');
      hiddenCourtInput.value = button.dataset.court;
      renderReservationSummary();
    });
  });

  form.addEventListener('change', (event) => {
    if (event.target.name === 'date') {
      state.selectedDate = event.target.value;
      loadReservations();
    }
    renderReservationSummary();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.user) {
      openAuthModal('login');
      return;
    }
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.startHour = Number(payload.startHour);
    payload.durationMinutes = Number(payload.durationMinutes);
    payload.courtNumber = Number(payload.courtNumber);
    payload.splitPayment = formData.get('splitPayment') === 'true';
    payload.invitees = (payload.invitees || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      const result = await fetchJson('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Réservation confirmée !', 'success');
      await loadReservations();
      renderReservationSummary(result.reservation);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderReservationSummary(reservation) {
  const form = document.getElementById('reservation-form');
  if (!form || !state.settings) return;
  const date = form.date.value;
  const startHour = Number(form.startHour.value);
  const duration = Number(form.durationMinutes.value);
  const courtNumber = Number(form.courtNumber.value);
  const splitPayment = form.splitPayment.checked;

  const price = calculatePrice(startHour, duration);
  const playersCount = splitPayment ? Math.min(4, (form.invitees.value.split(',').filter(Boolean).length || 0) + 1) : 1;
  const share = splitPayment ? (price.total / playersCount).toFixed(2) : price.total.toFixed(2);

  const dayReservations = state.reservations.filter((item) => item.date === date);

  reservationSummaryCard.innerHTML = `
    <div class="card-header">
      <div class="card-title">Récapitulatif</div>
      <span class="badge status confirmed">${formatHour(startHour)} - Terrain ${courtNumber}</span>
    </div>
    <div class="list">
      <div class="list-item">
        <div><strong>Date :</strong> ${formatDate(date)}</div>
        <div><strong>Durée :</strong> ${duration} minutes</div>
        <div><strong>Tarif :</strong> ${price.total.toFixed(2)} €</div>
        <div><strong>Paiement :</strong> ${splitPayment ? 'Partagé' : 'Classique'}</div>
        ${splitPayment ? `<div><strong>Part par joueur :</strong> ${share} €</div>` : ''}
      </div>
      <div class="list-item">
        <div class="card-title">Occupation du terrain</div>
        <div class="timeline">
          ${dayReservations
            .map(
              (item) => `
                <div class="timeline-item">
                  <div class="time">${formatHour(item.startHour)} (${item.durationMinutes} min)</div>
                  <div>
                    ${item.isOwner ? '<strong>Votre réservation</strong>' : `Terrain ${item.courtNumber}`}
                    <div class="small">${item.status === 'confirmed' ? 'Confirmée' : item.status}</div>
                  </div>
                </div>
              `,
            )
            .join('') || '<p class="small">Aucune réservation sur cette journée.</p>'}
        </div>
      </div>
    </div>
  `;
}

function calculatePrice(startHour, durationMinutes) {
  let total = 0;
  const slots = [];
  const increments = durationMinutes / 30;
  for (let index = 0; index < increments; index += 1) {
    const hour = startHour + index * 0.5;
    const effectiveHour = Math.floor(hour);
    const isPeak = effectiveHour >= 17 && effectiveHour < 20;
    const rate = isPeak ? 32 : 24;
    total += rate / 2;
    slots.push({
      label: `${formatHour(effectiveHour + (hour % 1 ? 0.5 : 0))}`,
      rate,
    });
  }
  return { total, slots };
}

function formatHour(hourValue) {
  const hour = Math.floor(hourValue);
  const minutes = hourValue % 1 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}h${minutes}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(value));
}

async function loadReservations() {
  if (!state.user) {
    reservationSummaryCard.innerHTML = '<p class="small">Connectez-vous pour consulter vos réservations.</p>';
    return;
  }
  try {
    const data = await fetchJson(`/api/reservations?date=${state.selectedDate}`);
    state.reservations = data.reservations || [];
    renderReservationSummary();
    if (state.reservationMode === 'history') {
      renderReservationHistory();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderReservationHistory() {
  const userReservations = state.reservations.filter((reservation) => reservation.isOwner);
  reservationSummaryCard.innerHTML = `
    <div class="card-header">
      <div class="card-title">Mes réservations</div>
    </div>
    <div class="list">
      ${
        userReservations.length
          ? userReservations
              .map(
                (reservation) => `
              <div class="list-item">
                <div class="flex between center">
                  <div>
                    <strong>${formatDate(reservation.date)}</strong> - ${formatHour(reservation.startHour)}
                    <div class="small">Terrain ${reservation.courtNumber} • ${reservation.durationMinutes} min</div>
                  </div>
                  <span class="badge status ${reservation.status}">${reservation.status}</span>
                </div>
                <div class="small">Montant : ${reservation.price.toFixed(2)} €</div>
                <div class="actions">
                  <button class="secondary" data-cancel="${reservation.id}">Annuler</button>
                </div>
              </div>
            `,
              )
              .join('')
          : '<p class="small">Vous n\'avez pas encore de réservation sur cette journée.</p>'
      }
    </div>
  `;

  reservationSummaryCard.querySelectorAll('[data-cancel]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.cancel;
      try {
        await fetchJson(`/api/reservations/${id}`, { method: 'DELETE' });
        showToast('Réservation annulée', 'info');
        await loadReservations();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

function bindReservationMode() {
  const modeButtons = document.querySelectorAll('#reservation-mode button');
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.reservationMode = button.dataset.mode;
      modeButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
      if (state.reservationMode === 'history') {
        renderReservationHistory();
      } else {
        renderReservationSummary();
      }
    });
  });
}

function renderMatches() {
  matchesContainer.innerHTML = state.matches
    .map((match) => {
      const participants = match.participants || [];
      const spotsLeft = Math.max(match.maxPlayers - participants.length, 0);
      const canJoin = !match.joined && spotsLeft > 0 && match.status === 'scheduled';
      const lastMessages = (match.messages || []).map(
        (message) => `
          <div class="message-item">
            <div class="meta">
              <span>${message.senderName}</span>
              <span>${new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(message.createdAt))}</span>
            </div>
            <div>${message.content}</div>
          </div>
        `,
      );
      return `
        <div class="match-card">
          <div class="flex between center">
            <div>
              <h3>${match.title}</h3>
              <div class="small">${formatDate(match.matchDate)} • ${formatHour(match.startHour)}</div>
              <div class="small">Terrain ${match.courtNumber} • ${match.durationMinutes} min</div>
              <div class="small">Niveau ${match.minLevel} à ${match.maxLevel}</div>
            </div>
            <span class="badge status ${match.status}">${match.status}</span>
          </div>
          <div class="participants">
            ${participants
              .map((participant) => `<span class="chip">${participant.userId === match.creatorId ? '⭐ ' : ''}${participant.name} • ${participant.status}</span>`)
              .join('') || '<span class="small">Aucun joueur inscrit pour le moment.</span>'}
          </div>
          <div class="actions">
            ${
              canJoin
                ? `<button data-join="${match.id}">Rejoindre (${spotsLeft} places)</button>`
                : '<button class="secondary" disabled>Complet ou inscrit</button>'
            }
            ${match.isOwner ? `<button class="secondary" data-result="${match.id}">Publier le résultat</button>` : ''}
          </div>
          <div>
            <h4>Messages récents</h4>
            <div class="messages">${lastMessages.join('')}</div>
            <form data-message-form="${match.id}" class="flex" style="margin-top: 0.5rem; gap: 0.5rem">
              <input type="text" name="content" placeholder="Écrire un message" required />
              <button type="submit">Envoyer</button>
            </form>
          </div>
        </div>
      `;
    })
    .join('');

  matchesContainer.querySelectorAll('[data-join]').forEach((button) => {
    button.addEventListener('click', async () => {
      const matchId = button.dataset.join;
      try {
        await fetchJson(`/api/matches/${matchId}/join`, { method: 'POST' });
        showToast('Vous avez rejoint le match !', 'success');
        await loadMatches();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });

  matchesContainer.querySelectorAll('[data-result]').forEach((button) => {
    button.addEventListener('click', () => openResultModal(button.dataset.result));
  });

  matchesContainer.querySelectorAll('form[data-message-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const matchId = form.dataset.messageForm;
      const formData = new FormData(form);
      const content = formData.get('content');
      if (!content) return;
      try {
        await fetchJson(`/api/matches/${matchId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        form.reset();
        await loadMatches();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

function openMatchModal() {
  authModal.removeAttribute('hidden');
  authModalContent.innerHTML = `
    <h3>Nouveau match</h3>
    <form id="create-match-form">
      <label>
        Titre du match
        <input type="text" name="title" required placeholder="Match du soir" />
      </label>
      <div class="form-row">
        <label>
          Date
          <input type="date" name="matchDate" value="${state.selectedDate}" required />
        </label>
        <label>
          Heure
          <input type="time" name="startHour" value="18:00" required />
        </label>
      </div>
      <div class="form-row">
        <label>
          Durée (minutes)
          <input type="number" name="durationMinutes" value="90" min="60" max="180" step="30" />
        </label>
        <label>
          Terrain
          <select name="courtNumber">
            ${state.settings.courts.map((court) => `<option value="${court.id}">${court.name}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="form-row">
        <label>
          Niveau min.
          <select name="minLevel">
            <option value="Débutant">Débutant</option>
            <option value="Intermédiaire" selected>Intermédiaire</option>
            <option value="Avancé">Avancé</option>
            <option value="Pro">Pro</option>
          </select>
        </label>
        <label>
          Niveau max.
          <select name="maxLevel">
            <option value="Intermédiaire">Intermédiaire</option>
            <option value="Avancé" selected>Avancé</option>
            <option value="Pro">Pro</option>
          </select>
        </label>
      </div>
      <label>
        Joueurs maximum
        <input type="number" name="maxPlayers" value="4" min="2" max="8" />
      </label>
      <label>
        Description
        <textarea name="description" placeholder="Ajoutez des détails, règles ou format du match"></textarea>
      </label>
      <label class="flex center" style="gap: 0.5rem">
        <input type="checkbox" name="isPublic" checked />
        Rendre le match public (inscription ouverte)
      </label>
      <div class="modal-actions">
        <button type="button" class="secondary" id="cancel-match-modal">Annuler</button>
        <button type="submit">Créer le match</button>
      </div>
    </form>
  `;

  const form = document.getElementById('create-match-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const [hour, minute] = (payload.startHour || '18:00').split(':').map(Number);
    payload.startHour = hour + (minute >= 30 ? 0.5 : 0);
    payload.durationMinutes = Number(payload.durationMinutes);
    payload.courtNumber = Number(payload.courtNumber);
    payload.maxPlayers = Number(payload.maxPlayers);
    payload.isPublic = formData.get('isPublic') === 'on';
    try {
      await fetchJson('/api/matches', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Match créé avec succès', 'success');
      closeAuthModal();
      await loadMatches();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  document.getElementById('cancel-match-modal').addEventListener('click', closeAuthModal);
}

function openResultModal(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match) return;
  authModal.removeAttribute('hidden');
  authModalContent.innerHTML = `
    <h3>Résultat du match</h3>
    <form id="match-result-form">
      <p class="small">Sélectionnez les vainqueurs :</p>
      <div class="list">
        ${(match.participants || [])
          .map(
            (participant) => `
            <label class="flex center" style="gap: 0.5rem">
              <input type="checkbox" name="winners" value="${participant.userId}" />
              ${participant.userId === match.creatorId ? '⭐' : '👤'} ${participant.name} (${participant.status})
            </label>
          `,
          )
          .join('')}
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary" id="cancel-result-modal">Annuler</button>
        <button type="submit">Valider</button>
      </div>
    </form>
  `;

  document.getElementById('cancel-result-modal').addEventListener('click', closeAuthModal);
  const form = document.getElementById('match-result-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const winners = formData.getAll('winners');
    try {
      await fetchJson(`/api/matches/${matchId}/result`, {
        method: 'POST',
        body: JSON.stringify({ winners }),
      });
      showToast('Résultat enregistré', 'success');
      closeAuthModal();
      await loadMatches();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function loadMatches() {
  if (!state.user) {
    matchesContainer.innerHTML = '<p class="small">Connectez-vous pour découvrir les matchs disponibles.</p>';
    return;
  }
  try {
    const data = await fetchJson('/api/matches');
    state.matches = data.matches || [];
    renderMatches();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadCommunity(search = '') {
  if (!state.user) {
    communityList.innerHTML = '<p class="small">Connectez-vous pour accéder à la communauté.</p>';
    return;
  }
  try {
    const data = await fetchJson(`/api/community/players?search=${encodeURIComponent(search)}`);
    state.community = data.players || [];
    communityList.innerHTML = state.community
      .map(
        (player) => `
          <div class="profile-card">
            <img src="${player.avatarUrl || '/assets/images/avatar-1.svg'}" alt="${player.name}" />
            <div class="name">${player.name}</div>
            <div class="badge-level">${player.level}</div>
            <div class="small">${player.matchesPlayed} matchs joués</div>
            <div class="small">Win rate : ${player.winRate}%</div>
            <div class="small">Classement interne : ${player.rankingPoints} pts</div>
            <button class="${player.isFollowing ? 'secondary' : ''}" data-follow="${player.id}">
              ${player.isFollowing ? 'Ne plus suivre' : 'Suivre'}
            </button>
          </div>
        `,
      )
      .join('');
    communityList.querySelectorAll('[data-follow]').forEach((button) => {
      button.addEventListener('click', async () => {
        const playerId = button.dataset.follow;
        try {
          if (button.textContent.includes('Ne plus suivre')) {
            await fetchJson(`/api/community/follow?targetUserId=${playerId}`, { method: 'DELETE' });
            showToast('Vous ne suivez plus ce joueur', 'info');
          } else {
            await fetchJson('/api/community/follow', {
              method: 'POST',
              body: JSON.stringify({ targetUserId: playerId }),
            });
            showToast('Vous suivez désormais ce joueur', 'success');
          }
          await loadCommunity(document.getElementById('community-search').value);
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderProfile() {
  if (!state.user) {
    profileGrid.innerHTML = '<p class="small">Connectez-vous pour consulter votre profil.</p>';
    return;
  }
  const stats = state.stats || {};
  const achievements = stats.achievements || [];
  profileGrid.innerHTML = `
    <div class="card">
      <div class="flex" style="gap: 1.5rem; align-items: center;">
        <img src="${state.user.avatarUrl || '/assets/images/avatar-1.svg'}" alt="${state.user.name}" width="96" height="96" style="border-radius: 50%; border: 3px solid rgba(8,255,200,0.4);" />
        <div>
          <h3>${state.user.name}</h3>
          <div class="badge-level">${state.user.level || 'Intermédiaire'}</div>
          <p class="small">${state.user.bio || 'Complétez votre biographie pour partager votre style de jeu.'}</p>
        </div>
      </div>
      <form id="profile-form" style="margin-top: 1.5rem; display: grid; gap: 1rem;">
        <label>
          Nom affiché
          <input type="text" name="name" value="${state.user.name}" required />
        </label>
        <label>
          Niveau
          <select name="level" value="${state.user.level}">
            <option value="Débutant" ${state.user.level === 'Débutant' ? 'selected' : ''}>Débutant</option>
            <option value="Intermédiaire" ${state.user.level === 'Intermédiaire' ? 'selected' : ''}>Intermédiaire</option>
            <option value="Avancé" ${state.user.level === 'Avancé' ? 'selected' : ''}>Avancé</option>
            <option value="Pro" ${state.user.level === 'Pro' ? 'selected' : ''}>Pro</option>
          </select>
        </label>
        <label>
          Bio
          <textarea name="bio" rows="3" placeholder="Parlez de votre jeu, de vos disponibilités, de vos objectifs.">${state.user.bio || ''}</textarea>
        </label>
        <div class="modal-actions">
          <button type="submit">Mettre à jour</button>
        </div>
      </form>
    </div>
    <div class="card">
      <h3>Statistiques personnelles</h3>
      <div class="grid two" style="margin-top: 1rem;">
        <div class="stat-card">
          <span class="label">Matchs joués</span>
          <span class="value">${stats.matchesPlayed || 0}</span>
        </div>
        <div class="stat-card">
          <span class="label">Taux de victoire</span>
          <span class="value">${stats.matchesPlayed ? Math.round((stats.wins / stats.matchesPlayed) * 100) : 0}%</span>
        </div>
        <div class="stat-card">
          <span class="label">Temps de jeu</span>
          <span class="value">${Math.round((stats.totalPlayTimeMinutes || 0) / 60)}h</span>
        </div>
        <div class="stat-card">
          <span class="label">Points classement</span>
          <span class="value">${stats.rankingPoints || 1200}</span>
        </div>
      </div>
      <div style="margin-top: 1.5rem;">
        <h4>Succès débloqués</h4>
        <div class="flex wrap">
          ${achievements.length ? achievements.map((item) => `<span class="chip">${formatAchievement(item)}</span>`).join('') : '<span class="small">Jouez pour débloquer vos premiers succès !</span>'}
        </div>
      </div>
    </div>
  `;

  const profileForm = document.getElementById('profile-form');
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(profileForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      await fetchJson('/api/users/me', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Profil mis à jour', 'success');
      await hydrate();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function formatAchievement(key) {
  const mapping = {
    habitue: 'Habitué du club',
    champion: 'Champion du club',
    marathonien: 'Marathonien du padel',
    veteran: 'Vétéran des courts',
  };
  return mapping[key] || key;
}

async function loadNotifications() {
  if (!state.user) {
    notificationList.innerHTML = '<p class="small">Connectez-vous pour consulter vos notifications.</p>';
    return;
  }
  try {
    const data = await fetchJson('/api/notifications');
    state.notifications = data.notifications || [];
    notificationList.innerHTML = state.notifications.length
      ? state.notifications
          .map(
            (notification) => `
            <div class="notification-item ${notification.isRead ? 'read' : ''}">
              <div class="flex between center">
                <strong>${notification.title}</strong>
                <span class="small">${new Intl.DateTimeFormat('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(notification.createdAt))}</span>
              </div>
              <div class="small">${notification.body}</div>
              ${notification.isRead ? '' : `<button class="secondary" data-read="${notification.id}">Marquer comme lu</button>`}
            </div>
          `,
          )
          .join('')
      : '<p class="small">Aucune notification pour le moment.</p>';
    notificationList.querySelectorAll('[data-read]').forEach((button) => {
      button.addEventListener('click', async () => {
        await fetchJson(`/api/notifications/${button.dataset.read}`, { method: 'PATCH' });
        await loadNotifications();
      });
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function hydrate() {
  try {
    state.settings = await fetchJson('/api/settings');
  } catch (error) {
    console.error(error);
  }

  try {
    const me = await fetchJson('/api/users/me');
    state.user = me.user;
    state.stats = me.stats;
    state.reservations = me.reservations || [];
    state.matches = me.matches || [];
  } catch (error) {
    state.user = null;
    state.stats = null;
  }

  updateNavActions();
  renderReservationForm();
  bindReservationMode();
  renderReservationSummary();
  renderMatches();
  renderProfile();
  await loadReservations();
  await loadMatches();
  await loadCommunity();
  await loadNotifications();
  await refreshHeroMetrics();
}

async function refreshHeroMetrics() {
  if (!state.user) {
    document.getElementById('hero-bookings').textContent = '0';
    document.getElementById('hero-occupancy').textContent = '0%';
    document.getElementById('hero-members').textContent = '0';
    return;
  }
  try {
    const metrics = await fetchJson('/api/admin/dashboard');
    document.getElementById('hero-bookings').textContent = metrics.reservationsThisWeek;
    const totalMinutes = metrics.occupancyByCourt.reduce((sum, item) => sum + item.totalMinutes, 0);
    const occupancyRate = Math.min(100, Math.round((totalMinutes / (metrics.occupancyByCourt.length * 7 * 12 * 60)) * 100));
    document.getElementById('hero-occupancy').textContent = `${occupancyRate}%`;
    document.getElementById('hero-members').textContent = metrics.membersCount;
  } catch (error) {
    document.getElementById('hero-bookings').textContent = String(state.reservations.length);
    document.getElementById('hero-occupancy').textContent = '—';
  }
}

function initNavigation() {
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const view = link.dataset.view;
      if (view !== 'hero' && !state.user) {
        openAuthModal('login');
        return;
      }
      switchView(view);
      if (view === 'community') {
        loadCommunity(document.getElementById('community-search').value);
      }
      if (view === 'profile') {
        renderProfile();
      }
      if (view === 'notifications') {
        loadNotifications();
      }
    });
  });

  document.querySelectorAll('button[data-view], .nav-links li[data-view]').forEach((element) => {
    element.addEventListener('click', () => {
      const view = element.dataset.view;
      if (view === 'reservation') {
        loadReservations();
      }
    });
  });
}

function initCommunitySearch() {
  const input = document.getElementById('community-search');
  if (!input) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      loadCommunity(input.value);
    }, 300);
  });
}

function initMatchCreation() {
  const button = document.getElementById('btn-create-match');
  if (!button) return;
  button.addEventListener('click', () => {
    if (!state.user) {
      openAuthModal('login');
      return;
    }
    openMatchModal();
  });
}

function initAuthButtons() {
  const btnLogin = document.getElementById('btn-open-login');
  const btnRegister = document.getElementById('btn-open-register');
  if (btnLogin) btnLogin.addEventListener('click', () => openAuthModal('login'));
  if (btnRegister) btnRegister.addEventListener('click', () => openAuthModal('register'));
}

async function bootstrap() {
  initAuthButtons();
  initNavigation();
  initCommunitySearch();
  initMatchCreation();
  renderReservationForm();
  await hydrate();
}

bootstrap();
