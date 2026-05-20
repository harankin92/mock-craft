/**
 * Normalize record values for serialization (Date -> ISO string).
 * @param {Array<Record<string, unknown>>} records
 * @param {string[]} columnOrder
 * @returns {Array<Record<string, unknown>>}
 */
function normalizeRecords(records, columnOrder) {
  return records.map((record) => {
    const out = {};
    for (const key of columnOrder) {
      const value = record[key];
      out[key] = value instanceof Date ? value.toISOString() : value;
    }
    return out;
  });
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @param {Record<string, string>} schema
 */
export function toJson(records, schema) {
  const columns = Object.keys(schema);
  const normalized = normalizeRecords(records, columns);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/**
 * Escape CSV field per RFC 4180: wrap in ", double internal quotes.
 * @param {unknown} value
 */
export function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @param {Record<string, string>} schema
 */
export function toCsv(records, schema) {
  const columns = Object.keys(schema);
  const normalized = normalizeRecords(records, columns);
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
 * @param {Array<Record<string, unknown>>} records
 * @param {Record<string, string>} schema
 * @param {string} tableName
 */
export function toSql(records, schema, tableName) {
  const columns = Object.keys(schema);
  const normalized = normalizeRecords(records, columns);
  const quotedTable = quoteSqlIdentifier(tableName);
  const quotedCols = columns.map(quoteSqlIdentifier).join(', ');
  const statements = [];

  for (const row of normalized) {
    const values = columns.map((col) => {
      const val = row[col];
      const type = schema[col];

      if (type === 'number' && typeof val === 'number' && Number.isFinite(val)) {
        return String(val);
      }

      const asString = val === null || val === undefined ? '' : String(val);
      return `'${escapeSqlString(asString)}'`;
    });

    statements.push(`INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${values.join(', ')});`);
  }

  return `${statements.join('\n')}\n`;
}
