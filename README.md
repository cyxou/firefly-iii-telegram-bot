# Firefly III Telegram Bot
This Telegram bot facilitates creating [Firefly III](https://www.firefly-iii.org/) transactions 
as well as provides some capabilities to manage other Firefly's entities like
Accounts, Categories, Reports, etc.

<h1 align="center"><img src="https://github.com/cyxou/firefly-iii-telegram-bot/blob/master/assets/bot-v2.jpeg?raw=true" alt="screenshot" align="center"/></h1>

## ⚠ Notice: Limited Firefly III Version Support

This Telegram bot is developed for use with Firefly III finance manager.
However, due to time constraints, the support for different Firefly III versions
may be limited.

Please be aware that I may not be able to promptly address issues or developments
related to all Firefly III versions. Users are encouraged to consider this while
using the bot with different versions of Firefly III.

Your understanding and cooperation are appreciated. For the best experience,
it's recommended to use this bot with supported Firefly III versions.

### Version Compatibility

- Version v2 of this bot has been tested with Firefly III v6.0.30.
- All other versions of Firefly III might not work properly with this bot.

Thank you for your understanding.


## Setup
First you'll have to [generate a Telegram Bot token through BotFather](https://core.telegram.org/bots/tutorial#obtain-your-bot-token). Once you generate the token, keep it safe.

### Docker (Recommended)

```shell
docker run \
  --rm --it --init --name firefly-bot \
  --volume `pwd`/sessions:/home/node/app/sessions \
  --env BOT_TOKEN=<your-bot-token> \
  cyxou/firefly-iii-telegram-bot:latest
```

You may also provide additional environment variables via the _.env_ file.
For this rename the _example.env_ to _.env_ and update it with your values.
Then you can pass it to docker like so:

```shell
docker run \
  --rm --it --init --name firefly-bot \
  --volume `pwd`/sessions:/home/node/app/sessions \
  --env-file .env \
  cyxou/firefly-iii-telegram-bot:latest
```

### Manual

For this you need to have NodeJS installed.

 - Clone the repository
 - Install dependencies by running `npm install`
 - Run `export BOT_TOKEN=<your-bot-token>`
 - Run `npm start`

If you'll have certificate errors when trying to connect to Firefly III instance,
stop the bot, do `export NODE_TLS_REJECT_UNAUTHORIZED=0` in your shell and start the
bot.

## Development

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
- [x] Edit transactions (no date change thus far)
- [x] Localization based on Firefly user's preferences
- [x] Accounts management
- [x] List transactions
- [x] Add math equations when creating transactions
- [x] Allow selecting of Liabilities accounts in transactions
- [x] Configure CI/CD so that it builds and pushes docker images on merges to master
- [ ] Reports
- [ ] Proper error handling
- [ ] Firefly API tests
- [x] Add JSON database for persistance (used @grammyjs/storage-file)
- [ ] Add date picker when editing transaction (adopt https://github.com/gianlucaparadise/telegraf-calendar-telegram)
- [0] Migrate from home grown Mapper to Grammy's Menu plugin (partially done)

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
Hence the command is `npm run codegen`. Running this command should not introduce
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
Join the 🔗 [Q&A Telegram group](https://t.me/firefly_iii_telegram_bot_group) if you have
any questions, feedback or ideas to implement.

## License

[license-url]: https://www.gnu.org/licenses/agpl-3.0.html
[stars-url]: https://github.com/cyxou/firefly-iii-telegram-bot/stargazers
