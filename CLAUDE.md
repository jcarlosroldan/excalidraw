# CLAUDE.md

## What this is

A self-hosted Excalidraw served by PHP only. The running server is PHP + SQLite (no Node at
runtime); Node/yarn are used solely to rebuild the editor bundle into `static/`.

## Structure

- `index.php` - routes `/api/*` through oink, serves the app shell otherwise
- `endpoints.php` - API endpoints (auth, scene, library); `db.php` - SQLite layer; `oink.php` - the framework
- `.htaccess` - sends non-file requests to `index.php`, blocks `data/` and the PHP includes
- `static/` - prebuilt editor (committed, so deploying needs no build)
- `app/` - frontend source (Vite) that mounts `<Excalidraw>` and wires storage to the API
- `packages/` - Excalidraw editor source, built by `build:packages`

## Commands

```bash
yarn install   # node 18+; .yarnrc ignores engine checks
yarn build     # build packages + bundle app into static/ + copy fonts
yarn dev       # build packages, then run the app with Vite dev server
```

## Notes

- The web server user must be able to write `data/` (the SQLite db lives in `data/data.db`).
- After any `yarn build`, `static/` is regenerated; `index.php` references the stable
  `static/assets/app.js` and `static/assets/app.css` names produced by the Vite config.
