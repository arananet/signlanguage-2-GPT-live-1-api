import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeHands, resample, matchSign, GestureSegmenter, INFERENCE_INTERVAL } from '../src/personalSigns.js';

const motion = (offset = 0, length = 30) => Array.from({ length }, (_, index) => [index / (length - 1) * 0.1 + offset, offset, 0]);
const phrase = (text, offset) => ({ text, examples: [resample(motion(offset)), resample(motion(offset + 0.005)), resample(motion(offset - 0.005))] });

test('temporal matching handles different sampling speeds and rejects unknown or ambiguous motions', () => {
  const phrases = [phrase('Hello', 0), phrase('Water', 0.4)];
  assert.equal(matchSign(motion(0, 45), phrases)?.phrase, 'Hello');
  assert.equal(matchSign(motion(0.4, 15), phrases)?.phrase, 'Water');
  assert.equal(matchSign(motion(1), phrases), null);
  assert.equal(matchSign(motion(), [phrase('Hello', 0), phrase('Other', 0.005)]), null);
  assert.equal(matchSign(motion(0, 3), phrases), null);
  assert.equal(matchSign(motion(), [{ text: 'Not ready', examples: [resample(motion())] }]), null);
});

test('normalization preserves side and hand relationships, and rejects malformed data', () => {
  const points = Array.from({ length: 21 }, (_, index) => ({ x: 0.2 + index * 0.01, y: 0.3 + index * 0.02, z: 0 }));
  const encoded = encodeHands([points], [[{ categoryName: 'Right' }]]);
  assert.equal(encoded.length, 134);
  assert.equal(encoded[67], 2);
  assert.deepEqual(encoded.slice(0, 67), Array(67).fill(0));
  const reversed = encodeHands([points], [[{ categoryName: 'Left' }]]);
  assert.equal(reversed[0], 2);
  assert.equal(encodeHands([], []), null);
  assert.equal(encodeHands([[{ x: NaN, y: 0, z: 0 }]], []), null);
  assert.equal(encodeHands([points], []), null);
  const moved = points.map(point => ({ x: point.x + 0.1, y: point.y, z: point.z }));
  const translated = encodeHands([moved], [[{ categoryName: 'Right' }]]);
  encoded.slice(71).forEach((value, index) => assert.ok(Math.abs(value - translated[index + 71]) < 1e-10));
});

test('segments emit only after release or bounded duration and never repeat a held pose', () => {
  const segmenter = new GestureSegmenter();
  for (let index = 0; index < 20; index += 1) assert.equal(segmenter.push([0.1], index * INFERENCE_INTERVAL), null);
  assert.equal(segmenter.push(null, 1300), null);
  assert.equal(segmenter.push(null, 1700)?.length, 20);
  assert.equal(segmenter.push(null, 2000), null);
  let emitted = 0;
  for (let index = 0; index < 180; index += 1) if (segmenter.push([0.1], 2100 + index * INFERENCE_INTERVAL)) emitted += 1;
  assert.equal(emitted, 1);
  segmenter.push(null, 15000);
  for (let index = 0; index < 60; index += 1) if (segmenter.push([0.1], 15100 + index * INFERENCE_INTERVAL)) emitted += 1;
  assert.equal(emitted, 2);
});

test('brief noise and reset cannot produce a completed gesture', () => {
  const segmenter = new GestureSegmenter();
  segmenter.push([1], 0);
  assert.equal(segmenter.push(null, 500), null);
  for (let index = 0; index < 10; index += 1) segmenter.push([1], 1000 + index * 70);
  segmenter.reset();
  assert.equal(segmenter.push(null, 3000), null);
});

test('two movements with a brief pause form one gesture and settle without hand withdrawal', () => {
  const segmenter = new GestureSegmenter();
  const sequence = [
    ...Array.from({ length: 10 }, (_, index) => [index * 0.02]),
    ...Array.from({ length: 5 }, () => [0.18]),
    ...Array.from({ length: 10 }, (_, index) => [0.18 + index * 0.02]),
    ...Array.from({ length: 12 }, () => [0.36]),
  ];
  const completed = [];
  sequence.forEach((feature, index) => {
    const segment = segmenter.push(feature, index * INFERENCE_INTERVAL);
    if (segment) completed.push(segment);
  });
  assert.equal(completed.length, 1);
  assert.ok(completed[0].some(feature => feature[0] === 0.36));
  assert.ok(completed[0].length < 60);
  for (let index = 0; index < 90; index += 1) assert.equal(segmenter.push([0.36], 3000 + index * INFERENCE_INTERVAL), null);
  segmenter.push(null, 10000);
  assert.equal(segmenter.blocked, false);
});
