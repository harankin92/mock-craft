# mock-craft v2

**mcraft** is a zero-dependency Node.js CLI that generates mock rows as **JSON**, **CSV**, or **SQL** from a JSON schema.  
Supports **shorthand** (`"field": "uuid"`) and **rich configs** (`"field": { "type": "number", "min": 1, "max": 10 }`), plus **nested `object` / `array`**, **`template`** placeholders, and safe export of nested values as **JSON strings** in CSV/SQL.

**Repository:** [github.com/harankin92/mock-craft](https://github.com/harankin92/mock-craft)

## Requirements

- Node.js **18+**

## Install

```bash
npm install -g mock-craft
```

Project-local:

```bash
npm install mock-craft
npx mcraft generate -s schema.json
```

## CLI usage

```bash
mcraft generate -s <schema.json> [options]
```

| Option | Description |
|--------|-------------|
| `-s, --schema <path>` | Schema file (**required**) |
| `-f, --format <type>` | `json` (default), `csv`, `sql` |
| `-c, --count <n>` | Row count (default: `10`) |
| `-o, --output <path>` | Output file (default: stdout) |
| `-t, --table <name>` | SQL table name (default: `mock_data`) |

### Examples

```bash
mcraft generate -s schema.example.json -f csv -c 100 -o users.csv
mcraft generate -s schema.advanced.example.json -f json -c 5
```

---

## Schema format

Top-level schema is an object: **key → shorthand string** or **key → config object** with at least `{ "type": "..." }`.

### Shorthand (v1-compatible)

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

### Field types

| Type | Description | Parameters |
|------|-------------|------------|
| `uuid` | UUID v4 | — |
| `name` | Full name | — |
| `email` | Email (uses preceding `name` in same object when possible) | — |
| `date` | ISO datetime in the past (~1–5 years) | — |
| `address` | Street line | — |
| `number` | Integer | `min` (default `1`), `max` (default `1000`) |
| `float` | Decimal | `min` (default `0`), `max` (default `100`), `fixed` decimals (default `2`) |
| `boolean` | `true` / `false` | — |
| `enum` | Random pick | **`values`** (required array) |
| `phone` | `+XXX-XXX-XXXX` | — |
| `text` | Lorem-style words | `words` (default `10`) |
| `template` | String with `{{placeholders}}` | **`format`** (required). For `{{enum}}`: **`enum_values`** or **`values`** |
| `object` | Nested object | **`properties`** (required object of nested fields) |
| `array` | Array | **`items`** (required nested config). Optional `minItems` (default `1`), `maxItems` (default `5`) |

**Recursion guard:** nesting via `object` / `array` is limited to **5 levels** (throws if exceeded).

### Template placeholders

Inside `format`, use `{{tag}}`. Supported tags:

`uuid`, `number`, `float`, `boolean`, `enum`, `phone`, `text`, `name`, `email`, `date`, `address`

- `{{enum}}` requires `enum_values` or `values` on the **same** template config.

Example:

```json
{
  "sku": {
    "type": "template",
    "format": "SKU-{{number}}-{{enum}}-{{uuid}}",
    "enum_values": ["A", "B"]
  }
}
```

### Nested example

```json
{
  "user": {
    "type": "object",
    "properties": {
      "id": "uuid",
      "tags": {
        "type": "array",
        "items": { "type": "enum", "values": ["x", "y"] },
        "minItems": 1,
        "maxItems": 3
      }
    }
  }
}
```

See **`schema.advanced.example.json`** in the repo.

---

## CSV / SQL and nested values

Top-level columns are still **flat keys** from the schema. If a cell value is an **object** or **array**, it is exported as **`JSON.stringify(...)`**:

- **CSV:** JSON text is quoted and RFC 4180–escaped inside `"..."`.
- **SQL:** JSON text is wrapped in single quotes with SQL escaping (`'` → `''`).  
**Primitives:** numbers unquoted; booleans as `TRUE`/`FALSE`; strings quoted.

---

## Development

```bash
git clone https://github.com/harankin92/mock-craft.git
cd mock-craft
node bin/index.js generate -s schema.advanced.example.json -c 2 -f json
```

---

## License

MIT
