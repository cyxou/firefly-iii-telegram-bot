[![License][license-shield]][license-url]
[![Stargazers][stars-shield]][stars-url]

# Firefly III Telegram Bot

## Development

To build docker images you would need to install additional toos and packages.
 - Docker
 - Earthly
 - Some other tools for building multiplatform docker images.

 On linux, QEMU needs to be installed manually. On Ubuntu, this can be achieved by running:
```shell
sudo apt-get install qemu binfmt-support qemu-user-static
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
docker stop earthly-buildkitd || true
```

[license-url]: https://www.gnu.org/licenses/agpl-3.0.html
[stars-url]: https://github.com/cyxou/firefly-iii-telegram-bot/stargazers
