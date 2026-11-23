import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey, dueCards, newCard, progress, schedule } from '../lib/scheduler.js';

const question = { topic: 'Biology' };
const local = day => new Date(2026, 11, day, 12);

test('correct reviews grow intervals; again shrinks an established interval and resets repetitions', () => {
  const card = newCard(question, local(1));
  const first = schedule(card, 'good', local(1));
  const second = schedule(first, 'good', local(2));
  const third = schedule(second, 'good', local(8));
  const reset = schedule(third, 'again', local(23));
  assert.deepEqual([first.interval, second.interval, third.interval, reset.interval], [1, 6, 15, 1]);
  assert.equal(reset.repetitions, 0);
  assert.ok(reset.ease < third.ease);
  assert.equal(reset.due, '2026-12-24');
  assert.equal(card.interval, 0);
});

test('hard grows more slowly than easy and ease stays above its floor', () => {
  const card = { ...newCard(question, local(1)), interval: 6, ease: 1.35 };
  const hard = schedule(card, 'hard', local(1));
  const easy = schedule(card, 'easy', local(1));
  assert.ok(easy.interval > hard.interval && hard.interval > card.interval);
  assert.equal(hard.ease, 1.3);
  assert.ok(easy.ease > card.ease);
  assert.throws(() => schedule(card, 'unknown', local(1)), RangeError);
});

test('the daily queue contains today and overdue, ordered oldest first', () => {
  const older = newCard(question, local(1));
  const today = newCard(question, local(2));
  const later = schedule(today, 'good', local(2));
  assert.deepEqual(dueCards([today, later, older], local(2)), [older, today]);
  assert.equal(schedule(today, 'again', local(31)).due, '2027-01-01');
});

test('progress counts a streak through yesterday and tracks mastery by topic', () => {
  const card = newCard(question, local(1));
  const mastered = { ...newCard({ topic: 'History' }, local(20)), interval: 21 };
  const reviewDays = [local(2), local(3), local(4), local(6)].map(dayKey);
  assert.deepEqual(progress([card, mastered], reviewDays, local(5)), {
    streak: 3, due: 1, topics: [
      { topic: 'Biology', total: 1, mastered: 0 },
      { topic: 'History', total: 1, mastered: 1 },
    ],
  });
  assert.equal(progress([], reviewDays, local(6)).streak, 1);
});
