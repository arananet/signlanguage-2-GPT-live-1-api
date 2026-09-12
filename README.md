# signlanguage-2-GPT-live-1-api

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black) ![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white) ![OpenSpec](https://img.shields.io/badge/OpenSpec-enforced-blueviolet) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> An open-source communication prototype with personally calibrated hand-motion recognition and GPT-Live-1 voice output.

Status: experimental local application. Live recognition matches your own
calibrated hand motions to phrases; it does not translate general ASL. No signs,
including Hello, come pretrained. The manual image-review workflow and scripted
conversation references are separate modes. Recognition accuracy with real
signers is not validated. This is not a substitute for a qualified interpreter.

---

## Quick start

```bash
# Clone and install the repository's development hooks
git clone https://github.com/arananet/signlanguage-2-GPT-live-1-api.git
cd signlanguage-2-GPT-live-1-api
bash setup.sh

# Validate specifications
scripts/openspec check

# Node.js 22.19+ with system certificate trust
npm install
npm run assets
# Set OPENAI_API_KEY in the ignored root .env, then:
npm run dev
```

Open http://localhost:3100. The stack is React, TypeScript, and Node.js.
Run `npm test`, `npm run test:e2e`, and `npm run build` for validation.
Browser tests require `NODE_OPTIONS=--use-system-ca npx playwright install chromium`.
Keep the OpenAI API key in the ignored root `.env`; never expose it in browser
code or commit it. The launcher uses system certificate trust; never disable TLS
verification. Camera use requires localhost or HTTPS.

---

## Usage

### Personal live recognition

**The app can learn your gestures from examples and associate them with spoken
phrases.** This is personal template learning from three examples, not training
a general sign-language model. Partial and complete examples are saved locally
in this browser and restored after refresh, mode changes, and code updates that
retain the same feature format. Camera, automatic speech consent, and live
recognition remain off after reload; restoring examples never starts voice.

**Calibration phrase** offers **Hello**, **Thank you**, **Nice to meet you**, and
**Custom phrase**.
These are labels, not pretrained signs. To add Thank you after Hello, choose it
and record three examples of the full motion, from the initial hand position
near the chin through the outward movement, as one sequence per example.
Selecting another phrase keeps previously recorded examples in the current mode.
Once phrases are ready, live recognition compares against all of them; the selector does
not restrict recognition to the currently selected label.

For **Nice to meet you**, record **nice** followed by **meet you** (bringing both
hands together) as a single complete example, three times. Keep both hands in
frame between the steps, with any still pause shorter than 700 ms, and finish
within four seconds. The learned sequence maps to the full spoken phrase
`Nice to meet you`, not two separate outputs. It is a personal motion template,
not a built-in ASL definition; a longer pause or lost hand tracking can split it.

1. Select **Live recognition** and **Start camera**. Hello is initially only a
	phrase label, not a learned sign. `0 READY` means nothing can be recognized.
2. For each of three examples, press **Record example** and perform the entire
	gesture, including both movements where applicable. Keep hands visible during
	the movement. A moving sequence completes after 700 ms of stillness, when
	hands leave the frame for 350 ms, or at the four-second/60-sample bound.
3. Confirm the phrase shows **3/3 Ready**. Accept automatic speech consent and
	press **Start live**. Wait for **Connected** before signing.
4. Repeat the calibrated gesture. A match appears in the message panel and is
	sent automatically to GPT-Live. Unrecognized gestures send nothing. Remove
	hands from the frame between live gestures to rearm; holding a pose does not
	repeatedly speak. **Stop live** immediately mutes and disconnects voice.

The state line and sample meter distinguish missing calibration, waiting for
hands, tracking, connection startup, and waiting for hand release. Longer pauses
can split multi-part gestures; recognition thresholds are experimental. Use the
same camera framing and hand as calibration. Up to eight personal phrases are
stored as labels and numeric hand-motion templates in versioned `localStorage`,
not images or audio. Deleting a phrase removes its saved copy. Clearing site
data also removes examples; private browsing, another browser profile, or a
different URL/port does not share this storage. There is no cloud backup.
Avoid saving personal templates on a shared browser profile. If storage is
blocked, full, corrupt, or incompatible, the app shows an error; failed changes
(including deletions) may not survive a reload. Previously lost in-memory
examples cannot be recovered. No face/body grammar or cross-user recognition is
provided. The scripted Hello reference is educational media, not a trained model.

MediaPipe hand landmarks run locally at no more than 15 inference frames/second.
The `dynamic-time-warping` library (MIT) compares normalized temporal templates.
Live recognition never encodes or uploads camera images and never requests a
microphone. Only matched text goes to OpenAI for voice. The separate **Live
capture** mode uploads an image sequence only after explicit image consent.
GPT-Live-1 does not interpret video. The voice instructions require literal
reading, not a conversational reply: `Thank you` should produce only `Thank you`,
without appreciation, backchannels, or follow-up sentences. This is a prompt
constraint, not guaranteed verbatim playback: the Live commentary API is trained
to paraphrase. Check the voice transcript and use Stop for unwanted additions.
Server-side instruction changes require restarting the local server and opening
a new voice session; already connected sessions keep their previous instructions.

Voice costs $0.05/minute connected, with a two-minute local session limit;
manual vision use is billed separately. Provider data policies still apply.
Automated tests use synthetic movements and mocked voice transport; they verify
control flow, not ASL accuracy. Real-signer accuracy, false matches, two-movement
timing, and spoken fidelity need manual evaluation before relying on this app.

---

## Contributing

This project uses **OpenSpec** for spec-driven development — every feature
or bugfix starts with a spec file under `.openspec/specs/`. Each spec
includes a `roles` block to assign responsibility (`implementer`,
`reviewer`, `qa`, `product_owner`). See
[`docs/OPENSPEC.md`](docs/OPENSPEC.md) for the full workflow, or
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the contributor checklist.

---

## Documentation

| Topic | Where |
|---|---|
| Spec-driven workflow | [`docs/OPENSPEC.md`](docs/OPENSPEC.md) |
| Branch protection setup | [`docs/BRANCH_PROTECTION.md`](docs/BRANCH_PROTECTION.md) |
| Architecture decisions | [`docs/adr/`](docs/adr/) |
| Security policy | [`SECURITY.md`](SECURITY.md) |
| Support channels | [`SUPPORT.md`](SUPPORT.md) |
| Release history | [`CHANGELOG.md`](CHANGELOG.md) |

---

## License

[MIT](LICENSE)

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H51MPWG)
