import { readDatabase, upsertPlayerStats, updateDatabase } from './db.js';
import { toISODate } from './utils.js';

export function computeDashboardMetrics() {
  const db = readDatabase();
  const reservationsThisWeek = db.reservations.filter((reservation) => {
    const date = new Date(reservation.startDateTime);
    const now = new Date();
    const diff = now - date;
    return diff <= 7 * 24 * 60 * 60 * 1000 && diff >= 0;
  });

  const totalRevenue = db.transactions
    .filter((transaction) => transaction.status === 'captured')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const occupancyByCourt = db.settings.courts.map((court) => {
    const reservations = db.reservations.filter((item) => item.courtNumber === court.id);
    const minutes = reservations.reduce((sum, reservation) => sum + reservation.durationMinutes, 0);
    return {
      courtId: court.id,
      courtName: court.name,
      totalMinutes: minutes,
    };
  });

  const topPlayers = [...db.playerStats]
    .sort((a, b) => b.rankingPoints - a.rankingPoints)
    .slice(0, 5)
    .map((stats) => {
      const player = db.users.find((user) => user.id === stats.userId);
      return {
        userId: stats.userId,
        name: player?.name || 'Joueur inconnu',
        rankingPoints: stats.rankingPoints,
        matchesPlayed: stats.matchesPlayed,
        winRate: stats.matchesPlayed ? Math.round((stats.wins / stats.matchesPlayed) * 100) : 0,
      };
    });

  return {
    generatedAt: toISODate(),
    reservationsThisWeek: reservationsThisWeek.length,
    totalRevenue,
    occupancyByCourt,
    topPlayers,
    upcomingMatches: db.matches.filter((match) => new Date(match.matchDate) >= new Date()).length,
    membersCount: db.users.length,
  };
}

export function updateStatsAfterReservation(reservation) {
  const participants = reservation.participants || [];
  const duration = reservation.durationMinutes || 60;
  participants.forEach((participantId) => {
    upsertPlayerStats(participantId, (stats) => {
      stats.totalPlayTimeMinutes += duration;
      stats.rankingPoints += Math.round(duration / 30);
      if (!stats.achievements.includes('habitue')) {
        if (stats.totalPlayTimeMinutes >= 600) {
          stats.achievements.push('habitue');
        }
      }
    });
  });
}

export function updateStatsAfterMatch(match, result) {
  const participants = match.players || [];
  participants.forEach((participant) => {
    upsertPlayerStats(participant.userId, (stats) => {
      stats.matchesPlayed += 1;
      if (result?.winners?.includes(participant.userId)) {
        stats.wins += 1;
        stats.rankingPoints += 25;
        stats.streak += 1;
      } else {
        stats.losses += 1;
        stats.rankingPoints = Math.max(800, stats.rankingPoints - 10);
        stats.streak = 0;
      }
      if (stats.matchesPlayed >= 10 && !stats.achievements.includes('veteran')) {
        stats.achievements.push('veteran');
      }
      const winRate = stats.matchesPlayed ? stats.wins / stats.matchesPlayed : 0;
      if (winRate >= 0.6 && !stats.achievements.includes('champion')) {
        stats.achievements.push('champion');
      }
    });
  });
}

export function markNotificationRead(notificationId, userId) {
  return updateDatabase((db) => {
    const notification = db.notifications.find((item) => item.id === notificationId && item.userId === userId);
    if (notification) {
      notification.isRead = true;
      notification.readAt = toISODate();
    }
    return notification;
  });
}
