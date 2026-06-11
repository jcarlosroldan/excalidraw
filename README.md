# Excalidraw, self-hosted on PHP

A self-hosted [Excalidraw](https://github.com/excalidraw/excalidraw) with user accounts and
server-side storage, running on nothing but PHP + SQLite. No Node, Docker or external services
at runtime. The API is built with [oink](https://github.com/jcarlosroldan/oink).

Clone it into any directory served by PHP and it works: register an account, draw, and your
scene and library are saved to your account automatically.

## How it works

- `index.php` routes `/api/*` requests through oink and serves the app shell for everything else.
- `endpoints.php` exposes `register`, `login`, `logout`, `whoami`, `scene_load`, `scene_save`,
  `library_load`, `library_save`. Sessions are cookie-based.
- `db.php` stores users, sessions, scenes and libraries in `data/data.db` (SQLite, created on
  first run).
- `static/` is the prebuilt Excalidraw editor (committed, so no build step is needed to deploy).
- `app/` is the frontend source; `packages/` is the Excalidraw editor source it builds against.

## Deploying

1. Clone into a PHP-served directory (PHP 8.0+ with `pdo_sqlite`).
2. Make sure the web server user can write the `data/` directory, e.g. `chown www-data data`.

That's it. Routing relies on `.htaccess` (Apache with `mod_rewrite` and `AllowOverride All`).

## Rebuilding the editor

Only needed if you change `app/` or pull new editor source. Requires Node 18+ and yarn:

```
yarn install
yarn build
```

This rebuilds `packages/`, bundles `app/` into `static/`, and copies the editor fonts.
