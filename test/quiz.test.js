import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateQuiz, isCorrect, normalizeAnswer } from '../lib/quiz.js';

const notes = readFileSync(new URL('../examples/photosynthesis.md', import.meta.url), 'utf8');
const questions = generateQuiz(notes, { random: () => 0.4 });

test('generates all three formats, with no empty prompts and exact source excerpts', () => {
  assert.deepEqual(new Set(questions.map(question => question.type)), new Set(['multiple-choice', 'true-false', 'short-answer']));
  for (const question of questions) {
    assert.match(question.prompt, /_____/);
    assert.ok(notes.includes(question.source));
    assert.ok(question.explanation.includes(question.source));
    assert.equal(question.topic, 'Photosynthesis');
  }
});

test('multiple-choice answers and distinct distractors come from the notes', () => {
  for (const { answer, options, source } of questions.filter(question => question.type === 'multiple-choice')) {
    assert.ok(options.length >= 2);
    assert.ok(options.includes(answer));
    assert.ok(source.includes(answer));
    assert.equal(new Set(options.map(normalizeAnswer)).size, options.length);
    for (const option of options) assert.ok(normalizeAnswer(notes).includes(normalizeAnswer(option)));
    for (const option of options.filter(option => option !== answer)) {
      assert.ok(!normalizeAnswer(source).includes(normalizeAnswer(option)));
    }
  }
});

test('true/false checks the original quoted excerpt rather than claiming outside facts', () => {
  const binary = questions.filter(question => question.type === 'true-false');
  assert.deepEqual(new Set(binary.map(question => question.answer)), new Set(['True', 'False']));
  for (const { prompt, options, answer, source } of binary) {
    const [ , proposed ] = prompt.match(/“([^”]+)”/u);
    const cloze = prompt.split('\n')[1];
    assert.deepEqual(options, ['True', 'False']);
    assert.equal(cloze.replace('_____', proposed) === source, answer === 'True');
  }
});

test('short answers match casing, spacing, and trailing sentence punctuation leniently', () => {
  const [question] = questions.filter(item => item.type === 'short-answer');
  assert.ok(question.source.includes(question.answer));
  assert.ok(isCorrect(question, '  CARBON   DIOXIDE. '));
  assert.ok(!isCorrect(question, 'oxygen'));
});

test('tiny, repeated and alternate note sets are handled without empty cards or fabricated choices', () => {
  assert.deepEqual(generateQuiz('# Only a heading\n- ...'), []);
  const tiny = generateQuiz('Mitosis: cells divide.');
  assert.ok(tiny.every(question => question.prompt.trim() && question.answer.trim()));
  const plain = generateQuiz('Granite is an igneous rock. Basalt is an igneous rock.\nGranite is an igneous rock.');
  assert.equal(new Set(plain.map(question => question.id)).size, plain.length);
  assert.ok(plain.every(question => question.topic === 'General'));
  assert.ok(!plain.some(question => question.explanation.includes('Chlorophyll')));
});
