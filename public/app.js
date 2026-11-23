import { generateQuiz, isCorrect } from '/lib/quiz.js';
import { dayKey, dueCards, newCard, progress, RATINGS, schedule } from '/lib/scheduler.js';
import { loadState, saveState } from '/lib/storage.js';

const byId = id => document.getElementById(id);
const textarea = byId('note-text');
const upload = byId('upload-file');
const QUIZ_TYPES = {
  'multiple-choice': 'Multiple choice',
  'true-false': 'True / false',
  'short-answer': 'Short answer',
};
const RATING_HELP = ['Didn’t recall it', 'Needed effort', 'Recalled it', 'Recalled it quickly'];
let storage;
try { storage = window.localStorage; } catch { /* The workspace can still run in memory. */ }
const state = loadState(storage);
let session = null;
let loadVersion = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(text, destination, style = 'primary') {
  const node = element('a', text, `button ${style}`);
  node.href = destination;
  return node;
}

function button(text, onClick, style = 'primary') {
  const node = element('button', text, `button ${style}`);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function editorStatus(message = '') {
  const node = byId('editor-status');
  node.textContent = message;
  node.hidden = !message;
}

function renderDueBadge() {
  const badge = byId('nav-due');
  const count = dueCards(state.cards).length;
  badge.textContent = count;
  badge.hidden = !count;
}

function persist() {
  byId('storage-warning').hidden = saveState(storage, state);
}

function updateNotes(notes) {
  textarea.value = notes.slice(0, textarea.maxLength);
  byId('char-count').textContent = `${textarea.value.length.toLocaleString()} characters`;
  if (state.notes !== textarea.value) {
    state.notes = textarea.value;
    persist();
  }
}

function empty(body, title, message, action) {
  body.replaceChildren(element('h2', title), element('p', message, 'muted'), action);
}

function renderQuiz() {
  const body = byId('quiz-body');
  if (!session) {
    empty(body, 'No active quiz', 'Generate a quiz from your study notes to get started.', link('Go to notes →', '#notes'));
    return;
  }
  const { questions, index, score, result } = session;
  if (index >= questions.length) {
    const restart = button('Try again', () => {
      session = { questions, index: 0, score: 0, result: null };
      renderQuiz();
    }, 'secondary');
    empty(body, `Quiz complete · ${score} / ${questions.length}`, 'Your quiz cards are saved to your daily review plan. Quiz attempts don’t change their schedule.', link('Open daily review →', '#review'));
    body.append(' ', restart);
    body.querySelector('a').focus();
    return;
  }

  const question = questions[index];
  const meta = element('div', undefined, 'question-meta');
  meta.append(element('span', QUIZ_TYPES[question.type], 'pill'), element('span', `Question ${index + 1} of ${questions.length} · Score ${score}`));
  const bar = element('progress', undefined, 'quiz-progress');
  bar.max = questions.length;
  bar.value = index + Number(Boolean(result));
  bar.setAttribute('aria-label', 'Quiz completion');
  const prompt = element('h2', question.prompt, 'prompt');
  prompt.tabIndex = -1;
  body.replaceChildren(meta, bar, element('p', question.topic, 'question-topic'), prompt);
  const check = response => {
    if (!response.trim() || session.result) return;
    const correct = isCorrect(question, response);
    session.score += Number(correct);
    session.result = { response, correct };
    renderQuiz();
  };

  if (question.options.length) {
    const choices = element('div', undefined, 'choices');
    for (const option of question.options) {
      const choice = button(option, () => check(option), 'choice');
      if (result) {
        choice.disabled = true;
        if (option === question.answer) choice.classList.add('correct-choice');
        else if (option === result.response) choice.classList.add('wrong-choice');
      }
      choices.append(choice);
    }
    body.append(choices);
  } else {
    const form = element('form', undefined, 'short-form');
    const input = element('input');
    input.placeholder = 'Type your answer';
    input.setAttribute('aria-label', 'Your answer');
    input.required = true;
    input.autocomplete = 'off';
    input.value = result?.response ?? '';
    input.disabled = Boolean(result);
    const submit = element('button', 'Check answer', 'button primary');
    submit.disabled = Boolean(result);
    form.append(input, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      check(input.value);
    });
    body.append(form);
  }
  if (result) {
    const feedback = element('div', undefined, `feedback ${result.correct ? 'correct' : 'incorrect'}`);
    feedback.tabIndex = -1;
    feedback.append(element('strong', result.correct ? 'Correct!' : `Not quite. Answer: ${question.answer}`), element('p', question.explanation));
    body.append(feedback, button(index + 1 === questions.length ? 'See score →' : 'Next question →', () => {
      session.index++;
      session.result = null;
      renderQuiz();
    }));
    feedback.focus();
  } else {
    prompt.focus();
  }
}

function renderReview(message = '') {
  const body = byId('review-body');
  const queue = dueCards(state.cards);
  if (!queue.length) {
    const nextDate = state.cards.map(card => card.due).sort()[0];
    empty(body, nextDate ? 'You’re caught up!' : 'Nothing to review yet', nextDate ? `Next review: ${nextDate}. Come back then to keep building recall.` : 'Generate a quiz to add cards to your review plan.', link(nextDate ? 'See progress →' : 'Go to notes →', nextDate ? '#progress' : '#notes'));
  } else {
    const [card] = queue;
    const prompt = element('h2', card.question.prompt, 'prompt');
    const actions = element('div');
    actions.append(button('Reveal answer', () => {
      const answer = element('div', undefined, 'feedback correct');
      answer.tabIndex = -1;
      answer.append(element('strong', card.question.answer), element('p', card.question.explanation));
      const ratings = element('div', undefined, 'ratings');
      for (const [index, rating] of RATINGS.entries()) {
        const option = button(rating, () => {
          const now = new Date();
          const updated = schedule(card, rating, now);
          state.cards[state.cards.indexOf(card)] = updated;
          const today = dayKey(now);
          if (!state.reviewDays.includes(today)) state.reviewDays.push(today);
          persist();
          renderDueBadge();
          renderReview(`Rated ${rating}. Next review: ${updated.due}.`);
        }, 'secondary rating');
        option.append(element('small', RATING_HELP[index]));
        ratings.append(option);
      }
      actions.replaceChildren(answer, ratings);
      answer.focus();
    }));
    body.replaceChildren(element('span', `${queue.length} due today`, 'pill'), element('p', card.question.topic, 'question-topic'), prompt, actions);
  }
  if (message) {
    const status = element('p', message, 'review-note');
    status.tabIndex = -1;
    body.prepend(status);
    status.focus();
  }
}

function renderProgress() {
  const body = byId('progress-body');
  const stats = progress(state.cards, state.reviewDays);
  const metrics = element('div', undefined, 'metrics');
  for (const [label, value, detail] of [
    ['Review streak', `${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`, 'Consecutive days you rated a card'],
    ['Due today', stats.due, 'Includes overdue cards'],
    ['Cards in your plan', state.cards.length, 'Across all topics'],
  ]) {
    const metric = element('div', undefined, 'panel metric');
    metric.append(element('p', label, 'eyebrow'), element('strong', value), element('small', detail, 'muted'));
    metrics.append(metric);
  }
  const topics = element('div', undefined, 'panel content-panel');
  topics.append(element('h2', 'Mastery by topic'), element('p', 'A card counts as mastered once its review interval reaches 21 days.', 'muted'));
  if (!stats.topics.length) topics.append(element('p', 'Generate your first quiz to start tracking a topic.', 'privacy'));
  for (const { topic, total, mastered } of stats.topics) {
    const row = element('div', undefined, 'topic-row');
    const label = element('div');
    label.append(element('strong', topic), element('span', `${mastered} / ${total} mastered`, 'muted'));
    const meter = element('progress');
    meter.setAttribute('aria-label', `Mastery: ${topic}`);
    meter.max = total;
    meter.value = mastered;
    row.append(label, meter);
    topics.append(row);
  }
  body.replaceChildren(metrics, topics);
}

function renderRoute() {
  const views = [...document.querySelectorAll('.view')];
  const name = location.hash.slice(1);
  const active = views.find(view => view.id === name)?.id ?? 'notes';
  for (const view of views) view.hidden = view.id !== active;
  for (const item of document.querySelectorAll('nav a')) {
    if (item.hash === `#${active}`) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  renderDueBadge();
  if (active === 'quiz') renderQuiz();
  if (active === 'review') renderReview();
  if (active === 'progress') renderProgress();
}

textarea.addEventListener('input', () => {
  loadVersion++;
  updateNotes(textarea.value);
  editorStatus();
});

upload.addEventListener('change', async () => {
  const [file] = upload.files;
  upload.value = '';
  if (!file) return;
  const version = ++loadVersion;
  if (!/\.(txt|md|markdown)$/iu.test(file.name) || file.size > textarea.maxLength * 4) {
    editorStatus('Choose a .txt or Markdown file with up to 50,000 characters.');
    return;
  }
  try {
    const notes = await file.text();
    if (version !== loadVersion) return;
    if (notes.length > textarea.maxLength) {
      editorStatus('This file exceeds 50,000 characters. Try a shorter excerpt.');
      return;
    }
    updateNotes(notes);
    editorStatus(`Loaded ${file.name}.`);
  } catch {
    if (version === loadVersion) editorStatus('This file could not be read. Try pasting its text instead.');
  }
});

for (const sample of document.querySelectorAll('[data-sample]')) {
  sample.addEventListener('click', async () => {
    const version = ++loadVersion;
    try {
      const response = await fetch(`/examples/${sample.dataset.sample}.md`);
      if (!response.ok) throw new Error('Sample not available');
      const notes = await response.text();
      if (version !== loadVersion) return;
      updateNotes(notes);
      editorStatus(`Loaded ${sample.querySelector('strong').textContent}.`);
    } catch {
      if (version === loadVersion) editorStatus('Couldn’t load the example. You can still paste your own notes.');
    }
  });
}

byId('notes-form').addEventListener('submit', event => {
  event.preventDefault();
  const questions = generateQuiz(textarea.value);
  if (!questions.length) {
    editorStatus('Add a few complete sentences or bullet points so there’s something to quiz.');
    textarea.focus();
    return;
  }
  const existing = new Set(state.cards.map(card => card.question.id));
  state.cards.push(...questions.filter(question => !existing.has(question.id)).map(question => newCard(question)));
  persist();
  session = { questions, index: 0, score: 0, result: null };
  location.hash = 'quiz';
  renderRoute();
});

updateNotes(state.notes);
window.addEventListener('hashchange', () => {
  renderRoute();
  window.scrollTo(0, 0);
});
window.addEventListener('focus', () => {
  renderDueBadge();
  if (location.hash === '#progress') renderProgress();
});
renderRoute();
