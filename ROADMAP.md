# DevelopDrop: roadmap

A living list. Ideas are welcome: use the *Suggest something* link in the how-to card (press `?`) when it is there.

## Shipped in 3.3

- **Lighter on the CPU.** The metal hat is one pre-built buffer instead of six oscillators a hit; the squeak's noise source runs only while you drag; the reverb room's tail stops at 2.2 s (it is already 35 dB down there); the output soft clip oversamples 2x instead of 4x. Offline render time for the same notes: about 8% less for *Safelight* and 24% less for *Dodge & Burn* on the author's laptop (a quieter session measured 15% and 29%).
- **Lighter on the picture.** The kaleidoscope copies only the wedge of the scene it ever shows (1.6 M pixels a frame instead of 8.4 M), the scene is coloured once in that wedge instead of multiplying the whole screen, the fog fades one frame in three, rings are one fill, and the wedge outline is built once: 8.0 full-screen passes a frame become 6.3, and 2D calls drop by 11% to 85% depending on the scene.
- **Keyboard users keep their place.** Controls only give up focus after a mouse click, not after Enter.
- **Smaller fixes.** The event queue is drained in one pass instead of shifting an array per event; the clock's and the MP3 encoder's worker scripts are released; wiping with a zero-size window (a hidden tab) no longer throws; the picture has an accessible role; broken characters in `config.js` and the README are repaired.

## Shipped in 3.2

- **Right-click menus** on the bass grid and the drummers: mute, solo, clear a step or all, fill with a new line, shift or turn a pattern, key up and down, record a clip, reset level.
- **A fine mouse wheel for levels:** each part (kick, snare, hats, bass) has its own level in decibels, 0.25 dB a notch (Shift 1 dB, Alt 0.05 dB), kept in loops and recordings. The wheel over any slider nudges it finely too.
- **Phone sound and heat:** a larger audio buffer, more look-ahead, cheaper processing and a shorter room on phones; the picture waits out the audio delay; an **eco** battery saver (30 frames a second, a fifth of the pixels, no reverb room, plainer hats).
- **A battery indicator** that blinks on the beat when low and on every eighth when very low, and turns eco on by itself.
- **Fullscreen on desktop** and a quiet clock of the time since the music started.

## Shipped in 3.1

- **Stylus support:** pressure sets the squeegee blade for fine, precise strokes; the barrel button builds; the eraser end and a resting palm are ignored; high-rate pen points are all used.
- **One set of gestures for touch:** one finger squeegees, two fingers held build and release drops, three build the other way, double-tap hides the panel.
- **A phone layout:** the first tap that starts the sound also goes fullscreen; the controls are a bottom sheet (a side column in landscape) with large touch targets, safe-area spacing and no accidental page zoom.

## Shipped in 3.0

- **Build and drop.** Hold `space` (or the right mouse button, or the *build ▸ drop* button): the kick drops out, a snare roll accelerates, a filter climbs and a riser swells.
  Let go and the drop lands on the beat (or the bar, or the next sixteenth: *Quantise* decides). `Shift` + `space` builds the other way, with the mix sinking under water.
  The drop itself has a breath of silence, a hit and a deep bass note. You can build as slowly and quietly as you like.
- **Styles:** complete starting points (tempo, drum kit, patterns, sound, light, picture), written in the spirit of Max Cooper, Soulwax and Orbital (original patterns, not copies), plus a drum and bass style, a *Slow Build* that starts with only a kick and hats, and a blank page.
- **Layers:** mute the kick, snare, hats or bass (`z` `x` `v` `b`, or right-click a ring), clear the bass (`n`) or drums (`Shift` + `n`). The bass ducks under the kick and sits lower in the mix; a better drum kit per style.
- **Tempo:** a slider in tenths, an exact number, and a drum-and-bass range up to 180 behind one switch (`\`); `[` `]` nudge.
- **Journey:** the tempo creeps up over as many bars as you choose while the picture changes and thickens.
- **Clips:** record 1 to 8 bars of drums or bass, loop them, save them as small files, drag them back in. Everything lands on the bar.
- **Pictures that progress:** four scenes (tentacles, dot grid, film frames, spokes) that crossfade and grow denser as a journey advances; builds and drops change the picture too.
- **Drop anything on the page:** a performance recording (it plays in the page itself, with *back to live*), a loop, a clip or a MIDI map.
- **Right-click is an instrument:** no browser menu, so screen recordings stay clean.
- **Leaner recordings:** WebM is the default video (about 3 Mbps), plus *Visuals only*, *Video + performance* (two files), *Screen with controls* and MP4. A size setting: lean, sharp or full.
- **MIDI:** connect any controller, learn any button or knob, or run the quick map. Mappings are kept in the browser and can be exported. Written against the MIDI specification and tested with simulated devices; see below for hardware.
- A few things are not on any button.

## Next

### A phone as a remote control
A second screen in your hand (the page itself is now comfortable on a phone; this is about controlling the computer's page from one): pads for mutes and clips, a big build ▸ drop pad you hold, an XY pad for the filter and squeegee, style and tempo, with haptic feedback.
The phone needs a way to talk to the page on the computer, which is the part that decides the design:

- **No backend:** pair with a QR code over a direct peer-to-peer connection (WebRTC). Nothing is stored anywhere; it works on the same network and often across networks.
- **Tiny relay:** a small service that only passes messages between two paired devices, for places where peer-to-peer is blocked. This is the first thing in the project that would need a server, so it would be optional and kept minimal.

### Installable: PWA, then an Android app
- **PWA:** install it from the browser, work offline, and get a touch layout that suits a phone or tablet.
- **Android app:** a packaged version of the same page (with native MIDI and lower audio latency), for people who want it on a phone or tablet stage.

### Sound on phones, still to measure
The phone settings are chosen from what is known to cause crackle and heat (small buffers, convolution reverb, picture load), and measured here only on a computer. Next: measure on real phones and tune, and move the heavy parts of the mix off the main thread.

### MIDI, further
- Hardware checks on real controllers (Native Instruments Kontrol X1 MK2 first), then ready-made starting maps for the ones that work well.
- **Pad grids** (Novation Launchpad and similar): pads as the bass grid and drum rings, with lit pads for feedback.
- **Play the synth** from a MIDI keyboard; optional MIDI clock in and out.
- **Controllers that do not speak MIDI** (some Traktor units use HID instead): possible through WebHID, but it needs per-device work.

### A guided tutorial
An optional walk-through that highlights one control at a time and asks you to try it, so the how-to card stays short.

### Live sharing
- **Today:** clean mode and OBS (window capture, or `?clean=1`) for streaming.
- **Broadcast from the page:** the picture and the final audio already exist as browser streams, so a direct broadcast (for example WebRTC) is a natural next step.
- **Event streaming:** a performance is just events, so a live set could be sent as events and rendered on each viewer's own screen: almost no bandwidth, perfect quality, no video compression.

### Recording extras
32-bit float WAV; steadier video timestamps for editing; render a performance to video faster than real time; a recorded performance with its clips and builds as editable data.

## Ideas

- **Share a loop by link** (encoded in the address).
- Loop slots A/B/C with morphing; a simple song arranger that chains styles and journeys.
- Tap tempo; Drift for snare and kick (optional, off by default: they carry the groove).
- A second synth voice; more drum voices and kits.
- **A bouncier electroswing kit** (upright-style bass pluck, brass stab, clap on the swing).
- More pictures (other folds and scenes); visual intensity; reduced-motion polish.
- Keyboard navigation of the grid and rings.

## Principles

- Less is more: a minimal interface, nothing that needs explaining twice.
- Nothing leaves your computer unless you export or send it yourself; no accounts, no tracking.
- DreDarkroom, SafeLight and SquidgySqueegee are DJ aliases, stated plainly, with no added branding.
