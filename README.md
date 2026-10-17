# The Price of a Crown

A fifteen-episode reading series for English learners, published with GitHub Pages.
All fifteen episodes are on the site, each locked with its own code. The teacher gives the class an episode's code (or its QR code) on the reading day; the episode then stays open on the student's phone and works offline. The story reads as one continuous text, and the animated scene behind it changes as the student reads.

## What is in this repository

| File | Purpose |
|------|---------|
| `index.html` | Home page: the episode list |
| `ep.html`, `reader.js`, `reader.css` | Episode page: asks for the day's code, unlocks the episode, then starts the reader |
| `immersive.js`, `immersive.css`, `ambient.js` | The reader: the story as one text, with the scene of each part behind (or beside) it |
| `after.js`, `after.css` | The activities after the story: the crown quiz, scenes in order, rumour or record, word cards |
| `teacher.html`, `teacher.js`, `teacher.css`, `qr.js` | Teacher page: after the teacher password, one table with every episode's code, a copy button, a link and a QR code for the classroom screen |
| `epNN.bin` | One locked episode each (AES-GCM, key derived from the episode code): text, scenes, activities and the printable PDF |
| `teacher.bin` | The episode codes, encrypted with the teacher password |
| `episodes.json` | Titles, blurbs and which episodes are released |
| `sw.js`, `manifest.webmanifest`, icons | Offline support and "Add to Home Screen" |
| `tools/check.mjs` | Pre-publish check (see below) |

**Never commit** `teacher-sheet.pdf`, the printable PDFs, the build zip, or any working file that holds an episode unlocked (`episode-NN.js`, `story.json`, `series-map.js`, `source.bin`). `.gitignore` blocks `*.pdf` and `*.zip`, and the check fails if one of these is in the folder.

## Releasing more episodes

Episodes get their codes from a script kept beside this folder:

```bash
node prototype/release.mjs 03 04
```

It gives each episode named a new code (an episode that already has one keeps it), stores the codes only inside `teacher.bin`, locked with the teacher password, and marks the episodes as released in `episodes.json`. It never prints a code: the teacher page shows them. Then publish as below. Each released episode needs a `thumbNN.jpg`; `node prototype/dev/thumbs.mjs NN` makes one from the episode's scenes.

## Publishing an update

The reader, the locked episodes and `sw.js` are written into this folder by a script kept beside it (outside this repository, with the unlocked stories):

```bash
node prototype/publish.mjs
```

Run it from the folder that holds both `crown` and `prototype`. It builds each released episode, locks it with the code it already has, proves that the locked file opens, and refuses to write anything if a code or a piece of story text has strayed into a public file. A phone that opened an episode before keeps its key, and the key still fits the new file.

Then, in this folder, run the check and push:

```bash
node tools/check.mjs
```

```bash
git add -A && git commit -m "feat: release episode NN" && git push
```

To also prove that every released episode opens with its code, and that no code or password is written in a public file, run `node prototype/check-site.mjs` from the folder above. It reads the teacher password from the private teacher sheet, so the password is never typed on a command line.

`node prototype/publish.mjs test` makes a whole copy of the site locked with made-up codes, for trying the unlock on this computer without a real code.

## Files that are edited here by hand

`index.html`, `teacher.html`, `episodes.json`, `manifest.webmanifest` and the pictures are not made by the script. Fixes made to them on 2026-10-04, which a future builder of these files should keep:

- `teacher.html`: the device stores the derived key instead of the teacher password in plain text, and there is a "Lock the teacher page on this device" button for shared classroom computers.
- `manifest.webmanifest`: separate `any` and `maskable` icon entries.
- `sw.js` (now written by the script from its template): when offline, only page navigations fall back to `index.html`, so a missing `epNN.bin` is never answered with the home page.

## Limits worth knowing

- The episode codes are short (`word-1234`). They pace a class; they would not stop someone determined to guess a code against the public `epNN.bin` file.
- An unlock lives in the browser's storage. On iPhone, Safari and the Home Screen app keep separate storage, and Safari may clear a site's storage after a week without a visit, so a student may need the code again.
- The episode page allows scripts from this site only. The scenes of an episode are code that travels inside its locked file and is started by `reader.js` after the unlock.
