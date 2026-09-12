import { useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Hand, Play, Square } from 'lucide-react';

export const turns = [
  { speaker: 'Alex', cue: 'HELLO', text: 'Hello!', source: 'https://www.lifeprint.com/asl101/pages-signs/h/hello.htm', media: 'https://www.lifeprint.com/asl101/videos/hi.mp4', video: true },
  { speaker: 'Sam', cue: 'NAME', text: 'What is your name?', source: 'https://www.lifeprint.com/asl101/pages-signs/n/name.htm', media: 'https://www.lifeprint.com/asl101/gifs/n/name.gif', video: false },
  { speaker: 'Alex', cue: 'NAME', text: 'My name is Alex.', source: 'https://www.lifeprint.com/asl101/pages-signs/n/name.htm', media: 'https://www.lifeprint.com/asl101/gifs/n/name.gif', video: false },
  { speaker: 'Sam', cue: 'THANK YOU', text: 'Thank you, Alex!', source: 'https://www.lifeprint.com/asl101/pages-signs/t/thankyou.htm', media: 'https://www.lifeprint.com/asl101/gifs/t/thank-you.gif', video: false },
];

export function Scenario({ onTurn, onStop, onPlay, canPlay }: { onTurn: (text: string) => void; onStop: () => void; onPlay: () => void; canPlay: boolean }) {
  const [index, setIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = turns[index];
  function select(next: number) {
    setIndex(next); setPlaying(false); setFailed(false); onTurn(turns[next].text);
  }
  return <section className="scenario-section" aria-labelledby="scenario-title">
    <div className="section-heading"><h2 id="scenario-title">A first meeting</h2><span className="scripted">SCRIPTED DEMO</span></div>
    <div className="scenario-viewer">
      {consent && playing && !failed ? current.video ? <video key={current.media} src={current.media} muted playsInline autoPlay loop controls onError={() => setFailed(true)} aria-label={`ASL reference: ${current.cue}`} /> : <img key={current.media} src={current.media} referrerPolicy="no-referrer" alt={`ASL University demonstration of ${current.cue}`} onError={() => setFailed(true)} /> : <div className="reference-placeholder"><Hand size={48} /><strong>{current.cue}</strong><span>{failed ? 'Reference unavailable. Open the source below.' : 'Sign reference paused'}</span></div>}
      <span className="reference-badge">ASL UNIVERSITY / REFERENCE</span>
    </div>
    <label className="consent"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setPlaying(false); onStop(); }} /><span>Load external sign references from Lifeprint.com. This shares my IP address with that website.</span></label>
    <div className="toolbar"><button className="primary" disabled={!consent || !canPlay} onClick={() => { setFailed(false); setPlaying(true); onPlay(); }}><Play size={17} />Play turn</button><button disabled={!consent} onClick={() => { setFailed(false); setPlaying(previous => !previous); if (playing) onStop(); }}>{playing ? <Square size={17} /> : <Play size={17} />}{playing ? 'Pause reference' : 'Play reference'}</button><a className="reference-source" href={current.source} target="_blank" rel="noreferrer">Full lesson <ExternalLink size={14} /></a></div>
    <p className="sample-note">Dr. Bill Vicars / ASL University. The reference shows the selected sign, not the full scripted sentence. Facial expression and context matter. Reference motion and AI speech are not word-synchronized.</p>
    <ol className="conversation">{turns.map((turn, turnIndex) => <li key={`${turn.speaker}-${turn.cue}`}><button aria-current={turnIndex === index ? 'step' : undefined} onClick={() => select(turnIndex)}><span className="speaker-avatar">{turn.speaker.slice(0, 1)}</span><span className="turn-content"><strong>{turn.speaker} <small>{turn.cue}</small></strong><span>{turn.text}</span></span><span className="turn-number">{String(turnIndex + 1).padStart(2, '0')}</span></button></li>)}</ol>
    <div className="scenario-navigation"><button className="icon-button" title="Previous turn" aria-label="Previous turn" disabled={index === 0} onClick={() => select(index - 1)}><ArrowLeft size={18} /></button><span>Turn {index + 1} of {turns.length}</span><button className="icon-button" title="Next turn" aria-label="Next turn" disabled={index === turns.length - 1} onClick={() => select(index + 1)}><ArrowRight size={18} /></button></div>
    <p className="sample-note">Scripted English tests the voice path, not recognition. The NAME reference does not demonstrate fingerspelling Alex. This is not a representation of every Deaf person's communication.</p>
  </section>;
}
