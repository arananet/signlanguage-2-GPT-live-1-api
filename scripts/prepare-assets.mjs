import { cp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Enable TLS certificate verification.');
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < 1_000_000 || bytes.length > 20_000_000) throw new Error('Unexpected model size.');
await writeFile('public/models/hand_landmarker.task', bytes);
console.log(`Local hand model ready. SHA-256: ${createHash('sha256').update(bytes).digest('hex')}`);
