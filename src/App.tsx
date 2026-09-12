import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Circle, Hand, LoaderCircle, Plug, ScanLine, ShieldCheck, Square, Trash2, Volume2, ArrowDownToLine, ExternalLink } from 'lucide-react';
import { useCamera } from './useCamera';
import { LiveVoice, type LiveState } from './live';
import { Scenario, turns } from './Scenario';
import { DirectMode } from './DirectMode';

const examples = [
  { name: 'Introduction', text: 'Hello, my name is Alex. It is nice to meet you.' },
  { name: 'Everyday request', text: 'Could I have a glass of water, please?' },
  { name: 'Communication preference', text: 'Please write that down so I can read it.' },
];

export default function App() {
  const [mode, setMode] = useState<'direct' | 'capture' | 'scenario'>('direct');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(false);
  const [voice, setVoice] = useState('marin');
  const [liveState, setLiveState] = useState<LiveState>('Disconnected');
  const [voiceError, setVoiceError] = useState('');
  const [output, setOutput] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [sample, setSample] = useState('');
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const audio = useRef<HTMLAudioElement>(null);
  const live = useRef<LiveVoice | null>(null);
  function cancel() {
    revision.current += 1;
    request.current?.abort();
    request.current = null;
    setBusy(false); setNote(''); setError('');
  }
  const camera = useCamera(cancel);

  useEffect(() => {
    let mounted = true;
    fetch('/api/config').then(response => response.json()).then(config => { if (mounted) setConfigured(config.configured); }).catch(() => { if (mounted) setError('Local API unavailable.'); });
    const client = new LiveVoice(audio.current!, update => {
      if (!mounted) return;
      if (update.state) setLiveState(update.state);
      if (update.error !== undefined) setVoiceError(update.error);
      if (update.delta) setOutput(previous => (previous + update.delta).slice(-8000));
      if (update.seconds !== undefined) setSeconds(update.seconds);
    });
    live.current = client;
    const hide = () => { if (document.hidden) client.stop(); };
    const leave = () => client.dispose();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      mounted = false;
      request.current?.abort(); revision.current += 1; client.dispose();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  async function interpret() {
    if (!consent || camera.recording || camera.frames.length < 4) return;
    cancel();
    const version = revision.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setReviewed(false); setSample('');
    try {
      const response = await fetch('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent, frames: camera.frames }), signal: controller.signal });
      const result = await response.json();
      if (version !== revision.current) return;
      if (!response.ok) throw new Error(result.error || 'Interpretation unavailable.');
      setNote(result.note || 'No interpretation available.');
      if (result.uncertain || !result.transcript) { setText(''); setNote(`No reliable interpretation. ${result.note || ''}`); }
      else setText(result.transcript);
    } catch (failure) {
      if (version === revision.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Interpretation failed.');
    } finally { if (version === revision.current) setBusy(false); }
  }

  function clearAll() {
    camera.clear(); live.current?.stop();
    setText(''); setOutput(''); setReviewed(false); setConsent(false); setSample('');
  }
  function loadExample(example: typeof examples[number]) {
    cancel(); live.current?.stop();
    setText(example.text); setReviewed(false); setOutput(''); setSample(example.name);
  }

  return <>
    <header className="topbar">
      <a className="brand" href="/" aria-label="SignFlow Live home"><span className="brand-icon"><Hand size={24} /></span><span>SignFlow <strong>Live</strong></span></a>
      <span className="release">ASL communication lab <span>PREVIEW</span></span>
      <a className="source-link" href="https://github.com/arananet/signlanguage-2-GPT-live-1-api" target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a>
    </header>
    <main>
      <div className="page-heading"><div><span className="eyebrow">CAPTURE / REVIEW / VOICE</span><h1>Your words. Your say.</h1></div><span className="privacy-mark"><ShieldCheck size={17} /> No microphone access</span></div>
      <div className="mode-tabs" role="tablist" aria-label="Workspace mode">
        <button role="tab" aria-selected={mode === 'direct'} onClick={() => { if (mode === 'direct') return; camera.stop(); clearAll(); setMode('direct'); }}>Live recognition</button>
        <button role="tab" aria-selected={mode === 'capture'} onClick={() => { if (mode === 'capture') return; clearAll(); setMode('capture'); }}>Live capture</button>
        <button role="tab" aria-selected={mode === 'scenario'} onClick={() => { if (mode === 'scenario') return; camera.stop(); setMode('scenario'); loadExample({ name: 'Scripted conversation', text: turns[0].text }); }}>Conversation demo</button>
      </div>
      <div className="workspace">
        {mode === 'direct' && <DirectMode liveState={liveState} onConnect={() => { setOutput(''); void live.current?.connect(voice); }} onStop={() => live.current?.stop()} onPhrase={value => { cancel(); setText(value); setOutput(''); setReviewed(false); live.current?.speak(value); }} />}
        {mode === 'scenario' && <Scenario onTurn={value => loadExample({ name: 'Scripted conversation', text: value })} onStop={() => live.current?.stop()} canPlay={reviewed && !!text.trim() && liveState === 'Connected' && !busy} onPlay={() => { setOutput(''); setReviewed(false); live.current?.speak(text); }} />}
        <section className="capture-section" aria-labelledby="camera-title" hidden={mode !== 'capture'}>
          <div className="section-heading"><h2 id="camera-title"><span className="step">01</span> Capture</h2><span className="status"><i className={camera.state === 'on' ? 'active' : ''} />{camera.state === 'on' ? `${camera.hands} hands tracked` : camera.state === 'starting' ? 'Starting camera' : 'Camera off'}</span></div>
          <div className="viewfinder">
            <video ref={camera.video} muted playsInline aria-label="Live camera preview" />
            <canvas ref={camera.overlay} aria-label="Hand landmarks" />
            {camera.state !== 'on' && <div className="camera-placeholder">{camera.state === 'starting' ? <LoaderCircle className="spin" size={38} /> : <CameraOff size={38} />}<span>{camera.state === 'starting' ? 'Connecting camera' : 'Camera is off'}</span></div>}
            <span className="viewfinder-label">LOCAL PREVIEW</span>
            {camera.recording && <span className="recording"><Circle size={10} fill="currentColor" /> {camera.frames.length}/10 frames</span>}
          </div>
          <div className="toolbar">
            {camera.state === 'off' ? <button onClick={() => void camera.start()}><Camera size={18} />Start camera</button> : <button onClick={camera.stop}><CameraOff size={18} />Stop camera</button>}
            <button className="primary" onClick={camera.capture} disabled={camera.state !== 'on' || camera.recording || busy}><Circle size={16} />{camera.recording ? 'Recording' : 'Capture 5 seconds'}</button>
            <button className="icon-button" title="Discard capture" aria-label="Discard capture" onClick={camera.clear} disabled={!camera.frames.length && !busy}><Trash2 size={18} /></button>
          </div>
          {camera.error && <p className="error" role="alert">{camera.error}</p>}
          <div className="clip-heading"><h3>Captured sequence</h3><span>{camera.frames.length} / 10 frames</span></div>
          <div className="filmstrip" aria-label="Captured frames">{Array.from({ length: 10 }, (_, index) => <div className="frame" key={index}>{camera.frames[index] ? <img src={camera.frames[index].image} alt={`Captured frame ${index + 1}`} /> : <span>{String(index + 1).padStart(2, '0')}</span>}</div>)}</div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); cancel(); }} /><span>I consent to sending this image sequence, including any faces and background, to OpenAI for interpretation.</span></label>
          <div className="interpret-row"><button className="primary" onClick={() => void interpret()} disabled={!configured || !consent || camera.frames.length < 4 || camera.recording || busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <ScanLine size={18} />}{busy ? 'Interpreting' : 'Interpret sequence'}</button>{busy && <button onClick={cancel}>Cancel</button>}</div>
          {error && <p className="error" role="alert">{error}</p>}
          {note && <p className="interpretation-note" role="status">{note}</p>}
          <aside className="examples" aria-labelledby="examples-title"><h3 id="examples-title">Try an example</h3><span className="example-kind">VOICE ONLY / NO SIGNING NEEDED</span>
            <div className="example-list">{examples.map(example => <button key={example.name} onClick={() => loadExample(example)} title={`Load sample: ${example.name}`}><ArrowDownToLine size={16} /><span>{example.name}</span></button>)}</div>
            {sample && <p className="sample-note" role="status">Sample loaded: {sample}. This tests voice output, not ASL recognition.</p>}
            <h3>ASL practice references</h3><div className="practice-links"><a href="https://www.lifeprint.com/asl101/pages-signs/h/hello.htm" target="_blank" rel="noreferrer">Hello <ExternalLink size={13} /></a><a href="https://www.lifeprint.com/asl101/pages-signs/t/thankyou.htm" target="_blank" rel="noreferrer">Thank you <ExternalLink size={13} /></a></div><p className="sample-note">References: ASL University, Dr. Bill Vicars. External lessons, not validated recognition fixtures. Local hand tracking does not identify signs.</p>
          </aside>
        </section>
        <section className="message-section" aria-labelledby="message-title">
          <div className="section-heading"><h2 id="message-title"><span className="step">02</span> Your message</h2><button className="icon-button" title="Clear message and capture" aria-label="Clear message and capture" onClick={clearAll}><Trash2 size={18} /></button></div>
          <label className="field-label" htmlFor="message">English transcript</label>
          <textarea id="message" maxLength={400} value={text} readOnly={mode === 'direct'} placeholder="Your message" onChange={event => { cancel(); setText(event.target.value); setReviewed(false); setSample(''); }} />
          <div className="text-meta"><span>{mode === 'direct' ? 'Automatic speech only while live mode is on' : 'Tentative until reviewed'}</span><span>{text.length}/400</span></div>
          <label className="consent review" hidden={mode === 'direct'}><input type="checkbox" checked={reviewed} disabled={!text.trim() || busy} onChange={event => setReviewed(event.target.checked)} /><span>I reviewed this message and approve sending it to OpenAI for speech.</span></label>
          <div className="voice-heading"><h2><span className="step">03</span> Voice</h2><span className="model-name">GPT-Live-1</span></div>
          <div className="voice-config"><label htmlFor="voice">Voice<select id="voice" value={voice} onChange={event => setVoice(event.target.value)} disabled={liveState !== 'Disconnected'}><option value="marin">Marin</option><option value="cedar">Cedar</option><option value="quartz">Quartz</option><option value="gleam">Gleam</option></select></label><div className="session-status" role="status"><i className={liveState === 'Connected' ? 'active' : ''} />{liveState}<small>{seconds.toFixed(0)}s reported</small></div></div>
          <div className="toolbar voice-toolbar"><button hidden={mode === 'direct'} onClick={() => { setOutput(''); void live.current?.connect(voice); }} disabled={!configured || liveState !== 'Disconnected'}><Plug size={18} />Connect voice</button><button hidden={mode === 'direct'} className="primary" disabled={!reviewed || !text.trim() || liveState !== 'Connected' || busy} onClick={() => { setOutput(''); setReviewed(false); live.current?.speak(text); }}><Volume2 size={18} />Speak</button><button className="stop-button" onClick={() => live.current?.stop()} disabled={liveState === 'Disconnected' || liveState === 'Closing'} title="Stop speech and disconnect"><Square size={16} />Stop</button></div>
          <p className="cost">$0.05/min connected, plus vision usage. Two-minute session limit.</p>
          {voiceError && <p className="error" role="alert">{voiceError}</p>}
          <div className="spoken"><h3>Voice transcript</h3><p role="log" aria-live="polite">{output || 'No speech yet.'}</p></div>
          <audio ref={audio} aria-label="AI voice playback" />
          {!configured && <p className="error" role="status">OpenAI key not configured. Camera and text editing are available.</p>}
        </section>
      </div>
      <aside className="disclosure"><ShieldCheck size={21} /><div><strong>Experimental personal recognition and ASL interpretation. AI-generated voice.</strong><p>Not a validated translator or a replacement for qualified interpreters. Personal recognition is limited to your calibrated hand motions. GPT-Live may paraphrase text. No recordings are saved by this app; OpenAI data policies apply to submitted content.</p></div></aside>
    </main>
    <footer><span>SignFlow Live / Open research prototype</span><span>Built for exploration. Shaped by feedback.</span></footer>
  </>;
}
