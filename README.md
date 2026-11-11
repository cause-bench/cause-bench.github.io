# CauSE-Bench

Paper website based on the [Symphony Rendering layout](https://github.com/symphony-rendering/symphony-rendering.github.io).

## Preview

Run from this directory:

```bash
python3 -m http.server 18769 --bind 127.0.0.1
```

Open http://127.0.0.1:18769/. Both index.html and demo.html open the paper page.
Sample links use ?sample=<sample_id>.

## Files

- index.html and demo.html: paper page and results table.
- demo.css and demo.js: layout and synchronized media players.
- data/demo.json: eight samples, five models, media paths, and event windows.
- demo-media/: 16 silent videos, 16 posters, and 80 evaluated WAVs.
- assets/: paper PDF, construction figure, and favicon.

The Dataset button links to the Google Drive archive configured by releases.dataset in demo.js.
