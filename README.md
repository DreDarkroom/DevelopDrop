# DevelopDrop

A small instrument that lives in a browser tab. A bass synth, three drummers that play against each other, and a picture
made of light: a kaleidoscope you wipe clear with a squeegee. No installs, no accounts, nothing leaves your computer.

DreDarkroom, SafeLight and SquidgySqueegee are DJ aliases.

**Play it:** https://dredarkroom.github.io/DevelopDrop/ (or open `index.html` from this folder). Press the bulb. Press **?** for a short how-to.

## Playing

| Input | Does |
|---|---|
| `a w s e d f t g y h u j k o l p` | play the bass like a keyboard (`h` is a note, not a shortcut) |
| hold `space` (or hold the right mouse button) | **build**: the music thins out and climbs. Let go and the **drop** lands on the beat |
| hold `Shift` + `space` (or the middle button) | build the other way: the mix sinks under water |
| drag on the picture | squeegee the fog: it smears, squeaks and opens the filter. A **stylus**'s pressure sets the blade: light is fine and precise, hard is broad |
| `1` `2` `3` | change the light, which also changes the mode (Aeolian, Dorian, Lydian) |
| `enter` | play / stop |
| `z` `x` `v` `b` | mute or bring back kick, snare, hats, bass |
| `n` / `Shift` + `n` | clear the bass line / the drums |
| right-click the bass grid or a drummer | a menu: mute, solo, clear a step or all, a new pattern, shift or turn it, key up and down, record a clip, reset level |
| mouse wheel over the bass grid or a drummer | trim its level very finely: 0.25 dB a notch (`Shift` 1 dB, `Alt` 0.05 dB). Wheel down is quieter. The wheel over any slider nudges it finely too |
| `Shift` + `f` | fullscreen on any device, with a quiet clock |
| `;` `'` | previous / next **style** |
| `[` `]` / `{` `}` | tempo down / up by 1 / by 0.1. `\` switches the drum and bass range (to 180) |
| `r` / `Shift` + `r` | record a clip of drums and bass (length set beside the button) / clear clips |
| `i` | start or stop the **journey** |
| `m` | MIDI controller panel |
| `` ` `` (backtick) | hide the panel, keep the title |
| `c` | clean mode: fullscreen, nothing but the picture. `Esc` to leave |
| `q` | picture quality (auto, high, medium, low) |
| `?` | how-to |

Click the bass grid to write a line; click dots on the rings to change the drummers (`−` `+` hits, `‹` `›` loop length).
The drummers loop at different lengths, so the groove takes a long time to repeat.
**Bounce** is swing. **Drift** lets the bass line wander around your loop (quiet ghost hats come and go too); at 0 it is exactly as written.
**Level** is the overall volume and **Duck** is how far the bass dips under each kick.

**Touch and pen.** One set of gestures for mouse, finger and stylus. One finger squeegees; **two fingers held** build and letting go drops; **three** build the other way; **double-tap** the picture hides or shows the panel. A pen's barrel button builds like the right mouse button, its eraser end is ignored, and a resting palm is ignored while a pen is in use. On a phone or tablet the first tap (the safelight switch) also goes fullscreen (add `?fullscreen=0` to the address to stop that; iPhones do not allow page fullscreen), the controls are a sheet at the bottom (a column on the right when the phone is on its side), and **more ▴** opens the rest.

**Balance.** Each part has its own level in decibels, shown beside it while you change it and kept in saved loops and recordings (a style leaves your balance alone; *reset level* is in each right-click menu).
The safety compressor sits after everything, so a very loud kick has little headroom left: pull the others down rather than pushing the kick up.

**Phones and battery.** On a phone the page asks for a larger audio buffer (small ones are what make phones crackle), looks further ahead, uses cheaper processing and a shorter reverb room, and keeps the picture in step with the longer delay.
**eco** goes further: a picture at about a fifth of the pixels and 30 frames a second, no reverb room, plainer hats. It starts on for phones and turns on by itself at 20% battery (not charging); the button turns it off.
The **battery indicator** (where the browser offers one: Chrome and Edge, including Android; Safari and Firefox do not) is ten small cells beside the help button. At 15% and below, unplugged, it blinks on every beat; at 7% and below, on every eighth note. In clean mode it only appears when it is that low.
`?battery=0.12` (or `0.5c` for charging) shows the indicator at a pretend level, and `?eco=1`, `?profile=mobile` try the phone settings on a computer.

**Fullscreen and the clock.** *full* (or `Shift` + `f`) goes fullscreen on any device. In fullscreen and clean mode a quiet clock at the top shows the time since the music started; click it to see the time of day.

**Styles.** The style menu swaps in a whole starting point at the next bar: tempo, drum kit, bass, rings, sound, light and picture.
There is a slow rolling one, a polyrhythmic minimal one, four-on-the-floor electro, a rave one, drum and bass at 174, *Slow Build* (only kick and hats, bring the rest in yourself) and a blank page.
They are original patterns written in the spirit of the artists that inspired this project, not copies of anything.

**Build and drop.** *Quantise* chooses where the drop lands after you let go: on the beat, on the bar, or at the next sixteenth (the tightest).

**Journey.** Press `i` (or *journey*): the tempo rises towards the number you choose over 16 to 256 bars, and the picture moves through its four scenes, getting denser as it goes.

**Clips.** *● drums* or *● bass* records 1 to 8 bars from the next bar and loops them. Click a chip to stop or start it, Shift-click to save it as a file, right-click to remove it.

## Keeping things

**Loops.** *save loop* stores the loop in this browser and it comes back next time. *↺ saved loop* puts the bass line back to what you saved.
*files ▾* exports and imports loops as small readable `.json` files: everything, or just the bass line, the drums or the sound settings;
you can also copy a loop to the clipboard and paste it elsewhere. Clearing your browser's site data erases saved loops, so export the ones you love.

**Drag and drop.** Drop a loop `.json`, a clip `.json`, a MIDI map or a `.sqz` performance onto the page. Loops and clips snap in on the next bar. A performance plays in the page itself, with pause and seeking; *back to live* returns you to your own loop.

**Recording.** Pick a format and press *● rec*. It records the final output, after a limiter and a soft-clip guard, so a recording (and your speakers) never see the signal clip.

| Format | What you get |
|---|---|
| Video · lean WebM (default) | picture and sound together in a small file, about 20 to 25 MB a minute. A *lean / sharp / full* setting trades size for detail |
| Visuals only | the picture with no sound, to lay over a WAV in an editor |
| Video + performance | a lean WebM and a replayable `.sqz` saved together (two files) |
| Screen · with controls | the whole page, panel and all, for tutorials (the browser asks you to allow it) |
| WAV, 24-bit | lossless audio, about 16 MB a minute. Streams to disk in Chrome and Edge, so a long set does not fill memory |
| MP3, 320 kbps | small and universal, about 2.4 MB a minute (encoded live in the background) |
| Performance (`.sqz`) | a compact recording of *what you did*, not the sound: a few KB a minute. Plays in the page or in the player |
| Video · MP4 | picture and sound as MP4, where your browser can make it (bigger) |

*snap* saves a still of the picture. Right-clicks never open a browser menu on this page, so they stay out of screen recordings.

**Player.** `player.html` is a standalone page that replays a `.sqz` through the same synth and visuals: drop a file on it, or use *play the demo*.
It has play, pause, seeking and keyboard shortcuts (`space`, `←` `→`, `c`, `f`). A performance can also be linked: `player.html?src=path/to/set.sqz`.
Because a performance is only events, it can be shared, embedded or archived at almost no size.

**MIDI.** Press `m` and *connect* (Chrome or Edge, on the hosted page or localhost; the browser asks permission first). Then either press *learn* beside an action and touch a control,
or run *quick map*, which walks through the main controls one by one. Buttons, pads, absolute knobs and endless (relative) encoders are supported; mappings are kept in the browser and can be saved and loaded.
For a Traktor Kontrol X1 MK2, Native Instruments' manual says to hold SHIFT and press both LOAD buttons to switch it to plain MIDI mode first. This has been built and tested against simulated controllers: real hardware reports are welcome.

## Streaming and OBS

Use **clean mode** (`c`) and capture the browser window with OBS (Window Capture plus Application Audio Capture), or add
`?clean=1` to the address for a picture-only page without the fullscreen prompt. `?autostart=1` tries to start the sound by itself
(browsers may want one click first), and `?debug=1` shows frame rate, quality and audio latency.
The beat is timed on a background thread, so it stays steady even if the window is covered.

## Good to know

- **Browsers:** best in Chrome and Edge. Firefox and Safari run it, but recordings there are held in memory and saved at the end (they stop safely at 1.5 GB, roughly 90 minutes of WAV), and Safari may not offer every recording format. For a long set, record in Chrome or Edge, or choose MP3 or Performance.
- **MP3 and MIDI need the web page or localhost**, not a file opened directly (`file://`). WAV, performance and video work everywhere.
- **Video from a browser has variable frame rate.** It plays fine; if you edit it, convert once with
  `ffmpeg -i in.mp4 -r 30 -c:v libx264 -crf 18 -c:a copy out.mp4`.
- **Live sets:** while playing, the page keeps the screen awake and asks before you close it. If the browser pauses the audio, a notice says so and any click or key resumes it.
- **Slow computer?** Quality lowers itself automatically if frames get slow, and tries to recover later. `q` changes it by hand.

## Roadmap and ideas

See [ROADMAP.md](ROADMAP.md): a phone as a remote control, an installable app (PWA and Android), more MIDI, a guided tutorial, live sharing and more. Suggestions are welcome (the how-to card has a link when one is set up).

## For developers

Plain HTML, CSS and JavaScript: no build step, no framework. Serve the folder (`python -m http.server`) or open `index.html`.

```
index.html, player.html
css/style.css
js/audio.js     synth, drum kits, bass ducking, builds and drops, echo/room, safety limiter, recording taps
js/seq.js       look-ahead scheduler on a background thread, drummers, styles, builds and drops, clips, journey, loop files
js/visual.js    four scenes -> kaleidoscope -> feedback tunnel -> tint -> fog; progression; quality manager
js/recorder.js  WAV / MP3 / performance / video (WebM, MP4, visuals, screen) capture, PNG snapshot
js/perfrec.js   the .sqz performance format (record, encode, validate, schedule)
js/wav.js       WAV header and PCM conversion (pure)
js/playback.js  replays a performance (used by the player page and by the instrument)
js/player.js    the standalone player page
js/midi.js      Web MIDI: learn, mappings, relative encoders (no DOM)
js/ui.js        controls, keyboard, pointer, drag and drop, MIDI panel, help
examples/demo.sqz
tests/          node --test tests/logic.test.js tests/music.test.js tests/midi.test.js
```

Releasing: change `version` in `js/config.js`, then run `node tools/stamp.js`. It tags every script and stylesheet reference with the version so
visitors never get a new page with old scripts (hosts cache files for minutes).

Audio events are stamped with audio-clock time and released to the visuals and UI when that time arrives, so what you see lands with what you hear.

## Third-party code

MP3 encoding uses **lamejs** (a JavaScript port of the **LAME** encoder), unmodified, as its own file in `js/vendor/`, loaded only when you record MP3.
It is licensed LGPL-3.0; see `js/vendor/README.txt` and `js/vendor/LAME-LICENSE.txt`. LAME: https://lame.sourceforge.net
