import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { fileURLToPath } from 'node:url';

import {
  ensureDatabase,
  readDatabase,
  updateDatabase,
  findUserByEmail,
  findUserById,
  recordNotification,
  nextId,
} from './lib/db.js';
import {
  parseCookies,
  parseJsonBody,
  sendJson,
  sendText,
  getQueryParams,
  padelPriceForSlot,
  toISODate,
} from './lib/utils.js';
import {
  attachSessionCookie,
  revokeSession,
  getTokenFromCookies,
  verifyToken,
  createSalt,
  hashPassword,
  verifyPassword,
  getSessionDuration,
} from './lib/auth.js';
import { validateEmail, validatePassword, sanitizeString, clamp, isIsoDate } from './lib/validators.js';
import {
  computeDashboardMetrics,
  updateStatsAfterReservation,
  updateStatsAfterMatch,
  markNotificationRead,
} from './lib/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const DOCS_DIR = path.join(process.cwd(), 'docs');
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

ensureDatabase();

function createStaticFilePath(requestPath) {
  const safePath = path.normalize(requestPath).replace(/^\/+/, '');
  if (!safePath || safePath === '.' || safePath === path.sep) {
    return path.join(PUBLIC_DIR, 'index.html');
  }
  return path.join(PUBLIC_DIR, safePath);
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Ressource introuvable');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function serveDocFile(res, requestPath) {
  const safePath = path.normalize(requestPath).replace(/^\/+/, '');
  const filePath = path.join(DOCS_DIR, safePath.replace('docs/', ''));
  serveStaticFile(res, filePath);
}

function requireAuth(res, user) {
  if (!user) {
    sendJson(res, 401, { error: 'Authentification requise' });
    return false;
  }
  return true;
}

function requireAdmin(res, user) {
  if (!requireAuth(res, user)) return false;
  if (!user.isAdmin) {
    sendJson(res, 403, { error: 'Accès administrateur requis' });
    return false;
  }
  return true;
}

async function handleApiRequest(req, res, pathname, currentUser) {
  const origin = req.headers.origin || `http://localhost:${DEFAULT_PORT}`;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = {};
  if (!['GET', 'HEAD'].includes(req.method)) {
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
  }

  try {
    if (pathname === '/api/health') {
      sendJson(res, 200, { status: 'ok', time: toISODate() });
      return;
    }

    if (pathname === '/api/settings') {
      const db = readDatabase();
      sendJson(res, 200, db.settings);
      return;
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const { name, email, password, level } = body;
      if (!validateEmail(email)) {
        sendJson(res, 400, { error: 'Adresse e-mail invalide' });
        return;
      }
      if (!validatePassword(password)) {
        sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères' });
        return;
      }
      if (findUserByEmail(email)) {
        sendJson(res, 409, { error: 'Un compte existe déjà avec cette adresse e-mail' });
        return;
      }
      const salt = createSalt();
      const newUser = {
        id: nextId(),
        name: sanitizeString(name, 'Padeler'),
        email: email.toLowerCase(),
        salt,
        passwordHash: hashPassword(password, salt),
        level: sanitizeString(level, 'Intermédiaire'),
        avatarUrl: `/assets/images/avatar-${Math.ceil(Math.random() * 5)}.svg`,
        bio: '',
        isAdmin: false,
        createdAt: toISODate(),
        updatedAt: toISODate(),
      };
      updateDatabase((db) => {
        db.users.push(newUser);
        db.playerStats.push({
          id: nextId(),
          userId: newUser.id,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          totalPlayTimeMinutes: 0,
          rankingPoints: 1200,
          streak: 0,
          achievements: [],
          updatedAt: toISODate(),
        });
      });
      attachSessionCookie(res, { userId: newUser.id });
      sendJson(res, 201, { message: 'Compte créé avec succès', user: { id: newUser.id, name: newUser.name, email: newUser.email } });
      return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = body;
      const user = findUserByEmail(email || '');
      if (!user || !verifyPassword(password || '', user.passwordHash, user.salt)) {
        sendJson(res, 401, { error: 'Identifiants invalides' });
        return;
      }
      attachSessionCookie(res, { userId: user.id });
      sendJson(res, 200, {
        message: 'Connexion réussie',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
        },
        expiresIn: getSessionDuration(),
      });
      return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      revokeSession(res);
      sendJson(res, 200, { message: 'Déconnexion effectuée' });
      return;
    }

    if (pathname === '/api/users/me') {
      if (!requireAuth(res, currentUser)) return;
      if (req.method === 'GET') {
        const db = readDatabase();
        const stats = db.playerStats.find((item) => item.userId === currentUser.id) || null;
        const reservations = db.reservations.filter((item) => item.ownerId === currentUser.id);
        const matches = db.matches
          .filter((match) => {
            if (match.creatorId === currentUser.id) return true;
            return db.matchPlayers.some((player) => player.matchId === match.id && player.userId === currentUser.id);
          })
          .map((match) => {
            const participants = db.matchPlayers
              .filter((player) => player.matchId === match.id)
              .map((player) => ({
                userId: player.userId,
                status: player.status,
              }));
            return { ...match, participants };
          });
        sendJson(res, 200, {
          user: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            level: currentUser.level,
            avatarUrl: currentUser.avatarUrl,
            bio: currentUser.bio,
            isAdmin: currentUser.isAdmin,
          },
          stats,
          reservations,
          matches,
        });
        return;
      }
      if (req.method === 'PUT') {
        const { name, bio, level } = body;
        updateDatabase((db) => {
          const user = db.users.find((item) => item.id === currentUser.id);
          if (user) {
            user.name = sanitizeString(name, user.name);
            user.bio = sanitizeString(bio, user.bio);
            user.level = sanitizeString(level, user.level);
            user.updatedAt = toISODate();
          }
        });
        sendJson(res, 200, { message: 'Profil mis à jour' });
        return;
      }
    }

    if (pathname === '/api/community/players' && req.method === 'GET') {
      if (!requireAuth(res, currentUser)) return;
      const db = readDatabase();
      const { search = '' } = getQueryParams(req.url);
      const normalized = search.toString().toLowerCase();
      const players = db.users
        .filter((user) => user.id !== currentUser.id)
        .filter((user) => !normalized || user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized))
        .map((user) => {
          const stats = db.playerStats.find((item) => item.userId === user.id);
          const isFollowing = db.follows.some((follow) => follow.followerId === currentUser.id && follow.followingId === user.id);
          return {
            id: user.id,
            name: user.name,
            level: user.level,
            avatarUrl: user.avatarUrl,
            winRate: stats?.matchesPlayed ? Math.round((stats.wins / stats.matchesPlayed) * 100) : 0,
            matchesPlayed: stats?.matchesPlayed || 0,
            rankingPoints: stats?.rankingPoints || 1200,
            isFollowing,
          };
        });
      sendJson(res, 200, { players });
      return;
    }

    if (pathname === '/api/community/follow' && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const { targetUserId } = body;
      updateDatabase((db) => {
        const already = db.follows.find(
          (follow) => follow.followerId === currentUser.id && follow.followingId === targetUserId,
        );
        if (!already) {
          db.follows.push({ id: nextId(), followerId: currentUser.id, followingId: targetUserId, createdAt: toISODate() });
        }
      });
      sendJson(res, 200, { message: 'Utilisateur suivi' });
      return;
    }

    if (pathname.startsWith('/api/community/follow') && req.method === 'DELETE') {
      if (!requireAuth(res, currentUser)) return;
      const { targetUserId } = getQueryParams(req.url);
      updateDatabase((db) => {
        db.follows = db.follows.filter(
          (follow) => !(follow.followerId === currentUser.id && follow.followingId === targetUserId),
        );
      });
      sendJson(res, 200, { message: 'Abonnement supprimé' });
      return;
    }

    if (pathname === '/api/reservations' && req.method === 'GET') {
      if (!requireAuth(res, currentUser)) return;
      const { date } = getQueryParams(req.url);
      const db = readDatabase();
      const reservations = db.reservations
        .filter((reservation) => {
          if (!date) return true;
          return reservation.date === date;
        })
        .map((reservation) => ({
          ...reservation,
          isOwner: reservation.ownerId === currentUser.id,
        }));
      sendJson(res, 200, { reservations });
      return;
    }

    if (pathname === '/api/reservations' && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const { date, startHour, durationMinutes, courtNumber, invitees = [], splitPayment = false } = body;
      if (!date || !isIsoDate(date)) {
        sendJson(res, 400, { error: 'Date invalide' });
        return;
      }
      const parsedHour = Number(startHour);
      const duration = clamp(Number(durationMinutes) || 60, 60, 180);
      const court = clamp(Number(courtNumber) || 1, 1, 4);
      const { total } = padelPriceForSlot(parsedHour, duration);

      let participants = [currentUser.id];
      const db = readDatabase();
      invitees.forEach((email) => {
        const user = findUserByEmail(email);
        if (user) {
          participants.push(user.id);
        }
      });
      participants = [...new Set(participants)];

      let conflict = false;
      db.reservations.forEach((reservation) => {
        if (reservation.courtNumber !== court || reservation.date !== date) return;
        const existingStart = reservation.startHour;
        const existingEnd = reservation.startHour + reservation.durationMinutes / 60;
        const requestedStart = parsedHour;
        const requestedEnd = parsedHour + duration / 60;
        if (requestedStart < existingEnd && requestedEnd > existingStart) {
          conflict = true;
        }
      });
      if (conflict) {
        sendJson(res, 409, { error: 'Ce créneau est déjà réservé pour ce terrain' });
        return;
      }

      const reservationId = nextId();
      const startDateTime = new Date(date);
      startDateTime.setHours(Math.floor(parsedHour), parsedHour % 1 ? 30 : 0, 0, 0);

      const reservation = {
        id: reservationId,
        ownerId: currentUser.id,
        date,
        startHour: parsedHour,
        durationMinutes: duration,
        courtNumber: court,
        participants,
        splitPayment,
        price: total,
        status: 'confirmed',
        createdAt: toISODate(),
        startDateTime: startDateTime.toISOString(),
      };

      updateDatabase((dbWrite) => {
        dbWrite.reservations.push(reservation);
        participants.forEach((participantId) => {
          dbWrite.reservationParticipants.push({
            id: nextId(),
            reservationId,
            userId: participantId,
            createdAt: toISODate(),
            share: splitPayment ? Number((total / participants.length).toFixed(2)) : total,
          });
        });
        dbWrite.transactions.push({
          id: nextId(),
          reservationId,
          amount: total,
          status: splitPayment ? 'pending_split' : 'captured',
          provider: 'SumUp',
          createdAt: toISODate(),
        });
      });

      updateStatsAfterReservation(reservation);

      participants
        .filter((participantId) => participantId !== currentUser.id)
        .forEach((participantId) => {
          recordNotification({
            userId: participantId,
            type: 'reservation',
            title: 'Nouvelle réservation',
            body: `${currentUser.name} vous a ajouté à une réservation sur le terrain ${court}`,
          });
        });

      sendJson(res, 201, { message: 'Réservation confirmée', reservation });
      return;
    }

    if (pathname.startsWith('/api/reservations/') && req.method === 'DELETE') {
      if (!requireAuth(res, currentUser)) return;
      const reservationId = pathname.split('/').pop();
      let removed = false;
      updateDatabase((db) => {
        const reservation = db.reservations.find((item) => item.id === reservationId);
        if (reservation && reservation.ownerId === currentUser.id) {
          db.reservations = db.reservations.filter((item) => item.id !== reservationId);
          db.reservationParticipants = db.reservationParticipants.filter((item) => item.reservationId !== reservationId);
          db.transactions = db.transactions.filter((item) => item.reservationId !== reservationId);
          removed = true;
        }
      });
      if (!removed) {
        sendJson(res, 404, { error: 'Réservation introuvable ou accès non autorisé' });
        return;
      }
      sendJson(res, 200, { message: 'Réservation annulée' });
      return;
    }

    if (pathname === '/api/matches' && req.method === 'GET') {
      if (!requireAuth(res, currentUser)) return;
      const db = readDatabase();
      const matches = db.matches.map((match) => {
        const participantsRaw = db.matchPlayers.filter((player) => player.matchId === match.id);
        const participants = participantsRaw.map((player) => {
          const user = db.users.find((item) => item.id === player.userId);
          return {
            id: player.id,
            userId: player.userId,
            status: player.status,
            name: user?.name || 'Joueur',
            avatarUrl: user?.avatarUrl || '/assets/images/avatar-1.svg',
          };
        });
        const joined = participantsRaw.some((player) => player.userId === currentUser.id);
        const messages = db.messages
          .filter((message) => message.matchId === match.id)
          .slice(-5);
        return {
          ...match,
          participants,
          joined,
          messages,
          isOwner: match.creatorId === currentUser.id,
        };
      });
      sendJson(res, 200, { matches });
      return;
    }

    if (pathname === '/api/matches' && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const {
        title,
        description,
        matchDate,
        startHour,
        durationMinutes = 90,
        courtNumber = 1,
        isPublic = true,
        minLevel = 'Débutant',
        maxLevel = 'Avancé',
        maxPlayers = 4,
      } = body;
      if (!title || !matchDate || !isIsoDate(matchDate)) {
        sendJson(res, 400, { error: 'Les informations du match sont incomplètes' });
        return;
      }
      const matchId = nextId();
      const match = {
        id: matchId,
        creatorId: currentUser.id,
        title: sanitizeString(title, 'Match amical'),
        description: sanitizeString(description, ''),
        matchDate,
        startHour: Number(startHour) || 18,
        durationMinutes: clamp(Number(durationMinutes) || 90, 60, 180),
        courtNumber: clamp(Number(courtNumber) || 1, 1, 4),
        isPublic: Boolean(isPublic),
        minLevel,
        maxLevel,
        maxPlayers: clamp(Number(maxPlayers) || 4, 2, 8),
        createdAt: toISODate(),
        status: 'scheduled',
      };
      updateDatabase((db) => {
        db.matches.push(match);
        db.matchPlayers.push({
          id: nextId(),
          matchId,
          userId: currentUser.id,
          status: 'confirmed',
          joinedAt: toISODate(),
        });
      });
      sendJson(res, 201, { message: 'Match créé', match });
      return;
    }

    if (pathname.startsWith('/api/matches/') && pathname.endsWith('/join') && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const matchId = pathname.split('/')[3];
      let joined = false;
      const db = readDatabase();
      const match = db.matches.find((item) => item.id === matchId);
      if (!match) {
        sendJson(res, 404, { error: 'Match introuvable' });
        return;
      }
      if (!match.isPublic) {
        sendJson(res, 403, { error: 'Ce match est privé' });
        return;
      }
      const participants = db.matchPlayers.filter((player) => player.matchId === matchId);
      if (participants.some((player) => player.userId === currentUser.id)) {
        sendJson(res, 200, { message: 'Vous participez déjà à ce match' });
        return;
      }
      if (participants.length >= match.maxPlayers) {
        sendJson(res, 409, { error: 'Le match est complet' });
        return;
      }
      updateDatabase((dbWrite) => {
        dbWrite.matchPlayers.push({
          id: nextId(),
          matchId,
          userId: currentUser.id,
          status: 'confirmed',
          joinedAt: toISODate(),
        });
      });
      recordNotification({
        userId: match.creatorId,
        type: 'match',
        title: 'Nouveau joueur inscrit',
        body: `${currentUser.name} a rejoint votre match ${match.title}`,
      });
      sendJson(res, 200, { message: 'Inscription confirmée' });
      return;
    }

    if (pathname.startsWith('/api/matches/') && pathname.endsWith('/leave') && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const matchId = pathname.split('/')[3];
      updateDatabase((db) => {
        db.matchPlayers = db.matchPlayers.filter(
          (player) => !(player.matchId === matchId && player.userId === currentUser.id && player.status !== 'owner'),
        );
      });
      sendJson(res, 200, { message: 'Vous avez quitté le match' });
      return;
    }

    if (pathname.startsWith('/api/matches/') && pathname.endsWith('/messages') && req.method === 'GET') {
      if (!requireAuth(res, currentUser)) return;
      const matchId = pathname.split('/')[3];
      const db = readDatabase();
      const messages = db.messages
        .filter((message) => message.matchId === matchId)
        .map((message) => ({
          ...message,
          canDelete: message.senderId === currentUser.id,
        }));
      sendJson(res, 200, { messages });
      return;
    }

    if (pathname.startsWith('/api/matches/') && pathname.endsWith('/messages') && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const matchId = pathname.split('/')[3];
      const { content } = body;
      if (!content) {
        sendJson(res, 400, { error: 'Message vide' });
        return;
      }
      let isParticipant = false;
      const db = readDatabase();
      db.matchPlayers.forEach((player) => {
        if (player.matchId === matchId && player.userId === currentUser.id) {
          isParticipant = true;
        }
      });
      if (!isParticipant) {
        sendJson(res, 403, { error: 'Vous devez participer au match pour écrire un message' });
        return;
      }
      const message = {
        id: nextId(),
        matchId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        content: sanitizeString(content, ''),
        createdAt: toISODate(),
      };
      updateDatabase((dbWrite) => {
        dbWrite.messages.push(message);
      });
      sendJson(res, 201, { message: 'Message envoyé', entry: message });
      return;
    }

    if (pathname.startsWith('/api/matches/') && pathname.endsWith('/result') && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const matchId = pathname.split('/')[3];
      const { winners = [] } = body;
      const db = readDatabase();
      const match = db.matches.find((item) => item.id === matchId);
      if (!match || match.creatorId !== currentUser.id) {
        sendJson(res, 403, { error: 'Seul le créateur du match peut publier le résultat' });
        return;
      }
      updateDatabase((dbWrite) => {
        const entry = dbWrite.matches.find((item) => item.id === matchId);
        if (entry) {
          entry.status = 'completed';
          entry.result = { winners };
          entry.completedAt = toISODate();
        }
      });
      updateStatsAfterMatch(
        { ...match, players: db.matchPlayers.filter((player) => player.matchId === matchId) },
        { winners },
      );
      sendJson(res, 200, { message: 'Résultat enregistré' });
      return;
    }

    if (pathname === '/api/notifications' && req.method === 'GET') {
      if (!requireAuth(res, currentUser)) return;
      const db = readDatabase();
      const notifications = db.notifications
        .filter((notification) => notification.userId === currentUser.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      sendJson(res, 200, { notifications });
      return;
    }

    if (pathname.startsWith('/api/notifications/') && req.method === 'PATCH') {
      if (!requireAuth(res, currentUser)) return;
      const notificationId = pathname.split('/').pop();
      const notification = markNotificationRead(notificationId, currentUser.id);
      if (!notification) {
        sendJson(res, 404, { error: 'Notification introuvable' });
        return;
      }
      sendJson(res, 200, { message: 'Notification lue' });
      return;
    }

    if (pathname === '/api/payments/sumup' && req.method === 'POST') {
      if (!requireAuth(res, currentUser)) return;
      const { amount, reservationId, splitPayment } = body;
      const paymentReference = `SUMUP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      updateDatabase((db) => {
        db.transactions.push({
          id: nextId(),
          reservationId,
          amount,
          status: splitPayment ? 'pending_split' : 'captured',
          provider: 'SumUp',
          reference: paymentReference,
          createdAt: toISODate(),
        });
      });
      sendJson(res, 200, {
        status: splitPayment ? 'pending_split' : 'captured',
        provider: 'SumUp',
        reference: paymentReference,
        message: 'Paiement simulé - intégrer la clé API SumUp en production',
      });
      return;
    }

    if (pathname === '/api/admin/dashboard' && req.method === 'GET') {
      if (!requireAdmin(res, currentUser)) return;
      const metrics = computeDashboardMetrics();
      sendJson(res, 200, metrics);
      return;
    }

    if (pathname === '/api/admin/reservations' && req.method === 'GET') {
      if (!requireAdmin(res, currentUser)) return;
      const { date } = getQueryParams(req.url);
      const db = readDatabase();
      const reservations = db.reservations
        .filter((reservation) => {
          if (!date) return true;
          return reservation.date === date;
        })
        .map((reservation) => {
          const owner = db.users.find((user) => user.id === reservation.ownerId);
          const participants = (reservation.participants || []).map((participantId) =>
            db.users.find((user) => user.id === participantId)?.name || 'Joueur',
          );
          return {
            ...reservation,
            ownerName: owner?.name || 'Client',
            participants,
          };
        });
      sendJson(res, 200, { reservations });
      return;
    }

    if (pathname === '/api/admin/transactions' && req.method === 'GET') {
      if (!requireAdmin(res, currentUser)) return;
      const db = readDatabase();
      sendJson(res, 200, { transactions: db.transactions });
      return;
    }

    if (pathname === '/api/admin/members' && req.method === 'GET') {
      if (!requireAdmin(res, currentUser)) return;
      const db = readDatabase();
      const members = db.users.map((user) => {
        const stats = db.playerStats.find((item) => item.userId === user.id);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          level: user.level,
          matchesPlayed: stats?.matchesPlayed || 0,
          rankingPoints: stats?.rankingPoints || 0,
          joinedAt: user.createdAt,
          isAdmin: user.isAdmin,
        };
      });
      sendJson(res, 200, { members });
      return;
    }

    sendJson(res, 404, { error: 'Route API introuvable' });
  } catch (error) {
    console.error('API error', error);
    sendJson(res, 500, { error: 'Erreur interne du serveur', details: error.message });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url);
    const pathname = parsedUrl.pathname || '/';
    const cookies = parseCookies(req.headers.cookie || '');
    const token = getTokenFromCookies(cookies);
    const session = verifyToken(token);
    const currentUser = session ? findUserById(session.userId) : null;

    if (pathname.startsWith('/api/')) {
      await handleApiRequest(req, res, pathname, currentUser);
      return;
    }

    if (pathname.startsWith('/docs/')) {
      serveDocFile(res, pathname);
      return;
    }

    if (pathname.startsWith('/club') && !pathname.endsWith('.html')) {
      const filePath = path.join(PUBLIC_DIR, 'club', 'index.html');
      serveStaticFile(res, filePath);
      return;
    }

    const filePath = createStaticFilePath(pathname);
    serveStaticFile(res, filePath);
  } catch (error) {
    console.error('Server error', error);
    sendText(res, 500, 'Erreur interne du serveur');
  }
});

server.listen(DEFAULT_PORT, () => {
  console.log(`Padel Paradise est prêt sur http://localhost:${DEFAULT_PORT}`);
});
