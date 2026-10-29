// RFC 7807 problem+json helper. Errors never echo raw input and never leak internals.
const BASE = 'https://devx-control.local/errors/';
export const problem = (res, status, slug, title, detail, extra = {}) =>
  res.status(status).type('application/problem+json').json({ type: BASE + slug, title, status, detail, ...extra });
export const notFound = (res, what = 'Resource') => problem(res, 404, 'not-found', 'Not found', `${what} does not exist.`);
export const badRequest = (res, detail) => problem(res, 400, 'bad-request', 'Bad request', detail);
export const conflict = (res, detail) => problem(res, 409, 'conflict', 'Conflict', detail);
