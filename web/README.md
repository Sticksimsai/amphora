# Amphora — web

Static site. No build step, no dependencies. Open `index.html` or serve the folder.

    python3 -m http.server -d web 8000

Everything is driven from `config.js`. Until `GACHA` holds a deployed address the
site is a preview and the buy button reads "Opening soon". Set `api` to the
backend's origin to read the ladder live.

Render: static site, publish directory `web`, no build command.
