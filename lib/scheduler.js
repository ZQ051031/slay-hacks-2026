export const RATINGS = ['again', 'hard', 'good', 'easy'];

export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOffset(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return dayKey(result);
}

export function newCard(question, now = new Date()) {
  return { question, interval: 0, ease: 2.5, repetitions: 0, due: dayKey(now) };
}

export function schedule(card, rating, now = new Date()) {
  if (!RATINGS.includes(rating)) throw new RangeError('Unknown review rating');
  let { interval, ease, repetitions } = card;
  if (rating === 'again') {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    repetitions = 0;
  } else {
    repetitions++;
    if (rating === 'hard') {
      interval = interval ? Math.max(interval + 1, Math.round(interval * 1.2)) : 1;
      ease = Math.max(1.3, ease - 0.15);
    } else if (rating === 'good') {
      interval = repetitions === 1 ? Math.max(interval + 1, 1) :
        repetitions === 2 ? Math.max(interval + 1, 6) : Math.round(interval * ease);
    } else {
      interval = Math.max(4, interval + 1, Math.round(interval * ease * 1.3));
      ease += 0.15;
    }
  }
  return { ...card, interval, ease, repetitions, due: dayOffset(now, interval) };
}

export function dueCards(cards, now = new Date()) {
  const today = dayKey(now);
  return cards.filter(card => card.due <= today).sort((a, b) => a.due.localeCompare(b.due));
}

export function progress(cards, reviewDays, now = new Date()) {
  const days = new Set(reviewDays);
  let offset = days.has(dayKey(now)) ? 0 : -1;
  let streak = 0;
  while (days.has(dayOffset(now, offset--))) streak++;
  const topics = new Map();
  for (const { question: { topic }, interval } of cards) {
    const stats = topics.get(topic) ?? { topic, total: 0, mastered: 0 };
    stats.total++;
    if (interval >= 21) stats.mastered++;
    topics.set(topic, stats);
  }
  return { streak, due: dueCards(cards, now).length, topics: [...topics.values()] };
}
