import http from 'node:http';
import { URL } from 'node:url';
import {
  generateCollectionsBundle,
  generateRecords,
  isCollectionsSchema,
} from './generator.js';

/**
 * @param {object} opts
 * @param {unknown} opts.schema parsed schema
 * @param {number} opts.count
 * @param {string | undefined} opts.seed
 * @param {number} opts.port
 */
export function startMockServer(opts) {
  const { schema, count, seed, port } = opts;

  /** @type {unknown} */
  let payload;

  if (isCollectionsSchema(schema)) {
    payload = generateCollectionsBundle(
      /** @type {{ _collections: Record<string, Record<string, unknown>> }} */ (schema),
      count,
      { seed }
    );
  } else {
    payload = {
      records: generateRecords(/** @type {Record<string, unknown>} */ (schema), count, { seed }),
    };
  }

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const pathname = decodeURIComponent(url.pathname.replace(/\/+$/, '') || '/');

      const sendJson = (code, body) => {
        const json = `${JSON.stringify(body, null, 2)}\n`;
        res.writeHead(code, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(json),
        });
        res.end(json);
        console.log(`[${req.method}] ${pathname} - ${code} OK`);
      };

      const sendPlain = (code, text) => {
        res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(text);
        console.log(`[${req.method}] ${pathname} - ${code}`);
      };

      if (req.method !== 'GET') {
        sendPlain(405, 'Method Not Allowed\n');
        return;
      }

      if (pathname === '' || pathname === '/') {
        sendPlain(
          200,
          'mock-craft server — try GET /api/data or GET /api/<collection>?limit=N\n'
        );
        return;
      }

      if (pathname === '/api/data') {
        sendJson(200, payload);
        return;
      }

      const apiPrefix = '/api/';
      if (pathname.startsWith(apiPrefix)) {
        const rest = pathname.slice(apiPrefix.length);
        const segment = rest.split('/')[0];

        if (!segment) {
          sendPlain(404, 'Not Found\n');
          return;
        }

        if (!isCollectionsSchema(schema)) {
          sendPlain(404, 'No collections in schema\n');
          return;
        }

        const bundle = /** @type {Record<string, unknown[]>} */ (payload);
        const rows = bundle[segment];
        if (!Array.isArray(rows)) {
          sendPlain(404, `Unknown collection: ${segment}\n`);
          return;
        }

        const limRaw = url.searchParams.get('limit');
        let out = rows;
        if (limRaw !== null) {
          const lim = Number.parseInt(limRaw, 10);
          if (!Number.isFinite(lim) || lim < 0) {
            sendPlain(400, 'Invalid limit\n');
            return;
          }
          out = rows.slice(0, lim);
        }

        sendJson(200, out);
        return;
      }

      sendPlain(404, 'Not Found\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`${msg}\n`);
      console.error(`[${req.method}] ${req.url} - 500 ${msg}`);
    }
  });

  server.listen(port, () => {
    console.log(`mock-craft listening on http://127.0.0.1:${port}`);
    console.log(`  GET /api/data`);
    if (isCollectionsSchema(schema)) {
      console.log(`  GET /api/<collection>?limit=N`);
    }
  });

  return server;
}
