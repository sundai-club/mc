const test = require('node:test');
const assert = require('node:assert/strict');

const style = require('../moderator-style');
const { validateGeneratedQuestion } = require('../config');

test('keeps Frido-style fallback questions within the local question contract', () => {
  assert.ok(style.systemPrompt.includes('biggest leverage'));
  assert.ok(style.systemPrompt.includes('Do not imitate an accent'));
  for (const question of style.fallbackQuestions) {
    assert.equal(validateGeneratedQuestion(question), question);
  }
});

test('pre-generates every fixed Frido-style moderator phrase with safe unique filenames', () => {
  const entries = style.audioEntries(2, 3);
  assert.equal(entries.length, 7);
  assert.equal(new Set(entries.map(({ filename }) => filename)).size, entries.length);
  for (const { text, filename } of entries) {
    assert.ok(text.length > 0);
    assert.match(filename, /^[a-z0-9_]+\.wav$/);
  }
  assert.equal(entries[0].text, "Yes, let's start. You have 2 minutes to show us what you built.");
  assert.equal(entries[1].text, 'Let\'s move to questions. You have 3 minutes for Q and A.');
});

test('keeps the transcript isolated inside the generated local prompt', () => {
  const prompt = style.questionPrompt('demo text');
  assert.match(prompt, /<transcript>\ndemo text\n<\/transcript>$/);
  assert.match(prompt, /at most 20 words total/);
});
