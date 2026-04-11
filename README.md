# Meridian

A monorepo containing:

- **backend/** — Go gRPC/REST server
- **web-timeline/** — Vanilla JS web frontend
- **android/** — Android app
- **mcp/** — TypeScript MCP server
- **proto/** — Shared protobuf definitions (source of truth)

## Prerequisites

- [buf](https://buf.build/docs/installation) — `brew install bufbuild/buf/buf`
- Go 1.23+
- Node.js 20+
- Java 17+ (for Android)

## Setup

### 1. Install pre-commit hook

Automatically validate proto files, icons, and run tests:

```bash
ln -sf ../../scripts/pre-commit .git/hooks/pre-commit
```

This hook enforces:
- Proto validation (`buf lint` and `buf format`) on proto changes
- Icon checks on web-timeline changes
- Backend tests if backend or proto files changed
- Web-timeline tests if web-timeline or proto files changed

### 2. Generate proto code

Generated code is never committed. Run before building any component:

```bash
./generate.sh
```

## Components

See each component's `README.md` for details.
