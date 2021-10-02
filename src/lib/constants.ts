import { Markup } from 'telegraf'

export const command = {
  START: '/start',
  SETTINGS: '/settings',
  HELP: '/help',
}

export const commandDescription = {
  [command.START]: 'Старт (приветственное сообщение)',
  [command.SETTINGS]: 'Настройки',
  [command.HELP]: 'Помощь'
}

export const scene = {
  ADD_TRANSACTION_SCENE: 'ADD_TRANSACTION',
  BOT_SETTINGS_SCENE: 'BOT_SETTINGS',
}

export const keyboardButton = {
  ACCOUNTS:                     '💳 Счета',
  CANCEL:                       '✖ Отмена',
  CLASSIFICATION:               '🏷️  Классификация',
  DEFAULT_ASSET_ACCOUNT_BUTTON: '💳 Счет по умолчанию',
  DELETE:                       '❌ Удалить',
  DONE:                         '✅ Готово',
  FIREFLY_ACCESS_TOKEN_BUTTON:  '🔑 Access Token',
  FIREFLY_URL_BUTTON:           '🌐 Firefly URL',
  MODIFY_DATE:                  '📆 Уточнить дату',
  REPORTS:                      '📈 Отчеты',
  SETTINGS:                     '🔧 Настройки',
  TEST_CONNECTION:              '🔌 Проверка соединения',
  TRANSACTIONS:                 '🔀 Транзакции',
}

export const textToSceneMap = new Map([
  // Settings
  [keyboardButton.SETTINGS, scene.BOT_SETTINGS_SCENE],
  [command.SETTINGS, scene.BOT_SETTINGS_SCENE]
  // TODO Transactions
  // TODO Reports
  // TODO Accounts
])

export const mainKeyboard = {
  ...Markup.keyboard([
    [ keyboardButton.TRANSACTIONS, keyboardButton.ACCOUNTS ],
    [ keyboardButton.CLASSIFICATION, keyboardButton.REPORTS ],
    [ keyboardButton.SETTINGS ]
  ]).oneTime().resize()
}

export const text = {
  welcome: `👋 Привет! Это бот для быстрого создания транзакций в Firefly III.

Для работы с ботом необходимо указать *URL-адрес* сайта Firefly III, а также *Access Token*, созданный в веб-интерфейсе Firefly.

Загляните в *${keyboardButton.SETTINGS}* для продолжения работы.`,
  help: `❕ Для добавления транзакции, отправьте боту сумму списания (число). Далее бот предложит выбрать счет и категорию списания, а также дополнительные параметры транзакции.

Для более быстрого создания транзакции можно воспользоваться сообщениями следующего формата, например:
\`Кафе 35\`
В этом случае будет создана транзакция списания со счета по умолчанию в размере "35" с названием "Кафе".

✨ Для гибкой настройки создания транзакций, рекомендуется настроить *Правила* в соответствующем разделе Firefly.`,
  whatDoYouWantToChange: (fireflyUrl: string, accessToken: string, defaultAssetAccount: string) => `🔧 *Настройки*

Что Вы хотите изменить?

*${keyboardButton.FIREFLY_URL_BUTTON}*: ${fireflyUrl || 'N/A'}
*${keyboardButton.FIREFLY_ACCESS_TOKEN_BUTTON}*: ${accessToken || 'N/A'}
*${keyboardButton.DEFAULT_ASSET_ACCOUNT_BUTTON}*: ${defaultAssetAccount || 'N/A'}`,
  onlyTextMessages: '‼️ Пока я понимаю только текстовые сообщения.',
  inptuFireflyUrl: `Введите URL-адрес вашего сервера Firefly III.
Он должен быть в таком же формате, как этот: *https://firefly.example.com*
или этот: *http://localhost:8080*`,
  inputFireflyAccessToken: `Введите ваш персональный Access Token.
Его можно создать и скопировать из веб-интерфейса Firefly по следующему пути:
*Параметры → Профиль → OAuth → Создать новый токен*.`,
  selectDefaultAssetAccount: `Выберите счет, с которого будут списываться деньги по умолчанию.
Если его не задать, то бот всегда будет предлагать выбрать счет при создании транзакции.  `,
  addUrlAndAccessToken: `Для работы с ботом необходимо указать *${keyboardButton.FIREFLY_URL_BUTTON}* и *${keyboardButton.FIREFLY_ACCESS_TOKEN_BUTTON}* в разделе *${keyboardButton.SETTINGS}* бота`
}
