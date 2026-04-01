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

By default the app fetches from `/api/timeline` on the same origin. When
running locally you have two options:

### Option 1 — Point at a live backend

The backend's CORS config already allows `http://localhost:3000`. Add one line
to `app/index.html` before the `<script type="module">` tag to override the
API URL at runtime:

```html
<script>window.TIMELINE_API_URL = 'http://localhost:8080/api/timeline';</script>
<script type="module" src="js/main.js"></script>
```

Remove that line before committing — it is for local development only.

### Option 2 — Use the mock fixture (default with `npm run serve`)

`app/serve.json` rewrites `GET /api/timeline` to the mock fixture, so
`npm run serve` works out of the box with no backend running. No code
changes needed.

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
