# Backend

Go gRPC/REST server for Meridian.

## Prerequisites

- Go 1.22+
- [buf](https://buf.build/docs/installation) (for proto generation)
- `openssl` (for generating secrets)
- AWS CLI credentials configured if using S3-backed enrichment

## First-time setup

### 1. Copy and edit the config

```bash
cp config.yaml.example config.yaml
```

Fill in at minimum: `auth.jwt_secret`, `auth.write_tokens`, `person.name`, and `person.birth_date`. All other fields have working defaults.

### 2. Generate a JWT secret

The JWT secret signs read-side tokens issued to the web app. Use a long random value:

```bash
openssl rand -base64 32
```

Paste the output into `auth.jwt_secret` in `config.yaml`.

### 3. Generate write tokens

Write tokens authenticate gRPC callers (CLI tools, mobile apps, importers). Each token has a human-readable name and a bcrypt hash — the raw token is never stored on disk.

**Step 1 — pick a random raw token:**

```bash
openssl rand -base64 32
```

**Step 2 — hash it with bcrypt:**

```bash
# Using htpasswd (comes with Apache utils on most systems):
htpasswd -bnBC 10 "" YOUR_RAW_TOKEN | tr -d ':\n'; echo

# Or with Python if htpasswd is unavailable:
python3 -c "import bcrypt; print(bcrypt.hashpw(b'YOUR_RAW_TOKEN', bcrypt.gensalt(10)).decode())"
```

**Step 3 — add to config.yaml:**

```yaml
auth:
  write_tokens:
    - name: "cli"
      token_hash: "$2a$10$<hash from step 2>"
```

Repeat for each client that needs write access. The name is only used for audit logging — it is never sent over the network.

### 4. Configure enrichment (optional)

Enrichment automatically populates metadata (cover images, authors, directors, etc.) when events are created. Both enrichers require an S3 bucket to store downloaded images.

#### ISBNdb — book metadata

1. Create an account and obtain an API key at [isbndb.com](https://isbndb.com/isbn-database).
2. Set `enrichment.isbndb_api_key` in `config.yaml`.

When a `books` family event is created with an ISBN in its metadata, the server fetches the book record from ISBNdb and populates `author`, `cover_image_url`, and `preview_url`.

#### TMDB — film & TV metadata

1. Create an account and obtain an API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
2. Set `enrichment.tmdb_api_key` in `config.yaml`.

When a `film_tv` family event is created with a `tmdb_id` in its metadata, the server fetches the record from TMDB and populates `director` (for movies) or `network` (for TV), `year`, and `poster_url`.

#### S3 image storage

Both enrichers download cover/poster images and re-upload them to S3 so the frontend can serve them from a stable URL.

1. Create an S3 bucket in your AWS account.
2. Set `enrichment.s3_bucket` and `enrichment.s3_region` in `config.yaml`.
3. Ensure the server process has `s3:PutObject` permission on that bucket (via an IAM role, instance profile, or `~/.aws/credentials`).

If either API key is set but `s3_bucket` is empty, that enricher is disabled at startup and a warning is logged.

## Build

Generate proto first, then build:

```bash
make generate   # runs buf generate from ../proto
make build
```

## Run

```bash
./bin/server -config config.yaml
```

The server starts a REST API on `rest_port` (default 8080) and a gRPC API on `grpc_port` (default 9090). The SQLite database is created automatically at the path set in `database.path`.

## Test

```bash
make test
# or directly: GOWORK=off go test ./...
```

## Sharing tokens

Sharing tokens let you grant read access to the REST API at a specific visibility level without exposing your owner JWT. They are managed via the gRPC `SharingService` and require a valid write token.

All `grpcurl` examples below assume the server is running locally on its default gRPC port. Replace `<write_token>` with a raw write token from your config.

### Create a sharing token

```bash
grpcurl -plaintext \
  -H "Authorization: Bearer <write_token>" \
  -d '{
    "name": "Alice",
    "email": "alice@example.com",
    "visibility": "VISIBILITY_FRIENDS"
  }' \
  localhost:9090 meridian.v1.SharingService/CreateSharingToken
```

The response contains:
- `token` — a signed JWT to hand to the recipient. **This is returned once only; it is not stored.**
- `record` — the persisted token record including its `id`.

To create a token that expires:

```bash
grpcurl -plaintext \
  -H "Authorization: Bearer <write_token>" \
  -d '{
    "name": "Bob",
    "email": "bob@example.com",
    "visibility": "VISIBILITY_FAMILY",
    "expires_at": "2026-12-31T23:59:59Z"
  }' \
  localhost:9090 meridian.v1.SharingService/CreateSharingToken
```

Valid `visibility` values: `VISIBILITY_PUBLIC`, `VISIBILITY_FRIENDS`, `VISIBILITY_FAMILY`, `VISIBILITY_PERSONAL`.

### List all sharing tokens

Returns all tokens, including revoked ones.

```bash
grpcurl -plaintext \
  -H "Authorization: Bearer <write_token>" \
  localhost:9090 meridian.v1.SharingService/ListSharingTokens
```

### Revoke a sharing token

Revocation takes effect immediately — subsequent REST requests using the token's JWT are treated as unauthenticated even if the JWT has not yet expired.

```bash
grpcurl -plaintext \
  -H "Authorization: Bearer <write_token>" \
  -d '{"id": "<token_id>"}' \
  localhost:9090 meridian.v1.SharingService/RevokeSharingToken
```

`<token_id>` is the `record.id` value returned by `CreateSharingToken` or `ListSharingTokens`.

### Using a sharing token on the REST API

Pass the JWT returned by `CreateSharingToken` as a bearer token on any REST request:

```bash
curl -H "Authorization: Bearer <sharing_jwt>" http://localhost:8080/api/timeline
```

## Makefile targets

| Target     | Description                        |
|------------|------------------------------------|
| `build`    | Compile the server binary          |
| `test`     | Run all tests                      |
| `generate` | Re-generate proto bindings via buf |
