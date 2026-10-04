# The Price of a Crown

A fifteen-episode reading series for English learners, published with GitHub Pages.
The teacher releases one episode per reading day by showing a QR code; the episode then stays open on the student's phone and works offline.

## What is in this repository

| File | Purpose |
|------|---------|
| `index.html` | Home page: the episode list |
| `ep.html` | Episode reader: unlocks, then shows the story, animations, vocabulary, quiz and PDF |
| `teacher.html` | Teacher page: shows the QR code and typed code for each released episode |
| `epNN.bin` | One encrypted episode each (AES-GCM, key derived from the episode code) |
| `teacher.bin` | The episode codes, encrypted with the teacher password |
| `episodes.json` | Titles, blurbs and which episodes are released |
| `sw.js`, `manifest.webmanifest`, icons | Offline support and "Add to Home Screen" |
| `tools/check.mjs` | Pre-publish check (see below) |

**Never commit** `teacher-sheet.pdf`, the printable PDFs or the build zip. `.gitignore` blocks `*.pdf` and `*.zip`, and the check fails if one is in the folder.

## Publishing an update

1. Copy the new build's `site` files over this folder.
2. Re-apply the local fixes below if the build does not include them yet.
3. Change the version string on line 1 of `sw.js` and add any new `thumbNN.jpg` to its `SHELL` list.
4. Run the check, then push:

```bash
node tools/check.mjs
```

```bash
git add -A && git commit -m "feat: release episode NN" && git push
```

## Local fixes made on top of the original build

These were patched into the built files on 2026-10-04. The builder that produces the `site` folder should adopt them, otherwise the next build overwrites them.

- `sw.js`: when offline, only page navigations fall back to `index.html`. Before, a missing `epNN.bin` was answered with the home page's HTML, which the reader then reported as a wrong code.
- `ep.html`: a failed download now says so instead of "That code didn't open this episode".
- `ep.html`: a missing animation scene no longer stops the vocabulary, quiz and PDF button from working.
- `teacher.html`: the device stores the derived key instead of the teacher password in plain text, and there is a "Lock the teacher page on this device" button for shared classroom computers.
- `teacher.html`: `noindex`, so search engines do not list the teacher page.
- `manifest.webmanifest`: separate `any` and `maskable` icon entries.

## Limits worth knowing

- The episode codes are short (`word-1234`). They pace a class; they would not stop someone determined to guess a code against the public `epNN.bin` file.
- An unlock lives in the browser's storage. On iPhone, Safari and the Home Screen app keep separate storage, and Safari may clear a site's storage after a week without a visit, so a student may need the code again.
