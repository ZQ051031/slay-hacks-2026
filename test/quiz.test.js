import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { generateQuiz, isCorrect, normalizeAnswer } from '../lib/quiz.js';

const notes = readFileSync(new URL('../examples/photosynthesis.md', import.meta.url), 'utf8');
const cleanNotes = notes.replace(/^# |^- |\*\*/gmu, '');
const questions = generateQuiz(notes, { random: () => 0.4 });
const markdown = /\*\*|__|\x60|\[[^\]]+\]\([^)]*\)/u;

test('generates all three formats, with no empty prompts and exact source excerpts', () => {
  assert.deepEqual(new Set(questions.map(question => question.type)), new Set(['multiple-choice', 'true-false', 'short-answer']));
  for (const question of questions) {
    assert.match(question.prompt, /\[blank\]/);
    assert.ok(cleanNotes.includes(question.source));
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
    for (const option of options) assert.ok(normalizeAnswer(cleanNotes).includes(normalizeAnswer(option)));
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
    assert.equal(cloze.replace('[blank]', proposed) === source, answer === 'True');
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

test('all examples generate quiz fields without Markdown syntax', () => {
  const examples = new URL('../examples/', import.meta.url);
  for (const file of readdirSync(examples).filter(name => /\.(md|markdown|txt)$/iu.test(name))) {
    const generated = generateQuiz(readFileSync(new URL(file, examples), 'utf8'));
    assert.ok(generated.length, file);
    for (const { prompt, options, answer, explanation, source, topic } of generated) {
      for (const field of [prompt, ...options, answer, explanation, source, topic]) {
        assert.doesNotMatch(field, markdown, file);
      }
    }
  }
});

test('cleans lists, headings, emphasis, code and link destinations before grounding questions', () => {
  const input = [
    '# **Geology** ##',
    '> 1. __Granite__ is an *igneous* rock.',
    '- `Basalt` contains _plagioclase_.',
    '+ [Obsidian](https://example.org/rocks_(glass) "Volcanic glass") forms when lava cools quickly.',
  ].join('\n');
  const generated = generateQuiz(input, { random: () => 0.4 });
  assert.deepEqual(generated.map(question => question.source), [
    'Granite is an igneous rock.',
    'Basalt contains plagioclase.',
    'Obsidian forms when lava cools quickly.',
  ]);
  for (const question of generated) {
    assert.equal(question.topic, 'Geology');
    assert.ok(question.explanation.includes(question.source));
    for (const field of [question.prompt, ...question.options, question.answer, question.explanation]) {
      assert.doesNotMatch(field, markdown);
      assert.doesNotMatch(field, /example\.org|Volcanic glass/u);
    }
  }
  assert.equal(generated[0].answer, 'Granite');
  assert.match(generated[1].explanation, /missing text is “Basalt”/);
});

test('does not offer distractors that complete a blank with another sentence from the notes', () => {
  const input = [
    '# Granite notes',
    '**Granite** is an igneous rock.',
    '**Marble** forms from limestone.',
    '# Basalt notes',
    '**Slate** often splits into thin sheets.',
    '**Basalt** is an  igneous rock.',
  ].join('\n');
  const choices = generateQuiz(input, { random: () => 0.4 }).filter(question => question.type === 'multiple-choice');
  assert.deepEqual(choices.map(question => question.answer), ['Granite', 'Basalt']);
  assert.ok(!choices[0].options.includes('Basalt'));
  assert.ok(!choices[1].options.includes('Granite'));
  const [shortAlternate] = generateQuiz('**Elephant** is up.\nOx is up.\n**Ox** grazes in the pasture.');
  assert.equal(shortAlternate.type, 'multiple-choice');
  assert.ok(!shortAlternate.options.includes('Ox'));
});

test('blanks a whole term rather than a substring of a word, including Unicode words', () => {
  for (const [notes, expected, answer] of [
    ['The catalog lists each **cat** by name.', 'The catalog lists each [blank] by name.', 'cat'],
    ['A préÉlan label is different from **Élan**.', 'A préÉlan label is different from [blank].', 'Élan'],
  ]) {
    const [question] = generateQuiz(notes);
    assert.equal(question.answer, answer);
    assert.equal(question.prompt.split('\n')[1], expected);
  }
});
