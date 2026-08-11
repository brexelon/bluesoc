# Running this instance with Docker + Cloudflare Tunnel

This guide walks through installing this Sharkey instance locally with Docker
Compose and publishing it to the internet with a [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/),
so you never have to open a port on your router or expose your home IP address.

It uses [`compose_example.yml`](../compose_example.yml) as the starting point.
A finished version of the compose file (with the tunnel already wired in) ships
as [`compose.cloudflare_example.yml`](../compose.cloudflare_example.yml).

```
                    ┌──── Cloudflare edge ────┐
  User ── HTTPS ──> │  https://social.example │
                    └───────────┬─────────────┘
                                │  outbound-only, encrypted tunnel
                    ┌───────────┴─────────────────────────────┐
                    │ your machine (docker compose)           │
                    │   cloudflared ──> web:3000 (Sharkey)    │
                    │                     ├─> db (PostgreSQL) │
                    │                     └─> redis           │
                    └─────────────────────────────────────────┘
```

`cloudflared` dials *out* to Cloudflare and holds the connection open, so no
inbound firewall rule, port forward, or static IP is required.

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Pick your URL first](#2-pick-your-url-first)
3. [Get the code](#3-get-the-code)
4. [Write the configuration files](#4-write-the-configuration-files)
5. [Create the compose file](#5-create-the-compose-file)
6. [Prepare the data directories](#6-prepare-the-data-directories)
7. [Build and start locally](#7-build-and-start-locally)
8. [Create the Cloudflare Tunnel](#8-create-the-cloudflare-tunnel)
9. [Start the tunnel](#9-start-the-tunnel)
10. [Cloudflare settings that matter](#10-cloudflare-settings-that-matter)
11. [Create the admin account](#11-create-the-admin-account)
12. [Local-only variant (no tunnel)](#12-local-only-variant-no-tunnel)
13. [Day-to-day operations](#13-day-to-day-operations)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Before you start

You need:

- **Docker Engine 24+ with the Compose v2 plugin** (`docker compose version`).
  Docker Desktop on macOS/Windows works too.
- **A domain on Cloudflare.** The domain's nameservers must point at
  Cloudflare (a free plan is fine). You cannot use a Cloudflare Tunnel on a
  domain Cloudflare doesn't host.
- **Disk**: ~10 GB for the build, plus whatever you want for media. Federated
  instances accumulate remote files quickly.
- **RAM**: the frontend build is memory hungry — give Docker at least 6 GB, 8 GB
  is comfortable. On a 2-core machine the first build takes 15–40 minutes.
- `git`.

> **Note on the build.** This repository is a fork, so the compose file builds
> the image from source (`build: .`) rather than pulling
> `registry.activitypub.software/transfem-org/sharkey:latest`. The Dockerfile
> initialises git submodules during the build, so build from a real git clone —
> a downloaded zip will fail.

---

## 2. Pick your URL first

**Read this before doing anything else.**

The `url` in the config is baked into every ActivityPub object your instance
ever produces. Changing it after the first boot breaks federation permanently
and there is no supported migration path. The same applies to the `id`
generation method.

So decide now:

- **Going public** (this guide's main path): pick the hostname you'll use
  forever, e.g. `https://social.example.com/`. Use it from the very first boot,
  even while you're only testing on `localhost`.
- **Local sandbox only**: use `http://localhost:3000/` and accept that this
  instance can never federate and can never be made public later. See
  [section 12](#12-local-only-variant-no-tunnel).

Do not boot with `localhost` "just to try it" and switch to the real domain
afterwards. If you already did, delete the `db/` and `files/` directories and
start over.

---

## 3. Get the code

```bash
git clone <your-fork-url> bluesoc
cd bluesoc
```

If you already have the repository, make sure it's up to date:

```bash
git pull
```

---

## 4. Write the configuration files

Two files are needed, both in `.config/`. That directory is gitignored (apart
from the `*_example.*` templates), so your secrets stay out of version control.

### 4.1 `.config/docker.env`

This is read by the PostgreSQL container to initialise the database.

```bash
cp .config/docker_example.env .config/docker.env
```

Edit it and set your own credentials:

```env
POSTGRES_PASSWORD=<a long random password>
POSTGRES_USER=sharkey
POSTGRES_DB=sharkey
DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
```

Generate a password with something like `openssl rand -hex 24`.

> These values are only used the **first** time the database container starts,
> when it initialises `./db`. Changing them later does not change the actual
> database user — you'd have to `ALTER ROLE` inside PostgreSQL, or wipe `./db`
> and start fresh.

### 4.2 `.config/default.yml`

Sharkey reads `/sharkey/.config/default.yml` inside the container. The compose
file mounts your `.config/` directory there read-only.

```bash
cp .config/docker_example.yml .config/default.yml
```

Edit `.config/default.yml` and change at minimum:

```yaml
# The public URL, exactly as users will see it. Trailing slash included.
# NEVER change this after the first boot.
url: https://social.example.com/

port: 3000

db:
  host: db
  port: 5432
  db: sharkey            # must match POSTGRES_DB
  user: sharkey          # must match POSTGRES_USER
  pass: <the same password as POSTGRES_PASSWORD>

redis:
  host: redis
  port: 6379
```

The hostnames `db` and `redis` are the compose service names — they resolve on
the `shonk` network, so leave them alone.

Two optional settings worth knowing about:

- **Full-text search.** The default `fulltextSearch.provider: sqlLike` works
  everywhere but is slow on large instances. The compose file uses the
  `groonga/pgroonga` PostgreSQL image, so you can switch to
  `provider: sqlPgroonga` — but only after creating the pgroonga index as
  described in the comments in `.config/docker_example.yml`. Leave it on
  `sqlLike` for a first install.
- **Upload size.** `maxFileSize` (bytes) caps uploads. On Cloudflare's free
  plan the edge rejects request bodies over **100 MB**, so anything larger will
  fail no matter what Sharkey allows. See
  [section 10](#10-cloudflare-settings-that-matter).

---

## 5. Create the compose file

Start from the example that ships with the repository:

```bash
cp compose_example.yml compose.yml
```

Note that `compose.yml` is **not** actually ignored by git — `.gitignore` has a
`./compose.yml` entry, but a leading `./` is not valid gitignore syntax and the
pattern never matches. Nothing secret goes in this file (secrets live in
`.config/`), so committing it is harmless, but add `/compose.yml` to
`.gitignore` if you'd rather keep it local.

Now add the tunnel. Insert a `cloudflared` service alongside `web`:

```yaml
  cloudflared:
    restart: always
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    env_file:
      - .config/cloudflared.env
    networks:
      - shonk
    depends_on:
      - web
```

The key detail is `networks: [shonk]` — that puts `cloudflared` on the same
Docker network as Sharkey, so it can reach the app at `http://web:3000`
without Sharkey publishing anything to the host.

While you're in there, two changes to the `web` service:

- The `links:` block is legacy Compose syntax and is unnecessary once every
  service shares the `shonk` network — you can delete it. `depends_on` already
  handles ordering.
- `ports: ["127.0.0.1:3000:3000"]` binds to loopback only, which is what you
  want: it lets you curl the app locally, and nothing else on your LAN or the
  internet can reach it directly. Once the tunnel works you can delete the
  `ports:` block entirely.

If you'd rather not hand-edit, copy the finished file instead:

```bash
cp compose.cloudflare_example.yml compose.yml
```

---

## 6. Prepare the data directories

The compose file bind-mounts three directories from the project root: `db/`,
`redis/` and `files/`. All three are gitignored.

The Sharkey container runs as UID/GID **991**, and a bind mount keeps the
*host's* ownership — so `files/` must be writable by 991 or every upload will
fail with `EACCES`:

```bash
mkdir -p files db redis
sudo chown -R 991:991 files
```

`db/` and `redis/` are fixed up automatically by their own images' entrypoints,
so leave them alone.

> On Docker Desktop for macOS/Windows the ownership step is unnecessary — the
> file sharing layer handles it.

---

## 7. Build and start locally

```bash
docker compose build      # 15–40 minutes on first run
docker compose up -d
docker compose logs -f web
```

On the first start the `web` container runs `pnpm run migrateandstart`, which
applies all database migrations before booting. Expect a few minutes of
migration output. The instance is ready when the logs show the ASCII shark
banner and a line like:

```
INFO  * [core boot]  Now listening on :3000 on https://social.example.com/
```

Verify locally:

```bash
curl -sf http://127.0.0.1:3000/healthz && echo OK
```

`/healthz` returns 200 once the server is up. Don't try to *use* the instance
via `http://localhost:3000` — Sharkey generates absolute URLs from the `url`
setting, so the web UI will bounce you to your public domain, which isn't
reachable yet. That's expected; the tunnel comes next.

---

## 8. Create the Cloudflare Tunnel

1. Open the **Zero Trust dashboard** at
   [one.dash.cloudflare.com](https://one.dash.cloudflare.com) and select your
   account.
2. Go to **Networks → Tunnels** (older accounts: **Access → Tunnels**) and
   click **Create a tunnel**.
3. Choose **Cloudflared** as the connector type, give the tunnel a name
   (e.g. `sharkey`), and save.
4. On the "Install and run a connector" screen, pick the **Docker** tab. You
   don't need to run the command shown — you only need the **token**: the long
   string after `--token` in that command.
5. Save the token to `.config/cloudflared.env`:

   ```bash
   printf 'TUNNEL_TOKEN=%s\n' '<paste the token here>' > .config/cloudflared.env
   chmod 600 .config/cloudflared.env
   ```

   `.config/` is gitignored, so this file will not be committed. Note that the
   whole `.config/` directory is also mounted read-only into the Sharkey
   container; if that bothers you, put the file elsewhere and point `env_file:`
   at it (and add it to `.gitignore` yourself).

   **The token is a credential.** Anyone holding it can route your hostname to
   their own machine. Never paste it into an issue, a screenshot, or a commit.

6. Click **Next** and add a **public hostname**:

   | Field     | Value                            |
   |-----------|----------------------------------|
   | Subdomain | `social` (or blank for the apex) |
   | Domain    | `example.com`                    |
   | Path      | *(leave empty)*                  |
   | Type      | `HTTP`                           |
   | URL       | `web:3000`                       |

   `web:3000` is the compose service name and port. `HTTP` here refers only to
   the connector→Sharkey hop *inside* your Docker network; the public side is
   HTTPS, and the tunnel itself is encrypted.

   This hostname must match the `url` in `.config/default.yml` exactly.

7. Save the tunnel. Cloudflare creates the required DNS record automatically —
   you do not need to add an A/AAAA/CNAME record yourself.

<details>
<summary>Alternative: a locally-managed tunnel (config file instead of token)</summary>

If you prefer keeping tunnel config in git-managed files rather than the
dashboard, run `cloudflared tunnel login` and `cloudflared tunnel create sharkey`
on your machine, then mount `~/.cloudflared` into the container:

```yaml
  cloudflared:
    restart: always
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared:/etc/cloudflared:ro
    networks:
      - shonk
```

with `./cloudflared/config.yml`:

```yaml
tunnel: <tunnel-uuid>
credentials-file: /etc/cloudflared/<tunnel-uuid>.json
ingress:
  - hostname: social.example.com
    service: http://web:3000
  - service: http_status:404
```

You must also create the DNS route once:
`cloudflared tunnel route dns sharkey social.example.com`. Remember to add
`cloudflared/` to `.gitignore` — the JSON file is a credential.
</details>

---

## 9. Start the tunnel

```bash
docker compose up -d
docker compose logs -f cloudflared
```

Healthy output looks like:

```
INF Registered tunnel connection connIndex=0 location=... protocol=quic
INF Registered tunnel connection connIndex=1 ...
```

Four registered connections is normal — cloudflared opens redundant links to
different Cloudflare data centres.

The dashboard's tunnel list should now show **HEALTHY**. Open
`https://social.example.com` in a browser and you should get the Sharkey setup
page.

---

## 10. Cloudflare settings that matter

Defaults are mostly fine, but a few will break a fediverse instance if left
wrong. All of these are in the main Cloudflare dashboard (not Zero Trust), on
your domain.

| Setting | Where | Value | Why |
|---|---|---|---|
| **Bot Fight Mode** | Security → Bots | **Off** | This is the big one. It challenges non-browser clients, which is exactly what every other fediverse server is. Leaving it on silently breaks federation. |
| **Rocket Loader** | Speed → Optimization | **Off** | Reorders JavaScript execution and breaks the frontend. |
| **SSL/TLS mode** | SSL/TLS → Overview | **Full (strict)** | The tunnel is already encrypted end to end; Flexible would only weaken things. |
| **WebSockets** | Network | **On** (default) | Timelines and notifications are delivered over a WebSocket. Without it the UI loads but never updates. |
| **Always Use HTTPS** | SSL/TLS → Edge Certificates | **On** | Harmless and correct — your `url` is HTTPS. |
| **Under Attack mode** | Security | **Off** | Presents an interstitial to every visitor, including remote servers. Only enable during an actual attack, and expect federation to stall while it's on. |

Other things worth knowing:

- **100 MB upload limit.** Free, Pro and Business plans cap request bodies at
  100 MB (Enterprise can be raised). Set `maxFileSize` in
  `.config/default.yml`, and the drive capacity/upload limits in the Sharkey
  admin panel, to something at or under that. Larger uploads fail at the edge
  with a 413 before Sharkey ever sees them.
- **100 second timeout.** Cloudflare returns a 524 if the origin takes longer
  than 100 s to respond. Normal requests are nowhere near this, but some
  long-running admin operations can trip it. Run those from `docker compose
  exec` or the admin queue rather than a synchronous request.
- **Caching.** The default cache behaviour (static file extensions only) is
  correct for Sharkey. Do **not** add a "Cache Everything" page rule for the
  whole domain — it will cache API responses and serve other users' data. If
  you want to cache media aggressively, scope a cache rule to
  `/files/*` and `/proxy/*` only.
- **Client IP.** cloudflared forwards the real client address in
  `X-Forwarded-For`, and Sharkey runs Fastify with `trustProxy: true`, so rate
  limiting and moderation tools see the correct IP without extra configuration.
- **Email.** Cloudflare Tunnel only proxies HTTP. If you configure SMTP for
  signup verification, that traffic leaves your machine directly and is
  unaffected by any of the above.

---

## 11. Create the admin account

Visit `https://social.example.com` and follow the initial setup form to create
the first user, which automatically becomes the instance administrator. Do this
promptly — until the admin exists, the setup form is reachable by anyone who
finds the domain.

Then go to **Settings → Instance (admin)** and set the instance name,
description, registration policy (invite-only or approval-required is strongly
recommended), and drive capacity per user.

---

## 12. Local-only variant (no tunnel)

If you only want a throwaway instance on your own machine — for development or
to poke at the UI — skip the `cloudflared` service entirely and set:

```yaml
# .config/default.yml
url: http://localhost:3000/
```

Then `docker compose up -d` and open `http://localhost:3000`.

Be clear about the trade-off: an instance booted with a `localhost` URL can
never federate and can never be given a real domain later. It's a sandbox, not
a staging environment for your future public instance. If you want to test the
real thing, use a real hostname (a subdomain like `test.example.com` behind its
own tunnel) from the start.

---

## 13. Day-to-day operations

```bash
# Logs
docker compose logs -f web
docker compose logs -f cloudflared

# Restart just the app
docker compose restart web

# Stop everything (data is preserved in ./db, ./redis, ./files)
docker compose down

# Open a shell in the app container
docker compose exec web sh

# psql
docker compose exec db psql -U sharkey -d sharkey
```

### Updating

```bash
git pull
docker compose build web
docker compose up -d web
```

The container's start command is `migrateandstart`, so pending database
migrations run automatically on boot. Read `UPGRADE_NOTES.md` and the
`CHANGELOG.md` entries between your old and new versions before updating — some
releases need manual steps.

### Backups

Back up all three of these together, with the stack stopped (or using
`pg_dump` for a consistent database snapshot on a running instance):

- `db/` — everything: users, notes, follows, keys
- `files/` — locally uploaded media
- `.config/` — your configuration and secrets

```bash
# Consistent DB dump without downtime
docker compose exec -T db pg_dump -U sharkey sharkey | gzip > sharkey-$(date +%F).sql.gz
```

`redis/` holds caches and the job queue; losing it is survivable.

---

## 14. Troubleshooting

**Tunnel shows HEALTHY but the site returns 502 / "Bad gateway"**
cloudflared reached Cloudflare but not Sharkey. Check that the public
hostname's service URL is exactly `web:3000` with type `HTTP`, that
`cloudflared` is on the `shonk` network, and that `web` is actually up
(`docker compose ps`). Test from inside the tunnel container:
`docker compose exec cloudflared wget -qO- http://web:3000/healthz`.

**Error 1033 / "Argo Tunnel error"**
The tunnel isn't connected. Check `docker compose logs cloudflared` — usually a
missing or wrong `TUNNEL_TOKEN`, or blocked outbound UDP/7844. If your network
blocks QUIC, force HTTP/2: `command: tunnel --no-autoupdate --protocol http2 run`.

**Site loads but timelines never update**
WebSockets are disabled at the Cloudflare edge, or a proxy in between is
stripping the upgrade. Check Network → WebSockets.

**Other instances can't see you; your posts don't federate**
Almost always Bot Fight Mode, a WAF rule, or Under Attack mode challenging
remote servers. Check Security → Events for challenged requests from
non-browser user agents and add a skip rule, or turn the feature off.

**Uploads fail at ~100 MB**
Cloudflare's request body limit. Lower Sharkey's `maxFileSize` and the drive
limits to match.

**`EACCES` / permission denied writing to `/sharkey/files`**
`files/` isn't owned by UID 991. `sudo chown -R 991:991 files`.

**The build is killed / runs out of memory**
Give Docker more RAM (6–8 GB). On low-memory machines, build on a bigger
machine and push the image to a registry, or use the upstream image if you
haven't made code changes.

**`password authentication failed for user ...`**
`db.user`/`db.pass` in `.config/default.yml` don't match what the database was
initialised with. The `POSTGRES_*` variables only take effect on a fresh `db/`
directory — either fix the password inside PostgreSQL with `ALTER ROLE`, or
remove `db/` and start over.

**Changed the `url` after first boot**
There's no fix. Wipe `db/` and `files/` and start again with the correct URL.

---

## Further reading

- [Sharkey documentation](https://docs.joinsharkey.org/docs/install/fresh/)
- [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [`.config/docker_example.yml`](../.config/docker_example.yml) — every
  configuration option, commented
- [`UPGRADE_NOTES.md`](../UPGRADE_NOTES.md) — version-specific upgrade steps
