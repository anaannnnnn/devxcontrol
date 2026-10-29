// Minimal Express-compatible HTTP layer on node:http. Zero dependencies: nothing to install, nothing to audit.
// Supports: app/router use/get/post/delete, :params with (a|b) alternation, error handlers, json body, static files.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function compile(pattern) {
  const keys = [];
  const src = pattern.replace(/\./g, '\\.').replace(/\/:([A-Za-z]+)(\(([^)]+)\))?/g, (_, k, __, alt) => { keys.push(k); return `/(${alt || '[^/]+'})`; });
  return { re: new RegExp(`^${src}/?$`), keys };
}

function decorate(req, res, trust) {
  const u = new URL(req.url, 'http://x');
  req.path = decodeURIComponent(u.pathname);
  req.query = Object.fromEntries(u.searchParams);
  req.params = {};
  req.ip = (trust && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  req.secure = trust ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted;
  res.status = (n) => { res.statusCode = n; return res; };
  res.set = (k, v) => { if (typeof k === 'object') Object.entries(k).forEach(([a, b]) => res.setHeader(a, b)); else res.setHeader(k, v); return res; };
  res.type = (t) => { res.setHeader('Content-Type', t.includes('/') ? t : (MIME['.' + t] || 'application/octet-stream')); return res; };
  res.send = (body) => {
    if (!res.getHeader('Content-Type')) res.type(typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(body);
  };
  res.json = (obj) => { if (!res.getHeader('Content-Type')) res.type('application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  res.sendFile = (file) => {
    res.type(MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  };
  res.download = (file) => {
    res.set('Content-Disposition', `attachment; filename="${path.basename(file).replace(/"/g, '')}"`);
    res.type('application/octet-stream');
    res.set('Content-Length', fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  };
}

function makeRouter(opts = {}) {
  const stack = [];
  const add = (method, pattern, fns) => fns.forEach((fn) => stack.push({ method, ...(pattern ? compile(pattern) : {}), pattern, fn }));
  const handle = (req, res, out) => {
    let i = 0;
    const next = (err) => {
      const layer = stack[i++];
      if (!layer) return out ? out(err) : finalize(err, req, res);
      try {
        if (layer.method) { // route
          if (err || (layer.method !== 'ALL' && layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD'))) return next(err);
          const m = layer.re.exec(req.path);
          if (!m) return next();
          req.params = Object.fromEntries(layer.keys.map((k, n) => [k, decodeURIComponent(m[n + 1])]));
          return layer.fn(req, res, next);
        }
        if (layer.prefix) { // mounted prefix
          const p = layer.prefix;
          if (!(req.path === p || req.path.startsWith(p + '/'))) return next(err);
          const saved = req.path;
          req.path = req.path.slice(p.length) || '/';
          const back = (e) => { req.path = saved; next(e); };
          return run(layer.fn, err, req, res, back);
        }
        return run(layer.fn, err, req, res, next);
      } catch (e) { next(e); }
    };
    next();
  };
  const run = (fn, err, req, res, next) => {
    const isErr = fn.length === 4;
    if (err && !isErr) return next(err);
    if (!err && isErr) return next();
    try {
      const r = isErr ? fn(err, req, res, next) : (fn.handle ? fn.handle(req, res, next) : fn(req, res, next));
      if (r?.catch) r.catch(next);
    } catch (e) { next(e); }
  };
  const finalize = (err, req, res) => {
    if (res.headersSent) return res.end();
    res.statusCode = err ? 500 : 404; res.end(err ? 'Internal Server Error' : 'Not Found');
  };
  const router = {
    stack, handle, opts,
    use(...args) { const prefix = typeof args[0] === 'string' ? args.shift() : null; args.forEach((fn) => stack.push({ prefix, fn })); return router; },
  };
  for (const m of ['get', 'post', 'delete', 'put', 'patch']) router[m] = (pattern, ...fns) => { add(m.toUpperCase(), pattern, fns); return router; };
  return router;
}

export default function express() {
  const app = makeRouter();
  const settings = {};
  app.set = (k, v) => { settings[k] = v; return app; };
  app.disable = (k) => { settings[k] = false; return app; };
  app.handle = ((inner) => (req, res) => { decorate(req, res, !!settings['trust proxy']); inner(req, res); })(app.handle.bind(null));
  const rawHandle = app.handle;
  app.listen = (port, cb) => http.createServer((req, res) => rawHandle(req, res)).listen(port, cb);
  return app;
}
express.Router = () => { const r = makeRouter(); const fn = (req, res, next) => r.handle(req, res, next); Object.assign(fn, r); fn.handle = r.handle; return fn; };

express.json = ({ limit = '10kb' } = {}) => {
  const max = /kb$/i.test(limit) ? parseInt(limit, 10) * 1024 : +limit;
  return (req, res, next) => {
    req.body = {};
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !/json/.test(req.headers['content-type'] || '')) return next();
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > max) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return next();
      try { req.body = JSON.parse(Buffer.concat(chunks).toString()); next(); } catch { const e = new Error('bad json'); e.type = 'entity.parse.failed'; next(e); }
    });
    req.on('error', next);
  };
};

express.static = (dir, { maxAge = '0', setHeaders } = {}) => {
  const root = path.resolve(dir);
  const age = maxAge === '1h' ? 3600 : 0;
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let file = path.join(root, path.normalize(req.path));
    if (!file.startsWith(root)) return next();
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); const st = fs.statSync(file);
      res.type(MIME[path.extname(file)] || 'application/octet-stream');
      // Pages, scripts and styles are always re-checked (a quick 304 when nothing changed), so a deploy shows up straight away.
      // Fonts, images and sounds can be kept for the configured time.
      const code = /\.(html?|m?js|css|json|webmanifest)$/i.test(file);
      const tag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
      res.set('Cache-Control', code ? 'no-cache' : `public, max-age=${age}`);
      if (code) { res.set('ETag', tag); res.set('Last-Modified', new Date(st.mtimeMs).toUTCString()); }
      setHeaders?.(res, file);
      if (code && req.headers['if-none-match'] === tag) { res.statusCode = 304; return res.end(); }
      res.set('Content-Length', st.size);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch { next(); }
  };
};
