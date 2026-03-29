# Meridian — Repository Setup Plan

## Overview

`meridian` is a monorepo containing five components: a Go backend, a vanilla JS web frontend, an Android app, a TypeScript MCP server, and shared protobuf definitions. Proto codegen happens at build time — generated code is never committed.

---

## Repository Structure

```
meridian/
  .github/
    workflows/
      proto.yml
      backend.yml
      web.yml
      mcp.yml
      android.yml
  proto/
  backend/
  web-timeline/
  android/
  mcp/
  docs/
  .gitignore
  README.md
  generate.sh
```

---

## `.gitignore`

Covers all five components plus generated proto output:

```gitignore
# Go
backend/bin/
*.test

# Generated proto output — never committed
backend/internal/grpc/gen/
mcp/proto-gen/
android/app/src/main/java/com/meridian/proto/

# Node / TypeScript
node_modules/
mcp/dist/

# Android
android/.gradle/
android/build/
android/app/build/
*.apk
*.aab

# Environment
.env
*.env.local

# OS
.DS_Store
```

---

## `proto/`

Single source of truth for all gRPC contracts. Both `backend/` and `mcp/` generate from here.

```
proto/
  buf.yaml
  buf.gen.yaml
  meridian/
    v1/
      events.proto
      lines.proto
      photos.proto
      import.proto
```

### `buf.yaml`

```yaml
version: v2
modules:
  - path: .
lint:
  use:
    - DEFAULT
breaking:
  use:
    - FILE
```

### `buf.gen.yaml`

```yaml
version: v2
plugins:
  - plugin: buf.build/protocolbuffers/go
    out: ../backend/internal/grpc/gen
    opt:
      - paths=source_relative
  - plugin: buf.build/grpc/go
    out: ../backend/internal/grpc/gen
    opt:
      - paths=source_relative
  - plugin: buf.build/community/stephenh-ts-proto
    out: ../mcp/proto-gen
    opt:
      - esModuleInterop=true
      - outputServices=nice-grpc
      - useDate=string
```

---

## `generate.sh`

Convenience script at the repo root. Each component's CI workflow runs this as its first step.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running buf generate..."
cd proto && buf generate
echo "Proto generation complete."
```

Make executable: `chmod +x generate.sh`

---

## `backend/`

```
backend/
  cmd/
    server/
      main.go
  internal/
    auth/
    config/
    db/
    domain/
    grpc/
      gen/          # gitignored — generated at build time
    merge/
    rest/
  migrations/
  config.yaml.example
  go.mod
  go.sum
  README.md
```

### `go.mod` (initial)

```
module github.com/rmrobinson/meridian/backend

go 1.23
```

---

## `web-timeline/`

```
web-timeline/
  index.html
  css/
    main.css
    timeline.css
    cards.css
    grid.css
  js/
    main.js
    api.js
    timeline.js
    lanes.js
    lines.js
    stations.js
    cards.js
    zoom.js
    grid.js
  assets/
    icons/          # manually curated MDI SVGs
  tests/
    unit/
    integration/
    fixtures/
      mock-timeline.json
  scripts/
    check-icons.js  # pre-commit icon validation
  package.json      # vitest + playwright devDependencies only
  README.md
```

---

## `mcp/`

```
mcp/
  src/
    index.ts
    client.ts
    tools/
      createEvent.ts
      importEvents.ts
      updateEvent.ts
      deleteEvent.ts
  proto-gen/        # gitignored — generated at build time
  package.json
  tsconfig.json
  .env.example
  README.md
```

### `.env.example`

```
BACKEND_GRPC_URL=localhost:9090
BEARER_TOKEN=your-token-here
```

### `package.json` (initial)

```json
{
  "name": "@meridian/mcp",
  "version": "0.1.0",
  "scripts": {
    "proto": "cd ../proto && buf generate",
    "build": "npm run proto && tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "nice-grpc": "latest",
    "nice-grpc-common": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## `android/`

```
android/
  app/
    src/
      main/
        java/com/meridian/
        res/
        AndroidManifest.xml
  build.gradle
  settings.gradle
  gradle.properties
  README.md
```

Proto generation for Android is deferred — add a buf plugin for Kotlin/gRPC when Android development begins.

---

## `docs/`

```
docs/
  life-timeline-plan.md       # frontend architecture plan
  life-timeline-week-grid.md  # week grid addendum
  backend-plan.md             # backend architecture plan
  meridian-repo-setup.md      # this document
```

---

## GitHub Actions Workflows

### `proto.yml` — lint and breaking change detection only

```yaml
name: Proto

on:
  push:
    paths:
      - 'proto/**'
  pull_request:
    paths:
      - 'proto/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bufbuild/buf-action@v1
        with:
          working-directory: proto
          lint: true
          breaking: true
          breaking_against: "https://github.com/rmrobinson/meridian.git#branch=main,subdir=proto"
```

### `backend.yml`

```yaml
name: Backend

on:
  push:
    paths:
      - 'backend/**'
      - 'proto/**'
  pull_request:
    paths:
      - 'backend/**'
      - 'proto/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
      - uses: bufbuild/buf-action@v1
        with:
          working-directory: proto
          push: false
      - name: Generate proto
        run: ./generate.sh
      - name: Build
        run: cd backend && go build ./...
      - name: Test
        run: cd backend && go test ./...
```

### `web.yml`

```yaml
name: Web

on:
  push:
    paths:
      - 'web-timeline/**'
  pull_request:
    paths:
      - 'web-timeline/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd web-timeline && npm ci
      - name: Check icons
        run: cd web-timeline && node scripts/check-icons.js
      - name: Unit tests
        run: cd web-timeline && npx vitest run
      - name: Install Playwright
        run: cd web-timeline && npx playwright install --with-deps
      - name: Integration tests
        run: cd web-timeline && npx playwright test
```

### `mcp.yml`

```yaml
name: MCP

on:
  push:
    paths:
      - 'mcp/**'
      - 'proto/**'
  pull_request:
    paths:
      - 'mcp/**'
      - 'proto/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: bufbuild/buf-action@v1
        with:
          working-directory: proto
          push: false
      - name: Generate proto
        run: ./generate.sh
      - run: cd mcp && npm ci
      - run: cd mcp && npm run build
```

### `android.yml`

```yaml
name: Android

on:
  push:
    paths:
      - 'android/**'
  pull_request:
    paths:
      - 'android/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Build
        run: cd android && ./gradlew assembleDebug
```

---

## Pre-commit Hook

Validates that every MDI icon referenced in `web-timeline/` fixtures exists on disk before committing.

```
.git/hooks/pre-commit  →  runs web-timeline/scripts/check-icons.js
```

Setup (run once after cloning):

```bash
echo '#!/bin/sh\nnode web-timeline/scripts/check-icons.js' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## Initial Setup Steps

1. Create GitHub repo `rmrobinson/meridian`
2. Clone and create directory structure above
3. Copy existing plan docs into `docs/`
4. Copy existing `life-timeline/` frontend code into `web-timeline/`
5. Copy existing backend code into `backend/`
6. Add `.gitignore` and `generate.sh`
7. Install buf CLI: `brew install bufbuild/buf/buf`
8. Run `cd proto && buf generate` to verify codegen works end to end
9. Push and confirm GitHub Actions workflows pass on first run
