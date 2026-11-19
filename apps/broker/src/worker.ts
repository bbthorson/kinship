import { createApp } from './app';
import { D1Store } from './d1-store';

interface Env {
  DB: D1Database;
  PUBLIC_BASE_URL: string;
  /** Local dev only: trust an `x-dev-did` header. Never set in production. */
  DEV_AUTH?: string;
}

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const app = createApp({
      store: new D1Store(env.DB),
      publicBaseUrl: env.PUBLIC_BASE_URL,
      verifyCaller: async (r) => (env.DEV_AUTH === 'true' ? r.headers.get('x-dev-did') : null),
    });
    return app.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
