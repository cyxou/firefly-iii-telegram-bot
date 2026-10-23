# Firefly III Telegram Bot
This Telegram bot facilitates creating [Firefly III](https://www.firefly-iii.org/) transactions
as well as provides some capabilities to manage other Firefly's entities like
Accounts, Categories, Reports, etc.

<h1 align="center"><img src="https://github.com/cyxou/firefly-iii-telegram-bot/blob/master/assets/bot-v2.jpeg?raw=true" alt="screenshot" align="center"/></h1>

## ️⚠ Notice: Limited Firefly III Version Support

This Telegram bot is developed for use with Firefly III finance manager.
However, due to time constraints, the support for different Firefly III versions
may be limited.

Please be aware that I may not be able to promptly address issues or developments
related to all Firefly III versions. Users are encouraged to consider this while
using the bot with different versions of Firefly III.

For the best experience, it's recommended to use this bot with supported Firefly III versions.
Your understanding and cooperation are appreciated.

### Version Compatibility

- Version v2 of this bot has been tested with Firefly III v6.0.30.
- Version v3's API client is generated from Firefly III v6.7.8.
- All other versions of Firefly III might not work properly with this bot.

## ⚠ Upgrading from v2 to v3

v3 is a major rework. Read this before bumping your image tag:

- **32-bit ARM (`arm/v7`) images are gone.** v3 images are `amd64` + `arm64`
  only — the Bun runtime is not published for 32-bit ARM. If you run a 32-bit
  OS on Raspberry Pi 3/4/5 (all 64-bit-capable), flash a 64-bit OS and use the
  `arm64` image. On genuinely 32-bit-only hardware (Pi 1/2 and similar), stay
  on the v2 image.
- **Redis is now required** (session storage). `compose.yaml` ships one
  alongside the bot. Set `REDIS_URL` in `.env` if you run your own (defaults
  to `redis://localhost:6379` outside compose); the bot exits at startup if
  Redis is unreachable.
- **Sessions start from scratch.** v1/v2 file sessions are not migrated —
  any half-finished flow simply restarts. Credentials are the only thing worth
  carrying over: either re-enter them via **Settings** in the bot, or
  pre-configure them with the new `FIREFLY_URL` + `FIREFLY_ACCESS_TOKEN` env
  vars (see `.example.env`) — env credentials apply to every user who hasn't
  saved their own.
- **Volume change:** the old `-v $(pwd)/sessions:/home/node/app/sessions` mount
  does nothing in v3. Per-user settings now live in `/app/data` (only needed if
  you configure via **Settings** instead of env vars — `compose.yaml` mounts it).
- **`DEBUG` env var is gone** — use `LOG_LEVEL` (trace|debug|info|warn|error).

## Setup
First you'll have to [generate a Telegram Bot token through BotFather](https://core.telegram.org/bots/tutorial#obtain-your-bot-token). Once you generate the token, keep it safe.

### Docker Compose (Recommended)

Copy _.example.env_ to _.env_, fill in `BOT_TOKEN` (and optionally
`FIREFLY_URL` + `FIREFLY_ACCESS_TOKEN` to skip in-bot configuration), then:

```shell
docker compose up -d
```

This starts the bot plus a Redis for sessions (see _compose.yaml_). If you
configure credentials via **Settings** in the bot instead of env vars, the
compose's `bot_data` volume keeps them across upgrades.

### Docker with your own Redis

The image runs the bot directly from TypeScript source with Bun — there is no
build step or `dist/` bundle. Point `REDIS_URL` at a Redis the container can
reach:

```shell
docker run \
  --init --name firefly-bot --restart unless-stopped \
  --env BOT_TOKEN=<your-bot-token> \
  --env REDIS_URL=redis://<your-redis>:6379 \
  -v firefly-bot-data:/app/data \
  ghcr.io/cyxou/firefly-iii-telegram-bot:v3
```

`--restart unless-stopped` matters: the bot exits at startup when Redis is
unreachable, so without a restart policy a transient Redis outage (or a host
reboot) leaves the bot down until restarted by hand.

You may also provide the environment via an `--env-file .env` built from
_.example.env_.

Once the bot is running, navigate to its **Settings** and provide all the
necessary information to connect it to your Firefly III instance (unless
pre-configured via env vars).

### Manual

For this you need to have [Bun](https://bun.sh) ≥ 1 installed.

 - Clone the repository
 - Install dependencies by running `bun install`
 - Run `export BOT_TOKEN=<your-bot-token>`
 - Start a Redis reachable at `redis://localhost:6379`, or point
   `export REDIS_URL=...` at one you already run — v3 stores sessions in
   Redis and exits at startup if it's unreachable
 - (Optional) Restrict access: `export ALLOWED_TG_USER_IDS=123456,987654321`
   - If not set, the bot will respond to all users.
 - Run `bun run start`

If you'll have certificate errors when trying to connect to Firefly III instance,
stop the bot, do `export NODE_TLS_REJECT_UNAUTHORIZED=0` in your shell and start the
bot.

## Access Control & Security

### Restricting Access to Specific Users

You can restrict who can use your bot by setting the `ALLOWED_TG_USER_IDS` environment variable to a comma-separated list of allowed Telegram user IDs. Only users whose IDs are in this list will be able to interact with the bot. If `ALLOWED_TG_USER_IDS` is not set, the bot will respond to all users.

Example with restricted access:
```shell
docker run \
  --init --name firefly-bot --restart unless-stopped \
  --env BOT_TOKEN=<your-bot-token> \
  --env ALLOWED_TG_USER_IDS=123456,987654321 \
  --env REDIS_URL=redis://<your-redis>:6379 \
  ghcr.io/cyxou/firefly-iii-telegram-bot:v3
```

### Logging Unauthorized Access Attempts

By default, if an unauthorized user tries to use the bot, a log message will be printed to the console with their Telegram ID and a hint to add it to the allowed list. This helps admins quickly identify and authorize new users.

To disable this logging, set:
```
DISABLE_UNAUTHORIZED_USER_LOG=true
```

## Development

```shell
bun install           # install dependencies
bun run dev           # run with watch-reload
bunx tsc --noEmit     # typecheck
bun run lint          # ESLint (bun run fix to auto-fix)
bunx vitest run       # unit + integration tests
docker compose -f docker-compose.tests.yaml up -d   # ephemeral Redis for e2e
bun run test:e2e      # e2e (real Redis, Telegram still mocked)
docker compose -f compose.firefly.yaml up -d        # local Firefly III + MariaDB (dev)
```

To build docker images you would need to install additional tools and packages.
 - Docker
 - Earthly
 - QEMU for building multi platform docker images.

On linux, QEMU needs to be installed manually. On Ubuntu, this can be achieved by running:
```shell
sudo apt-get install qemu binfmt-support qemu-user-static
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
docker stop earthly-buildkitd || true
```
More info [here](https://docs.earthly.dev/docs/guides/multi-platform).

## TODO
- [x] Add English translations and make it a default language
- [x] Add transactions improvements (create transfers and deposits)
- [x] Edit transactions
- [x] Localization based on Firefly user's preferences
- [x] Accounts management
- [x] List transactions
- [x] Add math equations when creating transactions
- [x] Allow selecting of Liabilities accounts in transactions
- [x] Configure CI/CD so that it builds and pushes docker images on merges to master
- [x] Reports
- [ ] Proper error handling
- [ ] Firefly API tests
- [x] Add JSON database for persistence (used @grammyjs/storage-file)
- [x] Add date picker when editing transaction (adopt https://github.com/VDS13/telegram-inline-calendar)
- [x] Migrate from home grown Mapper to Grammy's Menu plugin (partially done)
- [ ] Add tags support

## Open API Code Generation

### Preface

This thing is used to generate typescript-axios client code for the Firefly III API
published [here](https://api-docs.firefly-iii.org)

There is an issue with Configuration model: the generated code has its own
`Configuration` thing that corresponds to axios configuration. Firefly also has
`Configuration` endpoint and corresponding models which upon code generation produce
compiler errors due to ambiguity and to naming collision.
In order to solve this issue, I've just ignored the Firefly Configuration API
generation by adding the __api/configuration-api.ts__ file to
__.openapi-generator-ignore__ file and customizing the __./src/lib/firefly/api.ts__
file, which also had to be referenced in the __.openapi-generator-ignore__.

### How to generate a client code

There is a corresponding task for it in the __package.json__ file: `codegen`.
Hence the command is `bun run codegen`. Running this command should not introduce
any git changes unless you want to rollback or update the API specification URL
which is hard-coded in `codegen` npm task.

## Known bugs and limitations
 - No support for multiple transaction splits. It is assumed that transactions
   consist of only one transaction split.
 - Looks like for a brand new user account the built-in "(cash)" account is
   created upon first creation of a transaction via the Firefly UI. Until that
   built-in "(cash)" account is created, the default Expense account will be an
   account without a name which is weird.
 - Do not try to edit multiple transactions at once, because of the shared state of
   the transaction under edit. Doing so will result in unexpected behavior.

## Feedback
Please join our Telegram group - any feedback is very appreciated!

[![Telegram Group](https://img.shields.io/badge/Support%20Group-white?logo=telegram)](https://t.me/firefly_iii_telegram_bot_group)

## Contributors
<a href="https://github.com/cyxou/firefly-iii-telegram-bot/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=cyxou/firefly-iii-telegram-bot" />
</a>

[contrib.rocks](https://contrib.rocks).
