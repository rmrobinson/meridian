# Meridian MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the Meridian timeline gRPC API to AI agents such as Claude.

## Prerequisites

- Node.js 20+
- A running Meridian backend (see `backend/README.md`)
- A valid gRPC write token configured in the backend

## Setup

Install dependencies:

```sh
npm install
```

Create a `.env` file (or copy from the example):

```sh
cp .env.example .env
```

Edit `.env` and set:

| Variable | Description |
|---|---|
| `BACKEND_GRPC_URL` | Host and port of the Meridian gRPC server, e.g. `localhost:9090` |
| `BEARER_TOKEN` | A write token configured in the backend's `auth.write_tokens` |

## Running

### Development (no build step)

```sh
npm run dev
```

Runs the server directly from TypeScript source using `tsx`. Reads `.env` automatically.

### Production

Build first, then start:

```sh
npm run build
npm start
```

`npm run build` also regenerates the protobuf TypeScript bindings via `buf generate`. Requires `buf` to be installed (`brew install bufbuild/buf/buf`).

## Connecting to Claude

Add the server to your Claude Desktop configuration (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "meridian": {
      "command": "node",
      "args": ["/path/to/meridian/mcp/dist/src/index.js"],
      "env": {
        "BACKEND_GRPC_URL": "localhost:9090",
        "BEARER_TOKEN": "your-token-here"
      }
    }
  }
}
```

Or using the dev script (no build required):

```json
{
  "mcpServers": {
    "meridian": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/path/to/meridian/mcp",
      "env": {
        "BACKEND_GRPC_URL": "localhost:9090",
        "BEARER_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|---|---|
| `list_events` | List timeline events, optionally filtered by family, date range, or visibility |
| `create_event` | Create a new timeline event |
| `update_event` | Update fields on an existing event |
| `delete_event` | Soft-delete an event by ID (recoverable by an operator) |
| `import_events` | Bulk-import events from an external source with upsert/skip conflict resolution |

## Regenerating Protobuf Bindings

The TypeScript bindings in `proto-gen/` are generated from `../proto/` and should not be edited manually. To regenerate after changing the proto definitions:

```sh
npm run proto
```

Requires `buf` to be installed.
