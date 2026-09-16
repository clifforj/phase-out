# Phase Out

Play Magic: The Gathering in your browser, with rules enforced by
[XMage](https://github.com/magefree/mage). Create a Commander table, invite other
players, play against AI, or watch a game on an interactive 3D board. Import
decklists directly in the app.

## Run locally

Install Docker with Compose 2.24 or newer. Put `docker-compose.yml`,
`docker-compose.images.yml`, and `.env.example` in one directory.
Copy `.env.example` to `.env` and set
`IMAGE_REPOSITORY` to the published GitHub `owner/repository`, in lowercase.
The images must have been published to GHCR first.

```sh
cp .env.example .env
docker compose -p phase-out-local -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -p phase-out-local -f docker-compose.yml -f docker-compose.images.yml up -d --no-build
```

In PowerShell, use `Copy-Item .env.example .env`. The contact address is already
baked into the prebuilt web image; local build settings are not needed to run it.

Open [localhost:8081](http://localhost:8081). Startup takes a little longer on
the first run while XMage prepares its card database. Local ports bind to
loopback, and sign-in is disabled by default.

With Node.js installed, the helper provides shorter commands:

```sh
node phase-out.mjs start
node phase-out.mjs logs
node phase-out.mjs stop
```

`stop` retains your data. Without Node, use
`docker compose -p phase-out-local down`. Stop any other local stack using
ports 8080 and 8081 before starting this one.

## Development and tests

Install Git and Node.js 22.22.3+ (or 24.15+). Clone with
`git clone --recurse-submodules <repository-url>` and copy `.env.example` to
`.env`. Allow Docker at least 6 GB of memory for compiling XMage.

Set `PRIVACY_CONTACT_EMAIL` before building the web image. Start the game
server and Angular client with hot reload:

```sh
node phase-out.mjs dev
```

Open [localhost:4200](http://localhost:4200). The helper initialises the
submodule if needed, generates missing artwork indexes, installs web dependencies,
and builds the game server. The first build takes several minutes. The web
development server proxies `/ws` to the bridge on port 8080. Ctrl-C stops the
web server; `node phase-out.mjs stop` stops the backend.

```sh
node phase-out.mjs build         # Build both container images
node phase-out.mjs build web     # Build just the web image
node phase-out.mjs test          # Run both test suites
node phase-out.mjs test web      # Run only the web tests
node phase-out.mjs test bridge   # Run only the Kotlin tests
```

The helper uses the `phase-out-local` Compose project. Override it with
`PHASE_OUT_PROJECT` if needed. `--dry-run` prints commands without running them.
To run a source-built stack, use `docker compose -p phase-out-local up -d`;
`start` always pulls the published images.

The underlying commands are also available. From `web/`:

```sh
npm test -- --watch=false
npm run build
```

From the project root, run the Kotlin tests using the same Java 8 toolchain
as the game image:

```sh
docker build --target test -t phase-out-test -f docker/game/Dockerfile .
```

The game image also runs these tests during a normal build. Web tests use
Vitest and jsdom; captured game frames and socket doubles live in
`web/src/app/testing/` and are excluded from the application build.

## How it fits together

```text
Browser (Angular / three.js) <-- WebSocket JSON --> Kotlin bridge <-- RMI --> XMage
```

XMage owns game state, hidden information, and rules enforcement. The bridge
translates player actions and server callbacks, and manages accounts and
imported decks. Each WebSocket has its own XMage session. XMage and the bridge
share a container so that the secondary RMI connection stays on localhost.
The web container serves the client through nginx and proxies `/ws`.

| Path | Purpose |
| --- | --- |
| `bridge/src/main/kotlin/` | Server integration, protocol, authentication, and storage |
| `bridge/src/test/kotlin/` | Bridge tests |
| `web/src/app/` | UI, board rendering, and client state |
| `docker/` | Game image, startup, and deployment scripts |
| `tools/` | Build data generators |
| `vendor/xmage/` | XMage source, pinned as a Git submodule |

The protocol definitions are in `bridge/src/main/kotlin/online/commander/bridge/Protocol.kt` and
`web/src/app/core/protocol.ts`. Frames have a `type` field; the bridge sends
`hello` first, and the client responds with `login`. A game's `prompt.expects`
lists valid response types. Keep `PromptRules.kt` and `ActionDispatch.kt`
aligned when changing that mapping. Additive fields use defaults; incompatible
changes require a protocol version bump.

Signed-in accounts can reclaim a live seat after reconnecting. Live game and
session recovery depend on the running XMage and bridge processes; restarting
the game container interrupts games.

## Build data

`vendor/xmage` is a submodule pinned to commit
`bb9895f947872753145ecbc2a7af9da2d9e6b0cd`. After a plain clone, initialise it
with `git submodule update --init --recursive`. To update XMage, fetch upstream and
check out the intended release in `vendor/xmage`, then regenerate and test:

```sh
node tools/cards/build.mjs
node tools/decks/build.mjs --check
node tools/card-art/build-index.mjs
docker compose build game
```

Update the `org.mage:mage-common` version in `bridge/build.gradle.kts` if the
upstream Maven version changed.

The card-name index is committed at
`bridge/src/main/resources/card-index.txt`; check it with
`node tools/cards/build.mjs --check`. Generated deck files and artwork indexes
are build outputs. The game image generates its starter pool automatically;
additional decks are imported through the app. Card and token images load
from Scryfall's CDN. Rebuild the artwork indexes after changing the card index.

## Production

Copy the three `docker-compose*.yml` files, `.env.example`, and
`docker/deploy.sh` to the deployment host under `/opt/phase-out/`. Rename
`.env.example` to `.env` and configure:

| Variable | Value |
| --- | --- |
| `BRIDGE_GOOGLE_CLIENT_ID` | Google OAuth client ID for a web application |
| `BRIDGE_AUTH_SECRET` | Persistent random signing key; generate with `openssl rand -base64 32` |
| `BRIDGE_ALLOWED_EMAILS` | Optional comma-separated list of allowed verified addresses |
| `TUNNEL_TOKEN` | Cloudflare Tunnel connector token |
| `IMAGE_REPOSITORY` | Lowercase GitHub `owner/repository` |
| `IMAGE_TAG` | `latest` or a published commit SHA |
| `PRIVACY_CONTACT_EMAIL` | Contact address used when building the web image |

Add the site's exact origin to the Google OAuth client's authorized JavaScript
origins. For local sign-in testing, add `http://localhost:4200` or
`http://localhost:8081` and set `BRIDGE_AUTH_MODE=required`.

Configure the tunnel's public hostname to route to `http://web:80`. The
production Compose override requires sign-in and removes the host port
bindings. On the deployment host:

```sh
chmod +x /opt/phase-out/deploy.sh
/opt/phase-out/deploy.sh
```

Named volumes store accounts, imported decks, uploaded playmats, and XMage data.
Back up these volumes and the signing key. Keep the Compose project name stable:
changing it selects a different set of volumes. Rotating the signing key
invalidates existing session tickets.

## Publishing images

`Build and push images` is a manual GitHub Actions workflow. It runs the web
tests, builds and tests the game image, and publishes both images for
`linux/amd64` and `linux/arm64` to:

```text
ghcr.io/<owner>/<repository>/game:<commit-sha>
ghcr.io/<owner>/<repository>/web:<commit-sha>
```

Both images also receive a `latest` tag. Set the repository variable
`PRIVACY_CONTACT_EMAIL` before running the workflow. Publishing uses
`GITHUB_TOKEN` with `packages: write`; no cloud service-account key is needed.
Set each package's visibility to public to allow anonymous pulls.
See [GitHub's container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Select `Deploy after publishing` to deploy on a successful build, or run
`Deploy` separately. Create a GitHub environment (default: `production`) with
`DEPLOY_HOST`, `DEPLOY_SSH_KEY`, and `DEPLOY_HOST_FINGERPRINT` secrets.
The host needs a `deploy` user able to run Docker and the script above.
Restrict its authorized key to `/opt/phase-out/deploy.sh` with port forwarding,
agent forwarding, X11 forwarding, and PTY allocation disabled. The script pulls
the tag configured in the host's `.env`; change `IMAGE_TAG` there to deploy or
roll back to a specific build.

## Credits

Phase Out uses XMage, Angular, three.js, Lucide, and Mana Font. Card metadata
and artwork come from Scryfall; the generated starter pool uses
[taw/magic-preconstructed-decks-data](https://github.com/taw/magic-preconstructed-decks-data).
Upstream projects retain their own licenses and notices.

Magic: The Gathering is owned by Wizards of the Coast. Phase Out is an
unofficial fan project and is not affiliated with or endorsed by Wizards.
