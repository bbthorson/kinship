import { createApp, BROKER_SERVICE_ID } from './app';
import { D1ReplayGuard } from './auth/d1-replay-guard';
import { createHttpDidResolver } from './auth/did-resolver';
import { createServiceAuthVerifier } from './auth/service-auth';
import { D1Store } from './d1-store';

interface Env {
  DB: D1Database;
  PUBLIC_BASE_URL: string;
  /** The broker's own did:web, e.g. did:web:broker.kinship.app. */
  BROKER_DID: string;
  /** Local dev only: trust an `x-dev-did` header. Never set in production. */
  DEV_AUTH?: string;
}

// Module scope, so the DID cache survives across requests within one isolate.
const resolver = createHttpDidResolver();

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const verify = createServiceAuthVerifier({
      audience: env.BROKER_DID,
      serviceId: BROKER_SERVICE_ID,
      resolver,
      replay: new D1ReplayGuard(env.DB),
    });
    const app = createApp({
      store: new D1Store(env.DB),
      publicBaseUrl: env.PUBLIC_BASE_URL,
      brokerDid: env.BROKER_DID,
      verifyCaller: async (r, lxm) => {
        if (env.DEV_AUTH === 'true') return r.headers.get('x-dev-did');
        const result = await verify(r.headers.get('authorization'), lxm);
        return result.ok ? result.did : null;
      },
    });
    return app.fetch(req, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env) {
    await new D1ReplayGuard(env.DB).sweep();
  },
} satisfies ExportedHandler<Env>;
