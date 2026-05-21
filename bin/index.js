#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  generateCollectionsBundle,
  generateRecords,
  isCollectionsSchema,
  validateSchema,
} from '../generator.js';
import { toCsv, toJson, toJsonCollections, toSql, toSqlCollections } from '../formatters.js';
import { emitTypeScriptFromSchema } from '../lib/ts-exporter.js';
import { startMockServer } from '../server.js';

const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function errorExit(message) {
  console.error(`${RED}${message}${RESET}`);
  process.exit(1);
}

function parsePositiveInt(value, flagName) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) {
    errorExit(`${flagName} must be a positive integer (got ${JSON.stringify(value)}).`);
  }
  return n;
}

function parsePort(value) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    errorExit(`--port must be 1–65535 (got ${JSON.stringify(value)}).`);
  }
  return n;
}

const FORMATS = new Set(['json', 'csv', 'sql']);

function printHelp() {
  console.log(`mcraft — mock data CLI (v3)

Commands:
  mcraft generate -s <schema.json> [options]
  mcraft serve   -s <schema.json> [options]

generate options:
  -s, --schema <path>    Schema JSON (required)
  -f, --format <type>    json | csv | sql (default: json)
  -c, --count <n>        Rows per collection / flat table (default: 10)
  -o, --output <path>    Write output instead of stdout
  -t, --table <name>     SQL table for flat schema (default: mock_data)
      --seed <string>    Deterministic PRNG seed (same seed → same output)
      --types <path>     Write generated TypeScript interfaces to file
  -h, --help             Help

serve options:
  -s, --schema <path>    Schema JSON (required)
  -c, --count <n>        Rows (default: 10)
      --port <n>         Port (default: 3000)
      --seed <string>    Same seed as generate for reproducible payloads

Examples:
  mcraft generate -s schema.example.json -f csv -c 100 -o users.csv
  mcraft generate -s schema.collections.example.json --seed demo -f json
  mcraft generate -s schema.example.json --types ./types/mock.ts
  mcraft serve -s schema.collections.example.json --port 3000 --seed demo
`);
}

function loadSchema(schemaPath) {
  const resolved = resolve(schemaPath);
  let raw;
  try {
    raw = readFileSync(resolved, 'utf8');
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
    if (code === 'ENOENT') {
      errorExit(`Schema file not found: ${resolved}`);
    }
    throw err;
  }

  let schema;
  try {
    schema = JSON.parse(raw);
  } catch {
    errorExit(`Invalid JSON in schema file: ${resolved}`);
  }

  return schema;
}

function runGenerate() {
  let values;
  try {
    const parsed = parseArgs({
      args: process.argv.slice(3),
      allowPositionals: false,
      options: {
        schema: { type: 'string', short: 's' },
        format: { type: 'string', short: 'f', default: 'json' },
        count: { type: 'string', short: 'c', default: '10' },
        output: { type: 'string', short: 'o' },
        table: { type: 'string', short: 't', default: 'mock_data' },
        seed: { type: 'string' },
        types: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });
    values = parsed.values;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorExit(`CLI: ${msg}\nRun mcraft --help for usage.`);
  }

  if (values.help) {
    printHelp();
    return;
  }

  if (!values.schema) {
    errorExit('Missing required option: -s, --schema <path>');
  }

  try {
    const schema = loadSchema(values.schema);
    validateSchema(schema);

    const format = String(values.format).toLowerCase();
    if (!FORMATS.has(format)) {
      errorExit(`Unknown format ${JSON.stringify(values.format)}. Use json, csv, or sql.`);
    }

    const count = parsePositiveInt(values.count, '--count');
    const seed = values.seed !== undefined ? values.seed : undefined;
    const genOpts = seed !== undefined ? { seed } : {};

    if (values.types) {
      const tsPath = resolve(values.types);
      const tsSource = emitTypeScriptFromSchema(schema);
      writeFileSync(tsPath, tsSource, 'utf8');
    }

    /** @type {string} */
    let output;

    if (isCollectionsSchema(schema)) {
      if (format === 'csv') {
        errorExit('Schemas with "_collections" do not support CSV export. Use JSON or SQL.');
      }
      const bundle = generateCollectionsBundle(schema, count, genOpts);
      output = format === 'sql' ? toSqlCollections(bundle) : toJsonCollections(bundle);
    } else {
      const records = generateRecords(schema, count, genOpts);
      if (format === 'json') {
        output = toJson(records, schema);
      } else if (format === 'csv') {
        output = toCsv(records, schema);
      } else {
        output = toSql(records, schema, values.table);
      }
    }

    if (values.output) {
      writeFileSync(resolve(values.output), output, 'utf8');
    } else {
      process.stdout.write(output);
    }
  } catch (err) {
    if (err instanceof Error && err.message) {
      errorExit(err.message);
    }
    throw err;
  }
}

function runServe() {
  let values;
  try {
    const parsed = parseArgs({
      args: process.argv.slice(3),
      allowPositionals: false,
      options: {
        schema: { type: 'string', short: 's' },
        count: { type: 'string', short: 'c', default: '10' },
        port: { type: 'string', default: '3000' },
        seed: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });
    values = parsed.values;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorExit(`CLI: ${msg}\nRun mcraft --help for usage.`);
  }

  if (values.help) {
    printHelp();
    return;
  }

  if (!values.schema) {
    errorExit('Missing required option: -s, --schema <path>');
  }

  try {
    const schema = loadSchema(values.schema);
    validateSchema(schema);
    const count = parsePositiveInt(values.count, '--count');
    const port = parsePort(values.port);
    const seed = values.seed !== undefined ? values.seed : undefined;

    startMockServer({ schema, count, seed, port });
  } catch (err) {
    if (err instanceof Error && err.message) {
      errorExit(err.message);
    }
    throw err;
  }
}

const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
  printHelp();
  process.exit(argv.length === 0 ? 1 : 0);
}

const command = argv[0];

if (command === 'generate') {
  runGenerate();
} else if (command === 'serve') {
  runServe();
} else {
  errorExit(`Unknown command: ${JSON.stringify(command)}. Use: generate | serve`);
}
