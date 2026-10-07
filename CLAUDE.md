# Project instructions

## Name

The project is **DevelopDrop SafeLight Instrument**; the short form is **DevelopDrop**.
Spell it exactly: capital D and capital D in DevelopDrop, capital L in SafeLight. Never "Developdrop" or "Develop Drop".
It replaces the old working name SquidgySqueegee.

- Repo: `DreDarkroom/DevelopDrop`. Live: https://dredarkroom.github.io/DevelopDrop/ (the path is case-sensitive).
- In code, `SS.config.name` and `SS.config.slug` hold the name and the file prefix (`developdrop`).
- The DJ aliases DreDarkroom, SafeLight and SquidgySqueegee are separate from the project name and keep their own casing.
- Do not change the `app: 'SquidgySqueegee'` marker in saved files or the `squidgysqueegee.*` storage keys: existing loops, clips and recordings depend on them.

## Role

DevelopDrop is the **steady** version: bug fixes, small improvements and measurement only. New ideas are tried first in the experimental parallel version, DreVelopDrop (separate repo).
The feedback card (`js/feedback.js`) and `src/ui/feedback.js` in DreVelopDrop share one design and one set of tests: change them together.

## Working rules

- No invented branding: no logos, taglines or lore. Plain wording, minimal interface ("less is more").
- Keep public files (README, ROADMAP, this file) free of private notes.
- Deploying (push to `main`) and renaming things on GitHub need the owner's go-ahead.
- Release routine: bump `version` in `js/config.js`, run `node tools/stamp.js`, run `node --test tests/logic.test.js tests/music.test.js tests/midi.test.js tests/feedback.test.js`, commit, push, then check the live `js/config.js` shows the new version.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
