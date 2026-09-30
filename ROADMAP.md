# SquidgySqueegee: roadmap

A living list. Ideas are welcome: use the *Suggest something* link in the how-to card (press `?`) when it is there.

## Shipped in 2.0

- Record the final output: **WAV** (24-bit lossless, streamed to disk), **MP3 320**, **video + audio**, PNG stills.
- **Performance recordings** (`.sqz`): a few KB for a set, replayed in the standalone **player**, with pause and seeking.
- More ways to export loops as JSON: everything, bass only, drums only, sound only, plus clipboard copy and paste.
- Live-set robustness: a limiter plus a soft-clip guard (the output never clips), audio-paused notice and one-touch resume, screen kept awake, guard against closing the tab mid-set,
  automatic picture-quality fallback (and cautious recovery), and a frame loop that survives a bad frame.
- `H` is a note now; the backtick hides the panel; a `?` how-to card is on the page.
- Clearer button names: **save loop** and **↺ saved loop**.
- OBS-friendly options: `?clean=1`, `?autostart=1`, `?quality=`, `?debug=1`.

## Next

### MIDI controllers
Web MIDI works in Chrome and Edge on the hosted page or localhost (not from a file), and asks the visitor for permission first.

- **MIDI learn:** click a control, move a knob or press a pad, and it is mapped. Mappings saved in the browser and exportable as JSON.
- **Pad grids** (Novation Launchpad and similar class-compliant controllers): pads as the bass step grid and the drum rings, with lit pads for feedback.
- **Knob/fader controllers** (Native Instruments Kontrol X1 in its MIDI mode, and others): Aperture, Contrast, Burn, Drift, tempo, light.
- **Play the synth** from a MIDI keyboard; optionally MIDI clock in and out.
- **Controllers that do not speak MIDI** (some Traktor units talk over HID rather than MIDI): possible later through WebHID, but it needs per-device work.

### A guided tutorial
An optional walk-through that highlights one control at a time and asks you to try it, so the how-to card stays short.

### Live sharing
- **Today:** clean mode and OBS (window capture, or `?clean=1`) for streaming.
- **Broadcast from the page:** the picture and the final audio already exist as browser streams (they are what video recording uses),
  so a direct broadcast (for example WebRTC) is a natural next step.
- **Event streaming:** because a performance is just events, a live set could be sent as events and rendered on each viewer's own screen:
  almost no bandwidth, perfect quality, no video compression.

### Recording extras
Per-bar loop capture into samples; 32-bit float WAV; steadier video timestamps for editing; render a performance to video faster than real time.

## Ideas

- **Share a loop by link** (encoded in the address).
- Loop slots A/B/C with morphing; a simple song arranger.
- **A bouncier "Squidgy" mode:** electroswing kit (upright-style bass pluck, brass stab, clap on the swing).
- Drift for snare and kick (optional, off by default: they carry the groove).
- Per-drummer mute/solo, tap tempo, ducking; a second synth voice; more drum voices.
- Visual presets (other folds), visual intensity, reduced-motion polish.
- Mobile/touch layout; installable and offline.
- Keyboard navigation of the grid and rings.

## Principles

- Less is more: a minimal interface, nothing that needs explaining twice.
- Nothing leaves your computer unless you export or send it yourself; no accounts, no tracking.
- DreDarkroom, Safelight and SquidgySqueegee are DJ aliases, stated plainly, with no added branding.
