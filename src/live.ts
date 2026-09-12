export type LiveState = 'Disconnected' | 'Connecting' | 'Connected' | 'Closing';
export type LiveUpdate = { state?: LiveState; error?: string; delta?: string; seconds?: number };

export class LiveVoice {
  private peer?: RTCPeerConnection;
  private events?: RTCDataChannel;
  private context?: AudioContext;
  private silence?: MediaStream;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private ready = false;
  private closing = false;
  private permitted = false;
  private version = 0;

  constructor(private audio: HTMLAudioElement, private update: (value: LiveUpdate) => void) {}

  private cleanup() {
    this.version += 1;
    this.ready = false;
    this.permitted = false;
    this.abort?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.audio.pause();
    this.audio.muted = true;
    this.audio.srcObject = null;
    this.silence?.getTracks().forEach(track => track.stop());
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.events?.close();
    this.peer?.close();
    this.events = undefined;
    this.peer = undefined;
    this.update({ state: 'Disconnected' });
  }

  async connect(voice: string) {
    if (this.peer) return;
    const version = ++this.version;
    this.closing = false;
    this.update({ state: 'Connecting', error: '', seconds: 0 });
    this.audio.muted = true;
    this.abort = new AbortController();
    this.timer = setTimeout(() => { this.cleanup(); this.update({ error: 'Live connection timed out.' }); }, 40_000);
    try {
      this.context = new AudioContext();
      await this.context.resume();
      if (version !== this.version) return;
      const destination = this.context.createMediaStreamDestination();
      const silence = this.context.createConstantSource();
      silence.offset.value = 0;
      silence.connect(destination);
      silence.start();
      this.silence = destination.stream;
      const peer = new RTCPeerConnection();
      this.peer = peer;
      for (const track of this.silence.getTracks()) peer.addTrack(track, this.silence);
      peer.ontrack = event => {
        if (version !== this.version || this.closing) return;
        this.audio.srcObject = new MediaStream([event.track]);
        this.audio.muted = !this.permitted;
        if (this.permitted) void this.audio.play().catch(() => { if (version !== this.version) return; this.stop(); this.update({ error: 'Audio playback blocked. Reconnect voice, review the message, and try Speak again.' }); });
      };
      const events = peer.createDataChannel('oai-events');
      this.events = events;
      events.onmessage = message => {
        if (version !== this.version) return;
        let event;
        try { event = JSON.parse(message.data); } catch { return; }
        if (event.type === 'session.started' && !this.closing) {
          clearTimeout(this.timer);
          this.ready = true;
          this.update({ state: 'Connected' });
          this.deadline = setTimeout(() => this.stop(), 120_000);
        } else if (event.type === 'session.output_transcript.delta' && this.permitted && typeof event.delta === 'string') {
          this.update({ delta: event.delta });
        } else if (event.type === 'session.usage.updated' || event.type === 'session.closed') {
          if (typeof event.usage?.seconds === 'number') this.update({ seconds: event.usage.seconds });
          if (event.type === 'session.closed') this.cleanup();
        } else if (event.type === 'error') {
          this.update({ error: 'Live rejected a command. Speech stopped; check model access and session configuration.' });
          this.stop();
        }
      };
      events.onclose = () => {
        if (version !== this.version) return;
        this.cleanup();
        this.update({ error: 'Connection lost; final usage is unconfirmed.' });
      };
      peer.onconnectionstatechange = () => {
        if (version === this.version && peer.connectionState === 'failed') {
          this.cleanup(); this.update({ error: 'Voice connection failed; final usage is unconfirmed.' });
        }
      };
      await peer.setLocalDescription(await peer.createOffer());
      if (peer.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { peer.removeEventListener('icegatheringstatechange', changed); reject(new Error('Network negotiation timed out.')); }, 10_000);
        function changed() {
          if (peer.iceGatheringState !== 'complete') return;
          clearTimeout(timeout); peer.removeEventListener('icegatheringstatechange', changed); resolve();
        }
        peer.addEventListener('icegatheringstatechange', changed);
        changed();
      });
      if (version !== this.version) return;
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: peer.localDescription?.sdp, voice }), signal: this.abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Live session unavailable.');
      if (version !== this.version) return;
      await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
    } catch (error) {
      if (version !== this.version) return;
      this.cleanup();
      this.update({ error: error instanceof Error ? error.message : 'Voice connection failed.' });
    }
  }

  speak(text: string) {
    if (!this.ready || this.closing || this.events?.readyState !== 'open' || !text.trim() || text.length > 400) return;
    this.permitted = true;
    this.audio.muted = false;
    const version = this.version;
    void this.audio.play().catch(() => { if (version !== this.version) return; this.stop(); this.update({ error: 'Audio playback blocked. Reconnect voice, review the message, and try Speak again.' }); });
    this.events.send(JSON.stringify({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: null, content: text.trim() }));
  }

  stop() {
    this.audio.muted = true;
    this.audio.pause();
    this.permitted = false;
    if (this.closing) return;
    this.closing = true;
    this.ready = false;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    if (this.events?.readyState === 'open') {
      this.update({ state: 'Closing' });
      this.events.send(JSON.stringify({ type: 'session.close' }));
      this.timer = setTimeout(() => { this.cleanup(); this.update({ error: 'Stopped locally; final session usage is unconfirmed.' }); }, 5000);
    } else this.cleanup();
  }

  dispose() { this.stop(); this.cleanup(); }
}
