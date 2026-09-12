import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Circle, Hand, Play, Square, Trash2 } from 'lucide-react';
import { useCamera } from './useCamera';
import { encodeHands, EXAMPLES_REQUIRED, GestureSegmenter, matchSign, MAX_PHRASES, motionDistance, resample } from './personalSigns';
import { loadVocabulary, saveVocabulary } from './vocabularyStorage';
import type { LiveState } from './live';

type Phrase = { text: string; examples: number[][][] };
type Props = { liveState: LiveState; onConnect: () => void; onStop: () => void; onPhrase: (text: string) => void };

export function DirectMode({ liveState, onConnect, onStop, onPhrase }: Props) {
  const [initialVocabulary] = useState(() => loadVocabulary());
  const [phrases, setPhrases] = useState<Phrase[]>(initialVocabulary.phrases);
  const [storageError, setStorageError] = useState(initialVocabulary.error);
  const [label, setLabel] = useState('Hello');
  const [consent, setConsent] = useState(false);
  const [armed, setArmed] = useState(false);
  const [recording, setRecording] = useState('');
  const [notice, setNotice] = useState('');
  const [last, setLast] = useState('');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('Waiting for hands');
  const [history, setHistory] = useState<string[]>([]);
  const segmenter = useRef(new GestureSegmenter());
  const armedRef = useRef(false);
  const recordingRef = useRef('');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ phrases, liveState, onPhrase });
  latest.current = { phrases, liveState, onPhrase };

  useEffect(() => {
    if (phrases === initialVocabulary.phrases) return;
    setStorageError(saveVocabulary(phrases));
  }, [phrases, initialVocabulary]);

  function pause() {
    armedRef.current = false; recordingRef.current = '';
    setArmed(false); setRecording(''); clearTimeout(timeout.current);
    setProgress(0); setPhase('Waiting for hands');
    segmenter.current.reset(); onStop();
  }

  const camera = useCamera(pause, (result, now) => {
    if (!armedRef.current && !recordingRef.current) return;
    const sequence = segmenter.current.push(encodeHands(result.landmarks, result.handedness), now);
    setProgress(Math.floor(segmenter.current.frames.length / 5) * 5);
    setPhase(segmenter.current.blocked ? 'Waiting for hand release' : segmenter.current.frames.length ? 'Tracking gesture' : 'Waiting for hands');
    if (!sequence) return;
    const target = recordingRef.current;
    if (target) {
      clearTimeout(timeout.current); recordingRef.current = ''; setRecording('');
      const sample = resample(sequence);
      const previous = latest.current.phrases.find(phrase => phrase.text === target);
      if (previous?.examples.some(example => motionDistance(example, sample) > 0.14)) {
        setNotice('Example differs too much. Try the same motion again.'); return;
      }
      setPhrases(current => {
        const existing = current.find(phrase => phrase.text === target);
        if (!existing) return current.length < MAX_PHRASES ? [...current, { text: target, examples: [sample] }] : current;
        return current.map(phrase => phrase.text === target ? { ...phrase, examples: [...phrase.examples, sample].slice(0, EXAMPLES_REQUIRED) } : phrase);
      });
      setNotice(`Example saved for "${target}". Camera images were not stored.`);
      return;
    }
    const match = matchSign(sequence, latest.current.phrases);
    if (!match) { setLast('Unrecognized'); setNotice('No matching personal phrase. Nothing was sent to voice.'); return; }
    setNotice('');
    setLast(match.phrase);
    if (latest.current.liveState !== 'Connected') { setNotice('Voice is not connected. This phrase was not sent or queued.'); return; }
    setHistory(previous => [...previous, match.phrase].slice(-5));
    latest.current.onPhrase(match.phrase);
  });

  useEffect(() => {
    if (liveState === 'Disconnected' || liveState === 'Closing') {
      armedRef.current = false; setArmed(false); segmenter.current.reset();
    }
  }, [liveState]);
  useEffect(() => () => { armedRef.current = false; clearTimeout(timeout.current); }, []);

  const selected = phrases.find(phrase => phrase.text === label.trim());
  const ready = phrases.filter(phrase => phrase.examples.length === EXAMPLES_REQUIRED).length;
  const stateMessage = recording ? `Calibrating "${recording}" / ${phase}`
    : armed ? liveState === 'Connected' ? phase : 'Connecting voice / no phrases sent yet'
    : !ready ? selected ? `"${selected.text}": ${selected.examples.length}/3 calibration examples` : `No trained phrases. "${label.trim() || 'Custom phrase'}" is only a phrase label.`
    : !consent ? 'Automatic speech consent is off'
    : camera.state !== 'on' ? 'Camera is off / recognition stopped' : 'Ready / recognition stopped';
  function record() {
    pause();
    const text = label.trim();
    if (!text || camera.state !== 'on' || (selected?.examples.length ?? 0) >= EXAMPLES_REQUIRED || (!selected && phrases.length >= MAX_PHRASES)) return;
    recordingRef.current = text; setRecording(text); setNotice('');
    timeout.current = setTimeout(() => { recordingRef.current = ''; setRecording(''); segmenter.current.reset(); setNotice('No complete gesture recorded. Try again.'); }, 12_000);
  }

  return <section className="direct-section" aria-labelledby="direct-title">
    <div className="section-heading"><h2 id="direct-title">Personal signs</h2><span className="scripted">LOCAL / {ready} READY</span></div>
    <div className="viewfinder">
      <video ref={camera.video} muted playsInline aria-label="Direct camera preview" />
      <canvas ref={camera.overlay} aria-label="Direct hand landmarks" />
      {camera.state !== 'on' && <div className="camera-placeholder"><Hand size={42} /><span>{camera.state === 'starting' ? 'Starting local tracker' : 'Camera is off'}</span></div>}
      <span className="viewfinder-label">{armed ? 'RECOGNITION ON' : recording ? 'CALIBRATING' : 'LOCAL PREVIEW'} / MAX 15 FPS</span>
      <span className="direct-result" role="status">{recording ? `${phase} / ${camera.hands} hands` : last || `${camera.hands} hands tracked`}</span>
    </div>
    <p className="direct-state" role="status">{stateMessage}</p>
    {(recording || armed) && <progress className="gesture-progress" aria-label="Gesture samples" max={60} value={progress} />}
    <div className="toolbar">
      {camera.state === 'off' ? <button onClick={() => void camera.start()}><Camera size={18} />Start camera</button> : <button onClick={camera.stop}><CameraOff size={18} />Stop camera</button>}
      <button className="primary" disabled={camera.state !== 'on' || !consent || !ready || armed || !!recording || liveState === 'Closing' || liveState === 'Connecting'} onClick={() => {
        segmenter.current.reset(); setLast(''); setNotice(''); setProgress(0); setPhase('Waiting for hands'); armedRef.current = true; setArmed(true);
        if (liveState === 'Disconnected') onConnect();
      }}><Play size={17} />Start live</button>
      <button className="stop-button" disabled={!armed && !recording} onClick={pause}><Square size={16} />Stop live</button>
    </div>
    {camera.error && <p className="error" role="alert">{camera.error}</p>}
    <label className="consent"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) pause(); }} /><span>I authorize automatic speech of matched personal phrases via OpenAI while live mode is on. Camera images stay on this device.</span></label>
    <div className="calibration-heading"><h3>My vocabulary</h3><span>{phrases.length}/{MAX_PHRASES} phrases / {storageError ? 'storage unavailable' : 'saved in this browser'}</span></div>
    <p className="sample-note">Learns your gestures from three examples per phrase. Personal templates saved in this browser; no images or audio stored. Not general sign-language recognition.</p>
    {storageError && <p className="error" role="alert">{storageError}</p>}
    <label className="field-label" htmlFor="practice-phrase">Calibration phrase</label>
    <select id="practice-phrase" value={['Hello', 'Thank you', 'Nice to meet you'].includes(label) ? label : 'custom'} disabled={!!recording || armed} onChange={event => { pause(); setNotice(''); setLabel(event.target.value === 'custom' ? '' : event.target.value); }}>
      <option value="Hello">Hello</option>
      <option value="Thank you">Thank you</option>
      <option value="Nice to meet you">Nice to meet you</option>
      <option value="custom">Custom phrase</option>
    </select>
    <p className="sample-note">{`"${label.trim() || 'Custom phrase'}" / ${selected?.examples.length ?? 0}/3 examples / ${selected?.examples.length === EXAMPLES_REQUIRED ? 'Ready' : 'Not trained yet'}`}</p>
    <label className="field-label" htmlFor="personal-phrase">Phrase to speak</label>
    <div className="calibration-entry"><input id="personal-phrase" value={label} maxLength={120} disabled={!!recording || armed} onChange={event => setLabel(event.target.value)} /><button disabled={camera.state !== 'on' || armed || !!recording || !label.trim() || (selected?.examples.length ?? 0) >= EXAMPLES_REQUIRED || (!selected && phrases.length >= MAX_PHRASES)} onClick={record}><Circle size={16} />Record example {(selected?.examples.length ?? 0) + 1 > 3 ? 3 : (selected?.examples.length ?? 0) + 1}/3</button></div>
    <ul className="personal-vocabulary">{phrases.map(phrase => <li key={phrase.text}><button className="phrase-select" onClick={() => { pause(); setLabel(phrase.text); }}><span>{phrase.text}</span><small>{phrase.examples.length}/3 {phrase.examples.length === 3 ? 'Ready' : 'Calibrating'}</small></button><button className="icon-button" aria-label={`Delete phrase ${phrase.text}`} title={`Delete phrase ${phrase.text}`} onClick={() => { pause(); setPhrases(previous => previous.filter(item => item.text !== phrase.text)); }}><Trash2 size={16} /></button></li>)}</ul>
    {notice && <p className="sample-note" role="status">{notice}</p>}
    <p className="sample-note">Three examples per phrase. Personal hand-motion matching, not a general ASL translator. A moving gesture ends after 700 ms of stillness, hand withdrawal, or four seconds. Hands must leave the frame before another live gesture. Face and body grammar are not recognized. Calibration stays in this browser until deleted or site data is cleared.</p>
    <div className="direct-history"><h3>Recognized and sent</h3><p aria-live="polite">{history.length ? history.join(' / ') : 'No phrases sent.'}</p></div>
  </section>;
}
