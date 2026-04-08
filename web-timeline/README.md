# web-timeline

Vanilla JS life timeline visualized as a subway map. Fetches data from the
Meridian REST API and renders a scrollable SVG canvas with branching lines,
stations, and detail cards.

## Development

Install dependencies, then serve the app locally:

```sh
npm install
npm run serve        # serves app/ on http://localhost:3000
```

By default `npm run serve` intercepts `GET /api/timeline` and returns the
mock fixture at `app/tests/fixtures/mock-timeline.json` — no backend needed.

To point at a live backend instead, create `web-timeline/.env.local`
(already gitignored) with:

```
BACKEND_URL=http://localhost:8080
```

Vite will proxy all `/api/*` requests to that origin server-side, so there
are no CORS issues and no source files need to be changed. Delete the file
or leave `BACKEND_URL` unset to switch back to the mock fixture.

## Tests

```sh
npm test                  # unit tests (Vitest)
npm run test:e2e          # integration tests (Playwright, requires npm run serve)
npm run check-icons       # verify all icon IDs in data files have a matching SVG
```

## Icons

Icons are MDI SVGs stored in `app/assets/icons/`. Only icons actually
referenced in events need to be present. To add a new icon, copy the
corresponding file from the [`@mdi/svg`](https://github.com/Templarian/MaterialDesign-SVG)
package into `app/assets/icons/` and reference it in event data as
`"icon": "mdi:icon-name"`.

The `check-icons` script (run automatically as a pre-commit hook) will catch
any missing files before they are committed.
