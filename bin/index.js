#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateRecords, validateSchema } from '../generator.js';
import { toCsv, toJson, toSql } from '../formatters.js';

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

const FORMATS = new Set(['json', 'csv', 'sql']);

function printHelp() {
  console.log(`mcraft — mock data from a JSON field-type schema

Usage:
  mcraft generate -s <schema.json> [options]

Options:
  -s, --schema <path>   Path to JSON schema file (required)
  -f, --format <type>    Output format: json, csv, sql (default: json)
  -c, --count <number>  Number of records (default: 10)
  -o, --output <path>   Write to file instead of stdout
  -t, --table <name>    SQL table name (default: mock_data)
  -h, --help            Show this help

Example:
  mcraft generate -s schema.example.json -f csv -c 100 -o users.csv
`);
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
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });
    values = parsed.values;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorExit(`CLI: ${msg}\nRun with --help for usage.`);
  }

  if (values.help) {
    printHelp();
    return;
  }

  if (!values.schema) {
    errorExit('Missing required option: -s, --schema <path>');
  }

  try {
    const format = String(values.format).toLowerCase();
    if (!FORMATS.has(format)) {
      errorExit(`Unknown format ${JSON.stringify(values.format)}. Use json, csv, or sql.`);
    }

    const count = parsePositiveInt(values.count, '--count');
    const schemaPath = resolve(values.schema);

    let raw;
    try {
      raw = readFileSync(schemaPath, 'utf8');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
      if (code === 'ENOENT') {
        errorExit(`Schema file not found: ${schemaPath}`);
      }
      throw err;
    }

    let schema;
    try {
      schema = JSON.parse(raw);
    } catch {
      errorExit(`Invalid JSON in schema file: ${schemaPath}`);
    }

    validateSchema(schema);
    const records = generateRecords(schema, count);

    let output;
    if (format === 'json') {
      output = toJson(records, schema);
    } else if (format === 'csv') {
      output = toCsv(records, schema);
    } else {
      output = toSql(records, schema, values.table);
    }

    if (values.output) {
      const outPath = resolve(values.output);
      writeFileSync(outPath, output, 'utf8');
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

const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
  printHelp();
  process.exit(argv.length === 0 ? 1 : 0);
}

if (argv[0] !== 'generate') {
  errorExit(`Unknown command: ${JSON.stringify(argv[0])}. Use: generate`);
}

runGenerate();
