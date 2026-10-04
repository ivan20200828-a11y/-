import Fastify, { type FastifyInstance } from 'fastify';

import type { DB } from './db.ts';
import { ApiError, DealService, type NewDeal } from './deals.ts';
import { TEST_MODE, type Providers } from './providers.ts';
import type { Passport, PayMethod } from './types.ts';

export type AppOptions = { db: DB; providers: Providers; managerKey: string; logger?: boolean };

const image = (b64: unknown) => (typeof b64 === 'string' && b64.length > 0 ? Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64') : null);

export function buildApp({ db, providers, managerKey, logger = false }: AppOptions): { app: FastifyInstance; deals: DealService } {
  const app = Fastify({ logger, bodyLimit: 20 * 1024 * 1024 });
  const deals = new DealService(db, providers);

  // The mobile app and the web build call the API from other origins.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.code(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'Неверный запрос' });
    app.log.error(err);
    return reply.code(500).send({ error: 'Что-то пошло не так на сервере. Попробуйте ещё раз.' });
  });

  app.get('/api/health', async () => ({ ok: true, testMode: TEST_MODE }));

  // ----- manager: requires the manager key -----
  app.register(async (m) => {
    m.addHook('onRequest', async (req) => {
      if (req.method === 'OPTIONS') return;
      if (req.headers.authorization !== `Bearer ${managerKey}`) throw new ApiError(401, 'Нужен ключ менеджера');
    });
    m.get('/api/deals', async () => ({ deals: deals.list() }));
    m.post('/api/deals', async (req, reply) => reply.code(201).send({ deal: deals.create(req.body as NewDeal) }));
    m.get('/api/deals/:id', async (req) => {
      const { id } = req.params as { id: string };
      return { deal: deals.byId(id), events: deals.events(id) };
    });
  });

  // ----- client: the token from the invite link is the credential -----
  type P = { token: string };
  const body = <T>(req: { body: unknown }) => (req.body ?? {}) as T;
  app.get('/api/client/:token', async (req) => ({ deal: deals.byToken((req.params as P).token) }));
  app.post('/api/client/:token/start', async (req) => ({ deal: deals.start((req.params as P).token) }));
  app.post('/api/client/:token/phone/send', async (req) =>
    ({ deal: await deals.sendPhoneCode((req.params as P).token, body<{ phone: string }>(req).phone) }));
  app.post('/api/client/:token/phone/verify', async (req) =>
    ({ deal: deals.verifyPhone((req.params as P).token, body<{ code: string }>(req).code) }));
  app.post('/api/client/:token/kyc', async (req) => {
    const b = body<{ passportImage?: string; selfieImage?: string }>(req);
    return deals.recognize((req.params as P).token, image(b.passportImage), image(b.selfieImage));
  });
  app.post('/api/client/:token/passport', async (req) =>
    ({ deal: deals.confirmPassport((req.params as P).token, body<{ passport: Passport }>(req).passport) }));
  app.post('/api/client/:token/contract/accept', async (req) => ({ deal: deals.acceptContract((req.params as P).token) }));
  app.post('/api/client/:token/sign/send', async (req) => ({ deal: await deals.sendSignCode((req.params as P).token) }));
  app.post('/api/client/:token/sign/verify', async (req) =>
    ({ deal: deals.verifySign((req.params as P).token, body<{ code: string }>(req).code) }));
  app.post('/api/client/:token/pay', async (req) => {
    const b = body<{ what: 'down' | 'next'; method: PayMethod }>(req);
    return { deal: await deals.pay((req.params as P).token, b.what, b.method) };
  });

  return { app, deals };
}
