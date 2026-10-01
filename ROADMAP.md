# DevelopDrop: roadmap

A living list. Ideas are welcome: use the *Suggest something* link in the how-to card (press `?`) when it is there.

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
A second screen in your hand: pads for mutes and clips, a big build ▸ drop pad you hold, an XY pad for the filter and squeegee, style and tempo, with haptic feedback.
The phone needs a way to talk to the page on the computer, which is the part that decides the design:

- **No backend:** pair with a QR code over a direct peer-to-peer connection (WebRTC). Nothing is stored anywhere; it works on the same network and often across networks.
- **Tiny relay:** a small service that only passes messages between two paired devices, for places where peer-to-peer is blocked. This is the first thing in the project that would need a server, so it would be optional and kept minimal.

### Installable: PWA, then an Android app
- **PWA:** install it from the browser, work offline, and get a touch layout that suits a phone or tablet.
- **Android app:** a packaged version of the same page (with native MIDI and lower audio latency), for people who want it on a phone or tablet stage.

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
