# mock-craft

**mcraft** is a zero-dependency CLI that generates mock data as **JSON**, **CSV**, or **SQL** from a simple JSON map: field name → type. Requires **Node.js 18+**.

**Repository:** [github.com/harankin92/mock-craft](https://github.com/harankin92/mock-craft)

## Install

Global:

```bash
npm install -g mock-craft
```

In a project:

```bash
npm install mock-craft
npx mcraft generate -s schema.json
```

## Usage

```bash
mcraft generate -s <schema.json> [options]
```

| Option | Description |
|--------|-------------|
| `-s, --schema <path>` | Path to the JSON schema (**required**) |
| `-f, --format <type>` | `json` (default), `csv`, or `sql` |
| `-c, --count <n>` | Number of records (default: `10`) |
| `-o, --output <path>` | Write to file; omit for stdout |
| `-t, --table <name>` | SQL table name (default: `mock_data`) |

### Example

```bash
mcraft generate -s schema.example.json -f csv -c 100 -o users.csv
```

## Schema

A plain object: each key is a field name; each value is one of: `uuid`, `name`, `email`, `date`, `number`, `address`.

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

See `schema.example.json` in this repo.

## Development

```bash
git clone https://github.com/harankin92/mock-craft.git
cd mock-craft
node bin/index.js generate -s schema.example.json -c 3 -f json
```

## License

MIT
