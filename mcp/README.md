# MCP Server

TypeScript MCP server for Meridian.

## Setup

```bash
cp .env.example .env
# edit .env
npm install
```

## Build

Proto must be generated first (from repo root):

```bash
./generate.sh
```

Then:

```bash
npm run build
```

## Run

```bash
npm start
```
