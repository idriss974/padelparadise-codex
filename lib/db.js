import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createSalt, hashPassword } from './auth.js';
import { toISODate } from './utils.js';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

function defaultDatabase() {
  const adminSalt = createSalt();
  const adminPassword = process.env.ADMIN_PASSWORD || 'ClubPadel!2025';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@padelparadise.club';
  const adminId = crypto.randomUUID();
  return {
    users: [
      {
        id: adminId,
        email: adminEmail,
        name: 'Administrateur Club',
        salt: adminSalt,
        passwordHash: hashPassword(adminPassword, adminSalt),
        avatarUrl: '/assets/images/admin-avatar.svg',
        level: 'Administrateur',
        bio: 'Gestionnaire officiel du club Padel Paradise.',
        isAdmin: true,
        createdAt: toISODate(),
        updatedAt: toISODate(),
      },
    ],
    reservations: [],
    reservationParticipants: [],
    matches: [],
    matchPlayers: [],
    messages: [],
    playerStats: [
      {
        id: crypto.randomUUID(),
        userId: adminId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        totalPlayTimeMinutes: 0,
        rankingPoints: 1200,
        streak: 0,
        achievements: [],
        updatedAt: toISODate(),
      },
    ],
    follows: [],
    notifications: [],
    transactions: [],
    trainingLibrary: [],
    documents: [
      {
        id: crypto.randomUUID(),
        title: 'Guide Administrateur',
        type: 'link',
        url: '/docs/ADMIN_GUIDE.html',
        createdAt: toISODate(),
      },
    ],
    settings: {
      clubName: 'Padel Paradise',
      timezone: 'Europe/Paris',
      courts: [
        { id: 1, name: 'Terrain 1' },
        { id: 2, name: 'Terrain 2' },
        { id: 3, name: 'Terrain 3' },
        { id: 4, name: 'Terrain 4' },
      ],
      openingHours: {
        start: '08:00',
        end: '22:00',
      },
      pricing: {
        offPeakRate: 24,
        peakRate: 32,
        peakStartHour: 17,
        peakEndHour: 20,
      },
    },
  };
}

export function ensureDatabase() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = defaultDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

export function readDatabase() {
  ensureDatabase();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function writeDatabase(data) {
  ensureDatabase();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function updateDatabase(mutator) {
  const db = readDatabase();
  const result = mutator(db);
  writeDatabase(db);
  return result;
}

export function findUserByEmail(email) {
  const db = readDatabase();
  return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(userId) {
  const db = readDatabase();
  return db.users.find((user) => user.id === userId);
}

export function upsertPlayerStats(userId, mutator) {
  return updateDatabase((db) => {
    let stats = db.playerStats.find((item) => item.userId === userId);
    if (!stats) {
      stats = {
        id: crypto.randomUUID(),
        userId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        totalPlayTimeMinutes: 0,
        rankingPoints: 1200,
        streak: 0,
        achievements: [],
        updatedAt: toISODate(),
      };
      db.playerStats.push(stats);
    }
    mutator(stats);
    stats.updatedAt = toISODate();
    return stats;
  });
}

export function recordNotification(notification) {
  return updateDatabase((db) => {
    const entry = {
      id: crypto.randomUUID(),
      createdAt: toISODate(),
      isRead: false,
      ...notification,
    };
    db.notifications.push(entry);
    return entry;
  });
}

export function nextId() {
  return crypto.randomUUID();
}
