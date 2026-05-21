/**
 * Normalize leaf values for JSON export (Date → ISO).
 * Objects / arrays stay as structures for JSON.stringify.
 * @param {unknown} value
 */
export function serializeJsonValue(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @param {string[]} columnOrder
 */
function normalizeRecordsForColumns(records, columnOrder) {
  return records.map((record) => {
    const out = {};
    for (const key of columnOrder) {
      out[key] = serializeJsonValue(record[key]);
    }
    return out;
  });
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @param {Record<string, unknown>} schema
 */
export function toJson(records, schema) {
  const columns = Object.keys(schema);
  const normalized = normalizeRecordsForColumns(records, columns);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/**
 * Escape CSV field per RFC 4180: wrap in ", double internal quotes.
 * Objects and arrays become JSON.stringify output first.
 * @param {unknown} value
 */
export function escapeCsvField(value) {
  let cell = value;
  if (cell !== null && typeof cell === 'object') {
    cell = JSON.stringify(cell);
  }
  const str = cell === null || cell === undefined ? '' : String(cell);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @param {Record<string, unknown>} schema
 */
export function toCsv(records, schema) {
  const columns = Object.keys(schema);
  const normalized = normalizeRecordsForColumns(records, columns);
  const header = columns.map(escapeCsvField).join(',');
  const lines = [header];

  for (const row of normalized) {
    lines.push(columns.map((col) => escapeCsvField(row[col])).join(','));
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Escape single-quoted SQL string literal.
 * @param {string} value
 */
export function escapeSqlString(value) {
  return value.replace(/'/g, "''");
}

/**
 * Quote SQL identifier minimally (alphanumeric and underscore).
 * @param {string} name
 */
function quoteSqlIdentifier(name) {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return name;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Format one SQL VALUES literal from a JS value (nested objects/arrays → quoted JSON).
 * @param {unknown} val
 */
export function sqlFormatScalar(val) {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
  if (typeof val === 'object') {
    const json = JSON.stringify(val);
    return `'${escapeSqlString(json)}'`;
  }
  const asString = String(val);
  return `'${escapeSqlString(asString)}'`;
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @param {Record<string, unknown>} schema
 * @param {string} tableName
 */
export function toSql(records, schema, tableName) {
  const columns = Object.keys(schema);
  const normalized = normalizeRecordsForColumns(records, columns);
  const quotedTable = quoteSqlIdentifier(tableName);
  const quotedCols = columns.map(quoteSqlIdentifier).join(', ');
  const statements = [];

  for (const row of normalized) {
    const values = columns.map((col) => sqlFormatScalar(row[col]));
    statements.push(`INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${values.join(', ')});`);
  }

  return `${statements.join('\n')}\n`;
}
