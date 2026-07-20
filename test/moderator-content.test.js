const test = require('node:test');
const assert = require('node:assert/strict');

const content = require('../moderator-content');
const { validateGeneratedQuestion } = require('../config');

test('keeps shared fallback questions within the local question contract', () => {
  assert.ok(content.systemPrompt.includes('this exact project'));
  assert.ok(content.systemPrompt.includes('could not be asked unchanged'));
  assert.ok(content.systemPrompt.includes('regardless of the selected text-to-speech voice'));
  assert.doesNotMatch(content.systemPrompt, /Frido|Gabriella|Abhishek/i);
  for (const question of content.fallbackQuestions) {
    assert.equal(validateGeneratedQuestion(question), question);
  }
});

test('pre-generates the same fixed moderator wording for every voice', () => {
  const entries = content.audioEntries(2, 3);
  assert.equal(entries.length, 14);
  assert.equal(new Set(entries.map(({ filename }) => filename)).size, entries.length);
  for (const { text, filename } of entries) {
    assert.ok(text.length > 0);
    assert.match(filename, /^[a-z0-9_]+\.wav$/);
  }
  assert.equal(entries[0].text, "Yes, let's start. You have 2 minutes to show us what you built.");
  assert.equal(entries[1].text, 'Let\'s move to questions. You have 3 minutes for Q and A.');
  assert.equal(entries[2].text, 'Let me think of a good question for you.');
  assert.equal(entries[3].text, 'Twenty seconds left!');
});

test('provides five distinct calm variants for every completion state', () => {
  assert.deepEqual(Object.keys(content.completionPhrases), ['demo', 'session']);
  for (const type of ['demo', 'session']) {
    const phrases = content.completionPhrases[type];
    assert.equal(phrases.length, 5);
    assert.equal(new Set(phrases).size, 5);
    for (const phrase of phrases) {
      assert.ok(phrase.length > 0);
      assert.doesNotMatch(phrase, /amazing|fantastic|incredible|impressive|outstanding/i);
    }
  }
  for (const phrase of content.completionPhrases.session) {
    assert.match(phrase, /demo/i);
    assert.doesNotMatch(phrase, /full session/i);
  }
});

test('does not select the same completion variant twice in a row', () => {
  assert.equal(content.chooseNonRepeatingIndex(5, -1, () => 0.4), 2);
  assert.equal(content.chooseNonRepeatingIndex(5, 2, () => 0), 3);
  assert.equal(content.chooseNonRepeatingIndex(5, 2, () => 0.999), 1);
  assert.equal(content.chooseNonRepeatingIndex(1, 0, () => 0), 0);
});

test('keeps the transcript isolated inside the generated local prompt', () => {
  const prompt = content.questionPrompt('demo text');
  assert.match(prompt, /<transcript>\ndemo text\n<\/transcript>$/);
  assert.match(prompt, /at most 28 words total/);
  assert.match(prompt, /anchor copied exactly/i);
  assert.match(prompt, /could not be asked unchanged/i);
  assert.match(prompt, /unstated factual premise/i);
});
