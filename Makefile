prerequisites:
	sudo /bin/sh -c 'wget https://github.com/earthly/earthly/releases/latest/download/earthly-linux-amd64 -O /usr/local/bin/earthly && chmod +x /usr/local/bin/earthly && /usr/local/bin/earthly bootstrap --with-autocomplete'

build:
	earthly +docker

docker-build:
	docker build -t cyxou/firefly-iii-telegram-bot

push-arm-image:
	earthly --platform=linux/arm --push +image

start:
	docker run --name firefly-iii-telegram-bot --rm -it --env-file .env cyxou/firefly-iii-telegram-bot:latest
