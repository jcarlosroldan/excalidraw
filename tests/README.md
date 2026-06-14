# Tests

End-to-end tests that drive the real PHP backend and the built editor with a headless browser.

## Running

```bash
yarn build          # tests use the bundle in static/
yarn test:e2e
```

The runner spins up `php -S` with a throwaway SQLite database (so it never touches
`data/data.db`), serves the app through `tests/router.php`, and drives it with
puppeteer-core against a system Chromium.

- Chromium path defaults to `/usr/bin/chromium`; override with `PUPPETEER_EXECUTABLE_PATH`.
- Port defaults to `8123`; override with `PORT`.
- Screenshots are written to `tests/snapshots/` (gitignored).

## What it covers

- **(a) drawing** — draw a shape while logged out, sign up, reopen with empty storage,
  log in, the shape is still there.
- **(b) library** — install a library (the return flow of *Browse libraries → Add to
  Excalidraw*), sign up, reopen with empty storage, log in, the library is still there.
