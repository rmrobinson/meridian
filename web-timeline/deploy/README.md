# Deploying web-timeline without Vite

`web-timeline/app/` is plain static content: native ES modules
(`<script type="module">`), relative CSS links, and a single same-origin
fetch to `/api/timeline`. `npm run serve` (Vite) is only a dev convenience —
hot reload, a mock-API middleware, and proxying `/api` to a real backend via
`BACKEND_URL`. Nothing needs to be bundled to run the app in production; nginx
can serve the source files directly.

## 1. Build the static bundle

```sh
cd web-timeline/deploy
./build.sh /tmp/meridian-dist
```

This copies `app/` (minus `tests/`, `.DS_Store`, `serve.json`) into the output
directory and merges `public/`'s contents into the bundle root — e.g.
`public/icons/duck.png` becomes `icons/duck.png`. That mirrors how Vite mounts
`publicDir` at the docroot root, both under `npm run serve` and in
`vite build` output. Skipping this merge breaks the `/icons/*.png` fetches in
`app/js/icons.js`.

Copy the resulting directory to the web server:

```sh
rsync -a /tmp/meridian-dist/ user@host:/var/www/meridian-timeline/
```

## 2. Configure nginx

Copy `nginx.conf.example` to your nginx config directory (e.g.
`/etc/nginx/sites-available/meridian-timeline` on Debian/Ubuntu, then symlink
it into `sites-enabled/`), and replace the placeholders:

- `timeline.example.com` — the public hostname for the timeline
- `/var/www/meridian-timeline` — wherever you copied the bundle
- `BACKEND_HOST` — the host running the Meridian backend's REST API (`:8080`)

The `/api/` proxy keeps browser requests same-origin, which avoids CORS and
mirrors how Vite's dev proxy behaves (see `web-timeline/vite.config.js`).

Test and reload:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

## 3. Verify

Load the site and confirm:

- The timeline renders with events
- Icons load — both `/assets/icons/*.svg` and `/icons/*.png`
- The browser's Network tab shows `/api/timeline` returning 200 with no CORS
  errors

## Re-deploying

There's no build artifact to version — the bundle is just a filtered copy of
the source tree. Re-run `./build.sh` and re-sync whenever `app/` changes.
