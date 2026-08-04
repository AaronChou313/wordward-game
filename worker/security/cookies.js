const COOKIE_NAME = 'wordward_refresh';
const COOKIE_PATH = '/api/auth';
const MAX_AGE = 30 * 24 * 60 * 60;

function write(headers, token, maxAge) {
  headers.set('Set-Cookie', `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`);
}

export function setRefreshCookie(headers, token) {
  write(headers, token, MAX_AGE);
  return headers;
}

export function clearRefreshCookie(headers) {
  write(headers, '', 0);
  return headers;
}
