import DynamicTimeWarping from 'dynamic-time-warping';

export const SAMPLE_COUNT = 20;
export const EXAMPLES_REQUIRED = 3;
export const MAX_PHRASES = 8;
export const INFERENCE_INTERVAL = 1000 / 15;

export function encodeHands(landmarks, handedness) {
  if (!landmarks.length || landmarks.length > 2) return null;
  const slots = [Array(67).fill(0), Array(67).fill(0)];
  const used = new Set();
  for (let handIndex = 0; handIndex < landmarks.length; handIndex += 1) {
    const points = landmarks[handIndex];
    if (points.length !== 21 || points.some(point => ![point.x, point.y, point.z].every(Number.isFinite))) return null;
    const side = handedness[handIndex]?.[0]?.categoryName;
    if (side !== 'Left' && side !== 'Right') return null;
    const slot = side === 'Left' ? 0 : 1;
    if (used.has(slot)) return null;
    used.add(slot);
    const wrist = points[0];
    const palm = points[9];
    const scale = Math.hypot(palm.x - wrist.x, palm.y - wrist.y, palm.z - wrist.z);
    if (scale < 0.015) return null;
    slots[slot] = [2, wrist.x * 0.4, wrist.y * 0.4, wrist.z * 0.4, ...points.flatMap(point =>
      [(point.x - wrist.x) / scale, (point.y - wrist.y) / scale, (point.z - wrist.z) / scale].map(value => Math.max(-4, Math.min(4, value)) / 4))];
  }
  return slots.flat();
}

export function resample(sequence) {
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const position = index * (sequence.length - 1) / (SAMPLE_COUNT - 1);
    const lower = Math.floor(position);
    const fraction = position - lower;
    return sequence[lower].map((value, axis) => value + ((sequence[Math.min(lower + 1, sequence.length - 1)][axis] - value) * fraction));
  });
}

export function motionDistance(first, second) {
  const distance = new DynamicTimeWarping(first, second, (left, right) =>
    Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0) / left.length));
  return distance.getDistance() / distance.getPath().length;
}

export function matchSign(sequence, phrases) {
  if (sequence.length < 8) return null;
  const sample = resample(sequence);
  const candidates = phrases.filter(phrase => phrase.examples.length === EXAMPLES_REQUIRED).map(phrase => {
    const distances = phrase.examples.map(example => motionDistance(sample, example)).sort((first, second) => first - second);
    const variation = Math.max(...phrase.examples.flatMap((example, index) => phrase.examples.slice(index + 1).map(other => motionDistance(example, other))));
    return { phrase: phrase.text, distance: (distances[0] + distances[1]) / 2, threshold: Math.min(0.14, Math.max(0.045, variation * 1.5 + 0.015)) };
  }).sort((first, second) => first.distance - second.distance);
  const best = candidates[0];
  if (!best || best.distance > best.threshold) return null;
  if (candidates[1] && candidates[1].distance - best.distance < 0.025) return null;
  return best;
}

export class GestureSegmenter {
  frames = [];
  started = 0;
  lastSeen = 0;
  blocked = false;
  anchor = null;
  lastMovement = 0;
  moved = false;

  reset() { this.frames = []; this.started = 0; this.lastSeen = 0; this.blocked = false; this.anchor = null; this.lastMovement = 0; this.moved = false; }

  push(feature, now) {
    if (!feature) {
      if (now - this.lastSeen < 350) return null;
      const segment = this.frames.length >= 8 && this.lastSeen - this.started >= 450 ? this.frames : null;
      this.reset();
      return segment;
    }
    this.lastSeen = now;
    if (this.blocked) return null;
    if (!this.frames.length) { this.started = now; this.anchor = feature; this.lastMovement = now; }
    if (feature.some((value, index) => Math.abs(value - this.anchor[index]) >= 0.012)) {
      this.anchor = feature;
      this.lastMovement = now;
      this.moved = true;
    }
    this.frames.push(feature);
    const settled = this.moved && now - this.lastMovement >= 700 && this.frames.length >= 8 && now - this.started >= 450;
    if (settled || this.frames.length >= 60 || now - this.started >= 4000) {
      const segment = this.frames.length >= 8 ? this.frames : null;
      this.frames = [];
      this.blocked = true;
      return segment;
    }
    return null;
  }
}
