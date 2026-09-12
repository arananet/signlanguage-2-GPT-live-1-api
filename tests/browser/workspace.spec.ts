import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.route('**/api/config', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/session', route => route.fulfill({ json: { transport: { sdp: 'answer' } } }));
  await page.route('**/api/interpret', route => route.fulfill({ json: { transcript: 'Thank you.', uncertain: false, note: 'Tentative test result.' } }));
  await page.addInitScript(() => {
    const state = { sent: [] as any[], constraints: [] as any[], tracks: [] as MediaStreamTrack[] };
    (window as any).testState = state;
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      state.constraints.push(constraints);
      const stream = await getMedia(constraints);
      state.tracks.push(...stream.getTracks());
      return stream;
    };
    class Channel {
      readyState = 'open';
      onmessage: any;
      onclose: any;
      send(raw: string) {
        const event = JSON.parse(raw);
        state.sent.push(event);
        if (event.type === 'session.commentary.append') this.onmessage?.({ data: JSON.stringify({ type: 'session.output_transcript.delta', delta: event.content }) });
        if (event.type === 'session.close') this.onmessage?.({ data: JSON.stringify({ type: 'session.closed', usage: { seconds: 2 } }) });
      }
      close() { this.readyState = 'closed'; }
    }
    class Peer extends EventTarget {
      iceGatheringState = 'complete';
      localDescription: any;
      channel = new Channel();
      addTrack() {}
      createDataChannel() { return this.channel; }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\nfake-offer' }; }
      async setLocalDescription(value: any) { this.localDescription = value; }
      async setRemoteDescription() { this.channel.onmessage?.({ data: JSON.stringify({ type: 'session.started' }) }); }
      close() {}
    }
    (window as any).RTCPeerConnection = Peer;
    HTMLMediaElement.prototype.play = new Proxy(HTMLMediaElement.prototype.play, { apply(target, receiver, args) { return receiver instanceof HTMLAudioElement ? Promise.resolve() : Reflect.apply(target, receiver, args); } });
  });
}

test.beforeEach(async ({ page }) => { await setup(page); await page.goto('/'); await page.getByRole('tab', { name: 'Live capture', exact: true }).click(); });

test('samples remain local, require review, and stop voice', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.getByRole('button', { name: 'Introduction', exact: true }).click();
  await expect(page.getByLabel('English transcript')).toHaveValue('Hello, my name is Alex. It is nice to meet you.');
  expect(posts).toEqual([]);
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeDisabled();
  const review = page.getByRole('checkbox', { name: /I reviewed/ });
  await review.check();
  await page.getByRole('button', { name: 'Everyday request', exact: true }).click();
  await expect(review).not.toBeChecked();
  await review.check();
  await page.getByRole('button', { name: 'Connect voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('log')).toHaveText('Could I have a glass of water, please?');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect voice', exact: true })).toBeEnabled();
  expect(await page.locator('audio').evaluate(audio => audio.muted)).toBe(true);
  expect(await page.evaluate(() => (window as any).testState.constraints)).toEqual([]);
});

test('conversation navigation gates external references and approved audio', async ({ page }) => {
  let external = 0;
  await page.route('https://www.lifeprint.com/**', route => { external += 1; return route.abort(); });
  await page.getByRole('tab', { name: 'Conversation demo' }).click();
  await expect(page.getByLabel('English transcript')).toHaveValue('Hello!');
  await expect(page.getByRole('button', { name: 'Play reference' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Play turn', exact: true })).toBeDisabled();
  expect(external).toBe(0);
  await page.getByRole('checkbox', { name: /Load external/ }).check();
  expect(external).toBe(0);
  await page.getByRole('button', { name: 'Play reference' }).click();
  await expect.poll(() => external).toBeGreaterThan(0);
  await expect(page.getByText('Reference unavailable. Open the source below.')).toBeVisible();
  await page.getByRole('checkbox', { name: /I reviewed/ }).check();
  await page.getByRole('button', { name: 'Connect voice', exact: true }).click();
  await page.getByRole('button', { name: 'Play turn', exact: true }).click();
  await expect(page.getByRole('log')).toHaveText('Hello!');
  await page.getByRole('button', { name: 'Next turn', exact: true }).click();
  await expect(page.getByLabel('English transcript')).toHaveValue('What is your name?');
  await expect(page.getByRole('checkbox', { name: /I reviewed/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Connect voice', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).testState.sent.map((event: any) => event.type))).toEqual(['session.commentary.append', 'session.close']);
});

test('camera captures locally, interprets on consent, and releases tracks', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByText('0 hands tracked')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Capture 5 seconds' }).click();
  await expect(page.getByRole('img', { name: /Captured frame/ })).toHaveCount(10, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Interpret sequence' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /I consent to sending/ }).check();
  await page.getByRole('button', { name: 'Interpret sequence' }).click();
  await expect(page.getByLabel('English transcript')).toHaveValue('Thank you.');
  await expect(page.getByRole('checkbox', { name: /I reviewed/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await expect(page.getByRole('img', { name: /Captured frame/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).testState.tracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => (window as any).testState.constraints[0].audio)).toBe(false);
});

test('permission denial leaves typed examples usable', async ({ page }) => {
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Camera or tracking unavailable');
  await page.getByRole('button', { name: 'Introduction', exact: true }).click();
  await expect(page.getByLabel('English transcript')).not.toBeEmpty();
});

test('blocked audio disconnects and offers a usable recovery action', async ({ page }) => {
  await page.evaluate(() => { HTMLAudioElement.prototype.play = async () => { throw new DOMException('Blocked', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'Introduction', exact: true }).click();
  await page.getByRole('checkbox', { name: /I reviewed/ }).check();
  await page.getByRole('button', { name: 'Connect voice', exact: true }).click();
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Reconnect voice');
  await expect(page.getByRole('button', { name: 'Connect voice', exact: true })).toBeEnabled();
  expect(await page.locator('audio').evaluate(audio => audio.muted)).toBe(true);
});

test('loading an example cancels a delayed interpretation', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/api/interpret', async route => {
    requested = true;
    await pending;
    await route.fulfill({ json: { transcript: 'Stale result', uncertain: false } }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByText('0 hands tracked')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Capture 5 seconds' }).click();
  await expect(page.getByRole('img', { name: /Captured frame/ })).toHaveCount(10, { timeout: 10_000 });
  await page.getByRole('checkbox', { name: /I consent to sending/ }).check();
  await page.getByRole('button', { name: 'Interpret sequence' }).click();
  await expect.poll(() => requested).toBe(true);
  const aborted = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/interpret'));
  await page.getByRole('button', { name: 'Introduction', exact: true }).click();
  await aborted;
  release();
  await expect(page.getByLabel('English transcript')).toHaveValue('Hello, my name is Alex. It is nice to meet you.');
  await expect(page.getByRole('checkbox', { name: /I reviewed/ })).not.toBeChecked();
});

test('desktop and mobile layouts are bounded and render without script errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const mode of ['Live recognition', 'Live capture', 'Conversation demo']) {
    await page.getByRole('tab', { name: mode }).click();
    await expect(page.getByRole('heading', { name: 'Your words. Your say.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overflow = await page.locator('button:visible, textarea:visible, select:visible').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 2).length);
    expect(overflow).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`${mode}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('personal recognition calibrates locally and speaks automatically only while armed', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['camera']);
  await page.route('**/*mediapipe*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const FilesetResolver = { forVisionTasks: async () => ({}) };
    export class DrawingUtils { drawConnectors() {} drawLandmarks() {} }
    export const HandLandmarker = { HAND_CONNECTIONS: [], createFromOptions: async () => ({ close() {}, detectForVideo() {
      window.testFrames = (window.testFrames || 0) + 1;
      const frame = window.testFrames;
      const movement = frame <= 10 ? (frame-1)*0.015 : frame <= 15 ? 0.135 : frame <= 25 ? 0.135+(frame-16)*0.015 : 0.27;
      const direction = window.testPhrase === 'Thank you' ? -1 : 1;
      if (window.testPose && window.testPhrase === 'Nice to meet you') {
        const sweep = Math.min(frame-1, 9)*0.015;
        const approach = Math.max(0, Math.min(frame-16, 9))*0.02;
        return {
          landmarks: [
            Array.from({length:21}, (_,index) => ({x:0.2+sweep+approach+index*0.01,y:0.4+index*0.02,z:0})),
            Array.from({length:21}, (_,index) => ({x:0.8-approach-index*0.01,y:0.55+index*0.02,z:0}))
          ],
          handedness: [[{categoryName:'Right'}], [{categoryName:'Left'}]]
        };
      }
      return window.testPose ? { landmarks: [Array.from({length:21}, (_,index) => ({x:0.2+movement+index*0.01,y:0.5+direction*index*0.02,z:0}))], handedness: [[{categoryName:'Right'}]] } : {landmarks:[],handedness:[]};
    } }) };
  ` }));
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.getByRole('tab', { name: 'Live recognition', exact: true }).click();
  await expect(page.getByText('No trained phrases. "Hello" is only a phrase label.')).toBeVisible();
  await expect(page.getByText('Learns your gestures from three examples per phrase. Personal templates saved in this browser; no images or audio stored. Not general sign-language recognition.')).toBeVisible();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record example 1/3' })).toBeEnabled();
  async function gesture(phrase = 'Hello') {
    const sentBefore = await page.evaluate(() => (window as any).testState.sent.filter((event: any) => event.type === 'session.commentary.append').length);
    await page.evaluate(value => { (window as any).testPhrase = value; (window as any).testPose = true; (window as any).testFrames = 0; }, phrase);
    if (phrase === 'Nice to meet you') {
      await expect.poll(() => page.evaluate(() => (window as any).testFrames), { intervals: [50] }).toBeGreaterThanOrEqual(15);
      await expect(page.locator('.direct-state')).toContainText('Tracking gesture');
      expect(await page.evaluate(() => (window as any).testState.sent.filter((event: any) => event.type === 'session.commentary.append').length)).toBe(sentBefore);
    }
    await expect.poll(() => page.evaluate(() => (window as any).testFrames), { intervals: [100], timeout: 8000 }).toBeGreaterThanOrEqual(37);
  }
  async function releaseHands() {
    await page.evaluate(() => { (window as any).testPose = false; (window as any).testFrames = 0; });
    await expect.poll(() => page.evaluate(() => (window as any).testFrames), { intervals: [100] }).toBeGreaterThanOrEqual(8);
  }
  for (const phrase of ['Hello', 'Thank you', 'Nice to meet you']) {
    await page.getByLabel('Calibration phrase', { exact: true }).selectOption(phrase);
    await expect(page.getByLabel('Phrase to speak', { exact: true })).toHaveValue(phrase);
    await expect(page.getByText(`"${phrase}" / 0/3 examples / Not trained yet`, { exact: true })).toBeVisible();
    for (let example = 1; example <= 3; example += 1) {
      await page.getByRole('button', { name: `Record example ${example}/3` }).click();
      await expect(page.getByText(`Calibrating "${phrase}" / Waiting for hands`)).toBeVisible();
      await gesture(phrase);
      await expect(page.locator('.personal-vocabulary li').filter({ hasText: phrase })).toContainText(`${example}/3`);
      expect(await page.evaluate(() => (window as any).testPose)).toBe(true);
      await releaseHands();
      if (phrase === 'Hello' && example === 1) {
        await page.reload();
        await expect(page.locator('.personal-vocabulary li')).toContainText('1/3 Calibrating');
        await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeVisible();
        expect(await page.evaluate(() => (window as any).testState.constraints)).toEqual([]);
        await page.getByRole('button', { name: 'Start camera', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Record example 2/3' })).toBeEnabled();
      }
    }
  }
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(3);
  await page.getByRole('checkbox', { name: /I authorize automatic speech/ }).check();
  await page.reload();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(3);
  await expect(page.getByRole('checkbox', { name: /I authorize automatic speech/ })).not.toBeChecked();
  await expect(page.locator('.session-status')).toContainText('Disconnected');
  expect(await page.evaluate(() => (window as any).testState.constraints)).toEqual([]);
  expect(posts).toEqual([]);
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop camera', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Start live', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /I authorize automatic speech/ }).check();
  await page.getByRole('button', { name: 'Start live', exact: true }).click();
  await expect(page.locator('.session-status')).toContainText('Connected');
  await gesture();
  await expect(page.getByRole('log')).toHaveText('Hello');
  await expect(page.locator('.direct-state')).toHaveText('Waiting for hand release');
  expect(posts.filter(url => url.endsWith('/api/interpret'))).toEqual([]);
  expect(await page.evaluate(() => (window as any).testState.sent.filter((event: any) => event.type === 'session.commentary.append').length)).toBe(1);
  await releaseHands();
  await gesture('Thank you');
  await expect(page.getByRole('log')).toHaveText('Thank you');
  await expect(page.getByLabel('English transcript')).toHaveValue('Thank you');
  expect(await page.evaluate(() => (window as any).testState.sent.filter((event: any) => event.type === 'session.commentary.append').map((event: any) => event.content))).toEqual(['Hello', 'Thank you']);
  await releaseHands();
  await gesture('Nice to meet you');
  await expect(page.getByRole('log')).toHaveText('Nice to meet you');
  await expect(page.getByLabel('English transcript')).toHaveValue('Nice to meet you');
  await expect(page.locator('.direct-state')).toHaveText('Waiting for hand release');
  expect(await page.evaluate(() => (window as any).testState.sent.filter((event: any) => event.type === 'session.commentary.append').map((event: any) => event.content))).toEqual(['Hello', 'Thank you', 'Nice to meet you']);
  expect(posts.filter(url => url.endsWith('/api/interpret'))).toEqual([]);
  await page.getByRole('button', { name: 'Stop live', exact: true }).click();
  await releaseHands();
  await gesture();
  expect(await page.evaluate(() => (window as any).testState.sent.filter((event: any) => event.type === 'session.commentary.append').length)).toBe(3);
  await page.getByRole('button', { name: 'Delete phrase Hello', exact: true }).click();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(2);
  await expect(page.locator('.personal-vocabulary')).toContainText('Thank you');
  await page.getByRole('tab', { name: 'Conversation demo', exact: true }).click();
  expect(await page.evaluate(() => (window as any).testState.tracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('tab', { name: 'Live recognition', exact: true }).click();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: /I authorize automatic speech/ })).not.toBeChecked();
  await page.reload();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Delete phrase Hello', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete phrase Thank you', exact: true }).click();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(1);
  await expect(page.locator('.personal-vocabulary')).toContainText('Nice to meet you');
  await page.getByRole('button', { name: 'Delete phrase Nice to meet you', exact: true }).click();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('signflow.personal-vocabulary'))).toBeNull();
  await page.getByRole('tab', { name: 'Conversation demo', exact: true }).click();
  expect(await page.evaluate(() => (window as any).testState.tracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
});

test('vocabulary storage errors are visible and do not silently discard saved data', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('signflow.personal-vocabulary', '{invalid'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Saved vocabulary could not be loaded');
  expect(await page.evaluate(() => localStorage.getItem('signflow.personal-vocabulary'))).toBe('{invalid');
  await page.evaluate(() => {
    const examples = Array.from({ length: 3 }, () => Array.from({ length: 20 }, () => Array(134).fill(0.25)));
    localStorage.setItem('signflow.personal-vocabulary', JSON.stringify({ version: 1, features: 'hand-slots-134-v1', phrases: [{ text: 'Hello', examples }, { text: 'Thank you', examples }] }));
  });
  await page.reload();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(2);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Delete phrase Hello', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Vocabulary changes could not be saved');
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.personal-vocabulary li')).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).testState.constraints)).toEqual([]);
  expect(await page.evaluate(() => (window as any).testState.sent)).toEqual([]);
});
