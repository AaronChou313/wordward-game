import { createApp } from './app.js';

export default {
  fetch(request, env, ctx) {
    return createApp({ env, ctx }).fetch(request, env, ctx);
  },
};
