[![License][license-shield]][license-url]
[![Stargazers][stars-shield]][stars-url]

# Firefly III Telegram Bot

## Development

To build docker images you would need to install additional tools and packages.
 - Docker
 - Earthly
 - Some other tools for building multi platform docker images.

 On linux, QEMU needs to be installed manually. On Ubuntu, this can be achieved by running:
```shell
sudo apt-get install qemu binfmt-support qemu-user-static
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
docker stop earthly-buildkitd || true
```

## TODO
- [ ] Add English translations and make it a default language
- [x] Add transactions improvements (create transfers and deposits)
- [x] Edit transactions (no date change thus far)
- [x] Localization based on Firefly user's preferences
- [x] Accounts management
- [x] List transactions
- [ ] Reports
- [ ] Proper error handling
- [x] Add math equations when creating transactions
- [ ] Add tests
- [ ] Add [lowdb](https://github.com/typicode/lowdb) as local JSON database for persistance
- [ ] Add date picker when editing transaction (adopt https://github.com/gianlucaparadise/telegraf-calendar-telegram)
- [ ] Migrate from home grown Mapper to Grammy's Menu plugin

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

### Known bugs and limitations
 - No support for multiple transaction splits. It is assumed that transactions
     consist of only one transaction split.


[license-url]: https://www.gnu.org/licenses/agpl-3.0.html
[stars-url]: https://github.com/cyxou/firefly-iii-telegram-bot/stargazers
