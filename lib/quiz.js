const STOP = new Set(
  'about after also always among another because before being between both could does during each every first from have into many more most much must never only other over same should since some such than that their them then there these they this those through under until upon used very were what when where which while will with within without would your'.split(' '),
);

export function normalizeAnswer(value) {
  return value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/gu, ' ').replace(/[.!?,;:]+$/u, '');
}

const INLINE_MARKUP = /(\x60+)(?!\x60)([^\x60]+)\1(?!\x60)|(\*{1,3})(?![\s*])(.+?)(?<!\s)\3(?!\*)|(?<![\p{L}\p{N}_])(_{1,3})(?![\s_])(.+?)(?<!\s)\5(?![\p{L}\p{N}_])/gu;

function cleanInline(text, markedTerms = []) {
  const labels = text.replace(/!?\[([^\[\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/gu, '$1');
  return labels.replace(INLINE_MARKUP, (_, ticks, code, stars, starText, underscores, underscoreText) => {
    const term = code?.trim() ?? cleanInline(starText ?? underscoreText);
    markedTerms.push(term);
    return term;
  });
}

function excerpts(notes) {
  let topic = 'General';
  let fence;
  const result = [];
  const seen = new Set();
  for (const raw of notes.split(/\r?\n/u)) {
    const line = raw.replace(/^\s*(?:(?:>\s*|[-*+]\s+|\d+[.)]\s+))+/u, '').trim();
    if (fence) {
      if (/^(?:\x60{3,}|~{3,})$/u.test(line) && line[0] === fence[0] && line.length >= fence.length) fence = undefined;
      continue;
    }
    const opening = line.match(/^(\x60{3,})[^\x60]*$|^(~{3,}).*$/u);
    if (opening) {
      fence = opening[1] ?? opening[2];
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/u);
    if (heading) {
      topic = cleanInline(heading[1]).trim() || 'General';
      continue;
    }
    const markedTerms = [];
    const clean = cleanInline(line, markedTerms);
    for (const part of clean.split(/(?<=[.!?])\s+/u)) {
      const source = part.trim();
      const key = JSON.stringify([topic, source]);
      if (!source || seen.has(key)) continue;
      seen.add(key);
      result.push({ topic, source, markedTerms });
    }
  }
  return result;
}

function termStart(source, term) {
  const literal = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return source.search(new RegExp('(?<![\\p{L}\\p{M}\\p{N}\\p{Pc}])' + literal + '(?![\\p{L}\\p{M}\\p{N}\\p{Pc}])', 'u'));
}

function candidates(source, markedTerms) {
  const terms = markedTerms.filter(term => /^[\p{L}\p{N}][\p{L}\p{M}\p{N} -]{1,55}$/u.test(term));
  const definition = source.match(/^([\p{L}\p{M}\p{N} -]{2,55}?)(?::|\s+(?:is|are|was|were|refers to|means)\s+)/iu);
  if (definition) terms.push(definition[1].trim());
  const words = [...source.matchAll(/[\p{L}\p{M}\p{N}]{4,}(?:-[\p{L}\p{M}\p{N}]+)*/gu)]
    .map(([word]) => word)
    .filter(word => !STOP.has(normalizeAnswer(word)))
    .sort((a, b) => b.length - a.length);
  return [...terms, ...words];
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateQuiz(notes, { random = Math.random, limit = 12 } = {}) {
  const entries = excerpts(notes);
  const sentences = new Set(entries.map(({ source }) => normalizeAnswer(source)));
  const passages = entries.filter(({ source }) => source.length >= 12 && source.length <= 320).map(entry => {
    const located = candidates(entry.source, entry.markedTerms)
      .map(term => ({ term, start: termStart(entry.source, term) }))
      .filter(({ start }) => start !== -1);
    return { ...entry, terms: located.map(({ term }) => term), answer: located[0]?.term, start: located[0]?.start };
  }).filter(entry => entry.answer);
  const keyTerms = [...new Set(passages.map(({ answer }) => normalizeAnswer(answer)))];
  const pool = new Map(passages.flatMap(({ terms }) => terms.map(term => [normalizeAnswer(term), term])));
  const questions = [];
  const types = new Set();
  for (const [index, entry] of passages.entries()) {
    if (questions.length >= limit) break;
    const { source, topic, answer, start } = entry;
    const normalizedSource = normalizeAnswer(source);
    const fill = term => source.slice(0, start) + term + source.slice(start + answer.length);
    const eligible = [...pool.keys()].filter(term =>
      !normalizedSource.includes(term) && !sentences.has(normalizeAnswer(fill(pool.get(term)))),
    );
    const distractors = [
      ...shuffled(eligible.filter(term => keyTerms.includes(term)), random),
      ...shuffled(eligible.filter(term => !keyTerms.includes(term)), random),
    ].slice(0, 3).map(term => pool.get(term));
    const blank = fill('[blank]');
    const add = (type) => {
      const factual = type === 'true-false';
      const proposed = factual && distractors.length && index % 2 === 0 ? distractors[0] : answer;
      questions.push({
        id: JSON.stringify([topic, source, type]),
        topic,
        type,
        source,
        prompt: factual ? `True or false: “${proposed}” fills the blank in the original excerpt.\n${blank}` : `Fill in the blank from your notes:\n${blank}`,
        answer: factual ? (proposed === answer ? 'True' : 'False') : answer,
        options: factual ? ['True', 'False'] : type === 'multiple-choice' ? shuffled([answer, ...distractors], random) : [],
        explanation: `The missing text is “${answer}”. Your notes say: “${source}”`,
      });
      types.add(type);
    };
    const preferred = ['multiple-choice', 'true-false', 'short-answer'][index % 3];
    add(preferred === 'multiple-choice' && !distractors.length ? 'short-answer' : preferred);
    if (index === passages.length - 1) {
      for (const type of ['true-false', 'short-answer', 'multiple-choice']) {
        if (questions.length < limit && !types.has(type) && (type !== 'multiple-choice' || distractors.length)) add(type);
      }
    }
  }
  return questions;
}

export function isCorrect(question, response) {
  return normalizeAnswer(response) === normalizeAnswer(question.answer);
}
