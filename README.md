# mock-craft v3

**mcraft** is a zero-dependency Node.js CLI for **deterministic** mock data and a tiny **HTTP mock API**. No npm runtime dependencies — only Node.js built-ins (`http`, `crypto`, `fs`, `util`, …).

**Repository:** [github.com/harankin92/mock-craft](https://github.com/harankin92/mock-craft)

## Requirements

- Node.js **18+**

## Install

```bash
npm install -g mock-craft
```

```bash
npm install mock-craft
npx mcraft generate -s schema.json
```

---

## Commands

### `generate` — file or stdout

```bash
mcraft generate -s <schema.json> [options]
```

| Option | Description |
|--------|-------------|
| `-s, --schema <path>` | Schema JSON (**required**) |
| `-f, --format <type>` | `json` (default), `csv`, `sql` |
| `-c, --count <n>` | Rows (default `10`; per collection when using `_collections`) |
| `-o, --output <path>` | Write to file instead of stdout |
| `-t, --table <name>` | SQL table name for **flat** schemas (default `mock_data`) |
| `--seed <string>` | **Deterministic** output (same seed → same JSON/SQL rows) |
| `--types <path>` | Emit **TypeScript interfaces** inferred from the schema |

**Note:** Schemas with **`_collections`** support **JSON** and **SQL** only (not CSV — single-table CSV does not fit multiple entity sets).

### `serve` — in-memory HTTP API

```bash
mcraft serve -s <schema.json> [options]
```

| Option | Description |
|--------|-------------|
| `-s, --schema <path>` | Schema (**required**) |
| `-c, --count <n>` | Rows loaded into memory at startup (default `10`) |
| `--port <n>` | Port (default `3000`) |
| `--seed <string>` | Same reproducibility as `generate` |

Data is generated **once** at startup and kept in memory.

**Endpoints**

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/api/data` | Full payload: flat schemas wrap rows as `{ "records": [...] }`; `_collections` returns `{ "users": [...], ... }`. |
| GET | `/api/<collection>?limit=N` | Only when `_collections` exists — returns one array; optional `limit` truncates. |

Each request logs a line such as: `[GET] /api/users - 200 OK (2ms)`.

---

## Deterministic seed (`--seed`)

`Math.random()` is **not** seedable. **mock-craft v3** uses a **Mulberry32** PRNG fed by **SHA-256** of your seed string. Identical schema + count + seed ⇒ identical output (including UUID-shaped ids).

Dates use a **fixed reference instant** (not `Date.now()`), so `date` fields are reproducible under the same seed.

---

## Nullability (`nullChance`)

Any field config may set **`nullChance`** ∈ `[0, 1]`. Before generating a value, the PRNG may short-circuit and return **`null`** for that field (including `object` / `array` roots).

---

## Multi-schema (`_collections` + `ref`)

If the schema root contains **`_collections`**, each key is a **named collection** (table-like). Collections are generated **in declaration order**; **`ref`** picks a random row from an **earlier** collection and reads a field value.

Example (`schema.collections.example.json`):

```json
{
  "_collections": {
    "users": { "id": "uuid", "name": "name", "email": "email" },
    "posts": {
      "id": "uuid",
      "title": { "type": "text", "words": 5 },
      "authorId": {
        "type": "ref",
        "collection": "users",
        "field": "id",
        "nullChance": 0.05
      }
    }
  }
}
```

Rules:

- **`ref.collection`** must appear **before** the current collection in `_collections` key order.
- SQL export emits **`INSERT`** statements into tables named after collection keys.

---

## Flat schema (v2 features preserved)

Shorthand still works:

```json
{
  "id": "uuid",
  "fullName": "name",
  "contactEmail": "email",
  "age": { "type": "number", "min": 1, "max": 120 },
  "createdAt": "date",
  "deliveryAddress": "address"
}
```

Rich configs support **`object`**, **`array`**, **`template`** (`{{uuid}}`, `{{number}}`, …), **`enum`**, **`float`**, **`boolean`**, **`phone`**, **`text`**, **`number`** bounds, nesting depth limit **5**.

See **`schema.advanced.example.json`**.

---

## TypeScript export (`--types`)

Pass **`--types ./path/to/file.ts`**. The CLI walks the schema and writes interfaces:

| Schema kind | TS mapping |
|-------------|------------|
| `uuid`, `name`, `email`, `phone`, `text`, `template`, `date`, `address` | `string` |
| `number`, `float` | `number` |
| `boolean` | `boolean` |
| `enum` | union of literal values |
| `object` | inline `{ ... }` |
| `array` | `T[]` |
| `ref` | resolved from referenced collection field |
| `nullChance > 0` | `\| null` |

Collections emit one `export interface …Row` per collection.

---

## CSV / SQL / nested JSON cells

Nested objects or arrays in a cell are exported as **`JSON.stringify`** strings with proper quoting (CSV `"`, SQL `'…'`).

---

## Examples

```bash
mcraft generate -s schema.example.json --seed demo -c 5 -f json
mcraft generate -s schema.collections.example.json -f sql -c 20 -o seed.sql
mcraft generate -s schema.example.json --types ./src/mock-types.ts
mcraft serve -s schema.collections.example.json --port 3000 --seed local
```

---

## Development

```bash
git clone https://github.com/harankin92/mock-craft.git
cd mock-craft
node bin/index.js generate -s schema.collections.example.json --seed x -f json -c 2
```

---

## License

MIT
