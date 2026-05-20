# mock-craft

CLI **mcraft** — генерация моковых данных (JSON, CSV, SQL) из простой JSON-схемы: ключ → тип поля. Без внешних зависимостей, Node.js 18+.

**Репозиторий:** [github.com/harankin92/mock-craft](https://github.com/harankin92/mock-craft)

## Установка

```bash
npm install -g mock-craft
```

Локально в проекте:

```bash
npm install mock-craft
npx mcraft generate -s schema.json
```

## Использование

```bash
mcraft generate -s <schema.json> [options]
```

| Опция | Описание |
|--------|----------|
| `-s, --schema <path>` | Путь к JSON-схеме (обязательно) |
| `-f, --format <type>` | `json` (по умолчанию), `csv`, `sql` |
| `-c, --count <n>` | Число записей (по умолчанию 10) |
| `-o, --output <path>` | Файл вывода; без флага — stdout |
| `-t, --table <name>` | Имя таблицы для SQL (по умолчанию `mock_data`) |

### Пример

```bash
mcraft generate -s schema.example.json -f csv -c 100 -o users.csv
```

## Схема

Объект: имя поля → один из типов: `uuid`, `name`, `email`, `date`, `number`, `address`.

```json
{
  "id": "uuid",
  "fullName": "name",
  "contactEmail": "email",
  "age": "number",
  "createdAt": "date",
  "deliveryAddress": "address"
}
```

См. `schema.example.json` в репозитории.

## Разработка

```bash
git clone https://github.com/harankin92/mock-craft.git
cd mock-craft
node bin/index.js generate -s schema.example.json -c 3 -f json
```

## Лицензия

MIT
