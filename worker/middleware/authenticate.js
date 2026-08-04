// Shared protected-route middleware.  The implementation lives with auth to
// preserve token/session semantics; this module provides the composition API.
export { requireAuth as authenticate } from '../modules/auth/routes.js';

