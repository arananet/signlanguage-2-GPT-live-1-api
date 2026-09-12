import { useEffect, useRef, useState } from 'react';
import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { INFERENCE_INTERVAL } from './personalSigns';

export type Frame = { image: string; timeMs: number };

export function useCamera(onInvalidate: () => void, onLandmarks?: (result: HandLandmarkerResult, now: number) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const resources = useRef<{ stream?: MediaStream; tracker?: HandLandmarker; animation?: number; timer?: number }>({});
  const generation = useRef(0);
  const invalidate = useRef(onInvalidate);
  invalidate.current = onInvalidate;
  const consume = useRef(onLandmarks);
  consume.current = onLandmarks;
  const [state, setState] = useState<'off' | 'starting' | 'on'>('off');
  const [hands, setHands] = useState(0);
  const [error, setError] = useState('');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [recording, setRecording] = useState(false);

  function clear() {
    clearInterval(resources.current.timer);
    setRecording(false);
    setFrames([]);
    invalidate.current();
  }

  function stop() {
    generation.current += 1;
    clear();
    const current = resources.current;
    cancelAnimationFrame(current.animation ?? 0);
    current.stream?.getTracks().forEach(track => track.stop());
    current.tracker?.close();
    resources.current = {};
    if (video.current) video.current.srcObject = null;
    overlay.current?.getContext('2d')?.clearRect(0, 0, 640, 480);
    setState('off');
    setHands(0);
  }

  async function start() {
    stop();
    const version = generation.current;
    setError('');
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (version !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      resources.current.stream = stream;
      stream.getTracks().forEach(track => track.addEventListener('ended', stop, { once: true }));
      video.current!.srcObject = stream;
      await video.current!.play();
      const { HandLandmarker, FilesetResolver, DrawingUtils } = await import('@mediapipe/tasks-vision');
      if (version !== generation.current) return;
      const files = await FilesetResolver.forVisionTasks('/wasm');
      if (version !== generation.current) return;
      const tracker = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/models/hand_landmarker.task' }, runningMode: 'VIDEO', numHands: 2 });
      if (version !== generation.current) { tracker.close(); return; }
      resources.current.tracker = tracker;
      setState('on');
      let lastTime = -1;
      let lastCount = -1;
      let lastInference = -Infinity;
      function draw() {
        if (version !== generation.current) return;
        const player = video.current;
        const canvas = overlay.current;
        const now = performance.now();
        if (player && canvas && player.readyState >= 2 && player.currentTime !== lastTime && now - lastInference >= INFERENCE_INTERVAL) {
          lastInference = now;
          lastTime = player.currentTime;
          try {
            canvas.width = player.videoWidth;
            canvas.height = player.videoHeight;
            const context = canvas.getContext('2d')!;
            const result = tracker.detectForVideo(player, now);
            consume.current?.(result, now);
            if (lastCount !== result.landmarks.length) { lastCount = result.landmarks.length; setHands(lastCount); }
            const drawing = new DrawingUtils(context);
            for (const landmarks of result.landmarks) {
              drawing.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: '#74f7bb', lineWidth: 3 });
              drawing.drawLandmarks(landmarks, { color: '#ffffff', radius: 3 });
            }
          } catch { stop(); setError('Hand tracking failed. Restart the camera.'); return; }
        }
        resources.current.animation = requestAnimationFrame(draw);
      }
      draw();
      return true;
    } catch {
      if (version !== generation.current) return;
      stop();
      setError('Camera or tracking unavailable. Check camera permission and run npm run assets. Typed text is still available.');
    }
  }

  function capture() {
    clear();
    setError('');
    if (state !== 'on') return;
    setRecording(true);
    const started = performance.now();
    const captured: Frame[] = [];
    const canvas = document.createElement('canvas');
    const sample = () => {
      const player = video.current;
      const elapsed = Math.round(performance.now() - started);
      if (!player || player.readyState < 2 || elapsed > 5500) {
        clearInterval(resources.current.timer);
        setRecording(false);
        if (captured.length < 4) { setFrames([]); setError('Capture interrupted. Please record again.'); }
        return;
      }
      canvas.width = 640;
      canvas.height = Math.round(640 * player.videoHeight / player.videoWidth);
      canvas.getContext('2d')!.drawImage(player, 0, 0, canvas.width, canvas.height);
      captured.push({ image: canvas.toDataURL('image/jpeg', 0.65), timeMs: elapsed });
      setFrames([...captured]);
      if (captured.length === 10) { clearInterval(resources.current.timer); setRecording(false); }
    };
    resources.current.timer = window.setInterval(sample, 500);
    sample();
  }

  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stop(); };
  }, []);
  return { video, overlay, state, hands, error, frames, recording, start, stop, capture, clear };
}
