# Backend

Go gRPC/REST server for Meridian.

## Setup

```bash
cp config.yaml.example config.yaml
# edit config.yaml
```

## Build

Proto must be generated first (from repo root):

```bash
./generate.sh
```

Then:

```bash
go build ./...
```

## Test

```bash
go test ./...
```
