# Meridian Backend Linux Deployment

This directory contains deploy-time files for running the Meridian backend as
a systemd service named `meridiand`.

The installer creates:

- `meridiand:meridiand`, home dir `/home/meridiand` (`.aws/` for S3
  credentials lives here)
- `/opt/meridiand/meridiand`
- `/etc/meridiand/config.yaml`
- `/var/lib/meridiand` (data dir — the SQLite database)
- `/etc/systemd/system/meridiand.service`

Build and install from the repository root:

```sh
make generate
make build
sudo deploy/install.sh
```

Or have the installer build the binary:

```sh
sudo deploy/install.sh --build
```

To install a specific binary:

```sh
sudo deploy/install.sh --binary ./bin/meridiand
```

Existing `/etc/meridiand/config.yaml` files are preserved by default. To
replace the config with `config.yaml.example`:

```sh
sudo deploy/install.sh --overwrite-config
```

On a fresh install with no credentials yet, configure S3 access for the
service's own user, then restart it:

```sh
sudo -u meridiand aws configure
sudo systemctl restart meridiand
```

(Skip this if `/home/meridiand/.aws/{config,credentials}` already exists —
`install.sh` never touches that directory, so existing credentials carry
over as-is across reinstalls/updates/migration.)

Update `database.path` in `/etc/meridiand/config.yaml` to a path under
`/var/lib/meridiand/`, e.g. `/var/lib/meridiand/meridian.db`.

Check status and logs:

```sh
systemctl status meridiand
journalctl -u meridiand -f
```

## Updating the binary

```sh
make build
sudo deploy/install.sh
```

`install.sh` is idempotent — re-running it with a fresh binary stops nothing
by itself; `systemctl restart` (run automatically unless `--no-start` is
passed) picks up the new binary.

### From your own machine, without SSHing in

`~/bin/build-and-deploy-service` (not part of this repo) rsyncs `backend/`
to a remote host, builds it there natively, and restarts the service —
run from `backend/`:

```sh
SERVICE_DEPLOY_HOST=your.host build-and-deploy-service meridiand
```

This only updates the binary on an already-installed service (via
`install.sh`, above) — it doesn't create users, directories, or the unit
file.

## Migrating an existing hand-installed deployment

If `meridiand:meridiand` was already set up by hand (the old README walkthrough
— `useradd`, manual `cp` of the binary/config/unit, a logrotate file), moving
it to this script is safe to run in place:

1. Pull this repo's changes onto the host, then `make build`.
2. `sudo deploy/install.sh` — since the user/group already exist, `install.sh`
   skips `useradd` entirely and only fixes up directory ownership and
   installs the binary, unit, and (if missing) config. It won't touch an
   existing `/etc/meridiand/config.yaml` or `/home/meridiand/.aws/*`.
3. `sudo rm -f /etc/logrotate.d/meridiand` — logging moved to journald, so
   the old logrotate config is now dead weight. `/var/log/meridiand/` and its
   existing logs are left alone; clean them up whenever you like.
4. Confirm: `systemctl status meridiand` and `journalctl -u meridiand -f`.
