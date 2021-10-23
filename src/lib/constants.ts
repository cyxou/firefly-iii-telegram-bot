import dayjs from 'dayjs'
import { Keyboard } from 'grammy'

import { TransactionSplit } from '../lib/firefly/model/transaction-split'

export const command = {
  START:    'start',
  SETTINGS: 'settings',
  HELP:     'help',
}

export const commandDescription = {
  [command.START]:    'Старт (приветственное сообщение)',
  [command.SETTINGS]: 'Настройки',
  [command.HELP]:     'Помощь'
}

export const keyboardButton = {
  ACCOUNTS:                     '💳 Счета',
  CANCEL:                       '✖ Отмена',
  CATEGORIES:                   '🔖 Категории',
  // CLASSIFICATION:               '🏷️  Классификация',
  DEFAULT_ASSET_ACCOUNT_BUTTON: '💳 Счет по умолчанию',
  DELETE:                       '❌ Удалить',
  DONE:                         '✅ Готово',
  CLOSE:                        '🔙 Назад',
  FIREFLY_ACCESS_TOKEN_BUTTON:  '🔑 Access Token',
  FIREFLY_URL_BUTTON:           '🌐 Firefly URL',
  MODIFY_DATE:                  '📆 Уточнить дату',
  REPORTS:                      '📈 Отчеты',
  SETTINGS:                     '🔧 Настройки',
  TEST_CONNECTION:              '🔌 Проверка соединения',
  TRANSACTIONS:                 '🔀 Транзакции',
  LIST_CATEGORIES:              '🔖 Категории',
  ADD_CATEGORIES:               '➕ Добавить категории',
  RENAME_CATEGORY:              '✏️ Переименовать',
  LIST_TAGS:                    '🏷️  Тэг',
  YES:                          '✅ Да',
  DECLINE_CATEGORIES_LIST:      '✏️ Нет, ввести заново',
  TO_DEPOSITS:                  '📥 К доходам',
  TO_TRANSFERS:                 '🔀 К переводам'
}

export const mainKeyboard = new Keyboard()
  .text(keyboardButton.TRANSACTIONS).text(keyboardButton.ACCOUNTS).row()
  // .text(keyboardButton.CLASSIFICATION).text(keyboardButton.REPORTS).row()
  .text(keyboardButton.CATEGORIES).text(keyboardButton.REPORTS).row()
  .text(keyboardButton.SETTINGS)

export const text = {
  welcome: `👋 Привет! Это бот для быстрого создания транзакций в Firefly III.

Для работы с ботом необходимо указать *URL-адрес* сайта Firefly III, а также *Access Token*, созданный в веб-интерфейсе Firefly.

Загляните в *${keyboardButton.SETTINGS}* для продолжения работы.`,
  help: `❕ Для добавления транзакции, отправьте боту сумму списания (число). Далее бот предложит выбрать счет и категорию списания, а также дополнительные параметры транзакции.

\`Кафе 35\`
В этом случае будет создана транзакция списания со счета по умолчанию в размере "35" с названием "Кафе".

✨ Для гибкой настройки создания транзакций, рекомендуется настроить *Правила* в соответствующем разделе Firefly.`,
  whatDoYouWantToChange: (fireflyUrl: string, accessToken: string, defaultAssetAccount: string): string => `🔧 *Настройки*

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
  defaultAssetAccountSet: 'Счет по умолчанию установлен!',
  addUrlAndAccessToken: `Для работы с ботом необходимо указать *${keyboardButton.FIREFLY_URL_BUTTON}* и *${keyboardButton.FIREFLY_ACCESS_TOKEN_BUTTON}* в разделе *${keyboardButton.SETTINGS}* бота`,
  specifySmthFirst: (smth: string) => `Сперва укажите ${smth}`,
  connectionFailed: 'Соединение НЕ установлено!',
  connectionSuccess: (email: string): string => `Соединение установлено!\nПривет, ${email}!`,
  dontUnderstand: `🤖Я пока такое не понимаю!
Введите сумму транзакции, это должно быть число! 😉`,
  badAccessToken: `Введеный текст не похож на Access Token. Попробуйте еще раз, пожалуйста:`,
  badUrl: `Введеный текст не похож на URL. Проверьте, возможно опечатались.
Введите URL адрес вашего сервера Firefly III, например https://firefly.example.com:`,
  classificationChangeText: 'Что вы хотите настроить?',
  inWhatCategoryToAdd: (amount: string) => `В какую категорию добавить *${amount}*?`,
  inWhatAccountToAdd: (amount: string) => `На какой счет добавить *${amount}*?`,
  couldNotDeleteTransaction: (id: number) => `Не удалось удалить транзакцию по id: ${id}`,
  transactionDeleted: 'Транзакция удалена!',
  withdrawalAddedMessage: (tr: TransactionSplit) => `
Добавлено ${tr.description === 'N/A' ? '' : '*' + tr.description + '* '}*${parseFloat(tr.amount)}* *${tr.currency_symbol}*${tr.category_name ? ' в категорию *' + tr.category_name + '*' : ''}
${dayjs(tr.date).format('DD MMM YYYY г.')}`,
  depositAddedMessage: (tr: TransactionSplit) => `
Добавлено ${tr.description === 'N/A' ? '' : '*' + tr.description + '* '}*${parseFloat(tr.amount)}* *${tr.currency_symbol}* на счет *${tr.destination_name}*`,
  listCategories: function (categories: string[]): string {
    if (categories.length === 0) return 'Список ваших категорий расходов пуст.'
    else return `Для просмотра расходов по категории, выберите ее из списка ниже.
Там же вы сможете переименовать или удалить категорию.`
  },
  enterCategories: `Введите названия категорий ваших расходов, так чтобы каждая отдельная категория была с новой строки, например:

💡 Коммуналка
👕 Одежда и обувь
🥦 Продукты

*P.S.*: Названия категорий расходов в дальнейшем можно будет изменить.
*P.P.S.*: Ничего страшного, если категория с таким именем уже существует.`,
  selectCategoryToRename: 'Выберите категорию, которую хотите переименовать:',
  selectCategoryToDelete: 'Выберите категорию, которую хотите удалить:',
  typeNewCategoryName: `Введите новое имя для категории:`,
  categoryDetails: (name: string): string => `Данные по категории *${name}*:`,
  confirmToDeleteCategory: `Уверены, что хотите удалить эту категорию? Соответствующие транзакции при этом удалены не будут. Их можно будет найти в разделе ${keyboardButton.TRANSACTIONS}`,
  categoryDeleted: 'Категория удалена!',
  categoryTransactions: (categoryName: string, monthName: string, transactions: string, sums: any[]): string => `Список транзакций категории <b>${categoryName}</b> за <b>${monthName}</b>:\n
<pre>${transactions}
──────────────────
ИТОГО: ${sums.map((sum: any) => `${Math.abs(sum.value)} ${sum.currency}`).join('\n       ')} </pre>
`,
  noTransactions: 'Транзакций не было'
}
