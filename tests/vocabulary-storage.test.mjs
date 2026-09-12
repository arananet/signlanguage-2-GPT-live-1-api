import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVocabulary, saveVocabulary, VOCABULARY_KEY } from '../src/vocabularyStorage.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function phrase(text = 'Hello', count = 3) {
  return { text, examples: Array.from({ length: count }, () => Array.from({ length: 20 }, () => Array(134).fill(0.25))) };
}

test('vocabulary round-trips partial and complete examples, updates and deletions locally', () => {
  const storage = memoryStorage();
  const phrases = [phrase(), phrase('Nice to meet you', 1)];
  assert.deepEqual(loadVocabulary(storage), { phrases: [], error: '' });
  assert.equal(saveVocabulary(phrases, storage), '');
  assert.deepEqual(loadVocabulary(storage), { phrases, error: '' });
  assert.equal(saveVocabulary(phrases.slice(1), storage), '');
  assert.deepEqual(loadVocabulary(storage).phrases, phrases.slice(1));
  assert.equal(saveVocabulary([], storage), '');
  assert.equal(storage.getItem(VOCABULARY_KEY), null);
});

test('corrupt, incompatible and unbounded saved templates are rejected without modifying storage', () => {
  const storage = memoryStorage();
  const valid = { version: 1, features: 'hand-slots-134-v1', phrases: [phrase()] };
  const invalid = [
    '{bad json', 'x'.repeat(2_000_001),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, features: 'other-encoding' }),
    JSON.stringify({ ...valid, phrases: [phrase(), phrase()] }),
    JSON.stringify({ ...valid, phrases: Array.from({ length: 9 }, (_, index) => phrase(`Phrase ${index}`)) }),
    JSON.stringify({ ...valid, phrases: [phrase('Hello', 4)] }),
    JSON.stringify({ ...valid, phrases: [{ text: '', examples: phrase().examples }] }),
    JSON.stringify({ ...valid, phrases: [{ text: 'Hello', examples: [[[0]]] }] }),
    JSON.stringify(valid).replace('0.25', 'null'),
  ];
  for (const raw of invalid) {
    storage.setItem(VOCABULARY_KEY, raw);
    assert.deepEqual(loadVocabulary(storage).phrases, []);
    assert.match(loadVocabulary(storage).error, /could not be loaded/);
    assert.equal(storage.getItem(VOCABULARY_KEY), raw);
  }
});

test('denied storage and quota failures return actionable errors without throwing', () => {
  const denied = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota'); }, removeItem() { throw new Error('Denied'); } };
  assert.match(loadVocabulary(denied).error, /could not be loaded/);
  assert.match(saveVocabulary([phrase()], denied), /could not be saved/);
  assert.match(saveVocabulary([], denied), /including deletions/);
  const malformed = phrase();
  malformed.examples[0][0][0] = Infinity;
  assert.match(saveVocabulary([malformed], memoryStorage()), /could not be saved/);
});
