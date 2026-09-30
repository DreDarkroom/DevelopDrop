# SquidgySqueegee

A small instrument that lives in a browser tab. A bass synth, three drummers that play against each other, and a picture
made of light: a kaleidoscope you wipe clear with a squeegee. No installs, no accounts, nothing leaves your computer.

DreDarkroom, Safelight and SquidgySqueegee are DJ aliases.

**Play it:** open `index.html`, or visit the hosted page (see the repository description). Press the bulb. Press **?** for a short how-to.

## Playing

| Input | Does |
|---|---|
| `a w s e d f t g y h u j k o l p` | play the bass like a keyboard (`h` is a note, not a shortcut) |
| hold `space` | build tension; let go for the drop |
| drag on the picture | squeegee the fog: it smears, squeaks and opens the filter |
| `1` `2` `3` | change the light, which also changes the mode (Aeolian, Dorian, Lydian) |
| `enter` | play / stop |
| `` ` `` (backtick) | hide the panel, keep the title |
| `c` | clean mode: fullscreen, nothing but the picture. `Esc` to leave |
| `q` | picture quality (auto, high, medium, low) |
| `?` | how-to |

Click the bass grid to write a line; click dots on the rings to change the drummers (`−` `+` hits, `‹` `›` loop length).
The drummers loop at different lengths (16, 12, 14), so the groove only repeats every 336 steps.
**Bounce** is swing. **Drift** lets the bass line wander around your loop (quiet ghost hats come and go too); at 0 it is exactly as written.

## Keeping things

**Loops.** *save loop* stores the loop in this browser and it comes back next time. *↺ saved loop* puts the bass line back to what you saved.
*files ▾* exports and imports loops as small readable `.json` files: everything, or just the bass line, the drums or the sound settings;
you can also copy a loop to the clipboard and paste it elsewhere. Clearing your browser's site data erases saved loops, so export the ones you love.

**Recording.** Pick a format and press *● rec*. It records the final output, after a safety limiter.

| Format | What you get |
|---|---|
| WAV, 24-bit | lossless audio, about 16 MB a minute. Streams to disk in Chrome and Edge, so a long set does not fill memory |
| MP3, 320 kbps | small and universal, about 2.4 MB a minute (encoded live in the background) |
| Performance (`.sqz`) | a compact recording of *what you did*, not the sound: about 3 KB for 45 seconds, under 100 KB for an hour. Play it in the player |
| Video + audio | the picture and sound together (MP4 or WebM, whatever your browser can make) |

*snap* saves a still of the picture.

**Player.** `player.html` replays a `.sqz` performance through the same synth and visuals: drop a file on it, or use *play the demo*.
It has play, pause, seeking and keyboard shortcuts (`space`, `←` `→`, `c`, `f`). A performance can also be linked: `player.html?src=path/to/set.sqz`.
Because a performance is only events, it can be shared, embedded or archived at almost no size.

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

See [ROADMAP.md](ROADMAP.md): MIDI controllers, a guided tutorial, live sharing and more. Suggestions are welcome (the how-to card has a link when one is set up).

## For developers

Plain HTML, CSS and JavaScript: no build step, no framework. Serve the folder (`python -m http.server`) or open `index.html`.

```
index.html, player.html
css/style.css
js/audio.js     synth, drums, echo/room, safety limiter, recording taps
js/seq.js       look-ahead scheduler on a background thread, drummers, drift, loop files
js/visual.js    scene -> kaleidoscope -> feedback tunnel -> tint -> fog; quality manager
js/recorder.js  WAV / MP3 / performance / video capture, PNG snapshot
js/perfrec.js   the .sqz performance format (record, encode, validate, schedule)
js/wav.js       WAV header and PCM conversion (pure)
js/player.js    the performance player
js/ui.js        controls, keyboard, files menu, help
examples/demo.sqz
tests/          node --test tests/logic.test.js
```

Releasing: change `version` in `js/config.js`, then run `node tools/stamp.js`. It tags every script and stylesheet reference with the version so
visitors never get a new page with old scripts (hosts cache files for minutes).

Audio events are stamped with audio-clock time and released to the visuals and UI when that time arrives, so what you see lands with what you hear.

## Third-party code

MP3 encoding uses **lamejs** (a JavaScript port of the **LAME** encoder), unmodified, as its own file in `js/vendor/`, loaded only when you record MP3.
It is licensed LGPL-3.0; see `js/vendor/README.txt` and `js/vendor/LAME-LICENSE.txt`. LAME: https://lame.sourceforge.net
