import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import { AuthService, type Manager } from './auth.ts';
import { snapshot, type BackupService } from './backup.ts';
import { RateLimiter } from './rate-limit.ts';
import { contractPdf } from './contract-pdf.ts';
import type { DB } from './db.ts';
import { ESIGN_AGREEMENT } from './esign.ts';
import { ApiError, DealService, type NewDeal } from './deals.ts';
import { testParts, type Providers } from './providers.ts';
import { ExportService } from './export.ts';
import type { Company, PaidBy, Passport, PayMethod, PayWhat } from './types.ts';

export type AppOptions = {
  db: DB; providers: Providers; logger?: boolean; appUrl?: string;
  /** Folder with the web build of the app (`npx expo export -p web`); served from the same address as the API. */
  webDir?: string;
  /** Daily copies of the database, when the server keeps them. */
  backups?: BackupService;
  /** Behind a reverse proxy (Caddy): take the client's address from X-Forwarded-For. */
  trustProxy?: boolean;
};

const image = (b64: unknown) => (typeof b64 === 'string' && b64.length > 0 ? Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64') : null);

export function buildApp({ db, providers, logger = false, appUrl, webDir, backups, trustProxy = false }: AppOptions): { app: FastifyInstance; deals: DealService; auth: AuthService } {
  // Client addresses carry the deal token, which opens the client's passport data: the log keeps only its start.
  const hideToken = (url: string) => url.replace(/(\/api\/client\/[^/?]{4})[^/?]*/, '$1…').replace(/([?&](t|key)=)[^&]*/g, '$1…');
  const app = Fastify({
    logger: logger && { serializers: { req: (req: { method: string; url: string; ip: string }) => ({ method: req.method, url: hideToken(req.url), remoteAddress: req.ip }) } },
    bodyLimit: 20 * 1024 * 1024, trustProxy,
  });
  const deals = new DealService(db, providers, { appUrl });
  const auth = new AuthService(db);
  const exports = new ExportService(db, deals);

  // Against password guessing and scripted calls: sign-in attempts and client requests per address.
  const loginLimit = new RateLimiter(20, 10 * 60 * 1000);
  const clientLimit = new RateLimiter(120, 60 * 1000);

  app.addHook('onRequest', async (req, reply) => {
    // The mobile app and the web build call the API from other origins.
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    // Client links carry the deal token, so pages never pass their address on to other sites.
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (req.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    // The matched route, not the raw address: "/api/%63lient/…" reaches the same handler.
    const route = req.routeOptions.url ?? '';
    const tooMany = (limit: RateLimiter) => !limit.allow(req.ip);
    if ((route === '/api/auth/login' && tooMany(loginLimit)) || (route.startsWith('/api/client/') && tooMany(clientLimit))) {
      return reply.code(429).send({ error: 'Слишком много запросов. Подождите немного и попробуйте снова.' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.code(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'Неверный запрос' });
    app.log.error(err);
    return reply.code(500).send({ error: 'Что-то пошло не так на сервере. Попробуйте ещё раз.' });
  });

  app.get('/api/health', async () => ({ ok: true, test: testParts(providers), payments: providers.payments.name }));

  // ----- manager login -----
  app.post('/api/auth/login', async (req) => {
    const b = (req.body ?? {}) as { email?: string; password?: string };
    return auth.login(b.email ?? '', b.password ?? '');
  });
  app.post('/api/auth/logout', async (req) => {
    auth.logout(req.headers.authorization);
    return { ok: true };
  });

  // ----- manager: requires a signed-in manager -----
  app.register(async (m) => {
    m.decorateRequest('manager', null as unknown as Manager);
    m.addHook('onRequest', async (req) => {
      if (req.method === 'OPTIONS') return;
      (req as unknown as { manager: Manager }).manager = auth.check(req.headers.authorization);
    });
    m.get('/api/auth/me', async (req) => ({ manager: (req as unknown as { manager: Manager }).manager }));
    m.get('/api/deals', async () => ({ deals: deals.list() }));
    const who = (req: unknown) => (req as { manager: Manager }).manager;
    m.post('/api/deals', async (req, reply) => reply.code(201).send({ deal: deals.create(req.body as NewDeal, {}, who(req).name) }));
    m.get('/api/deals/:id', async (req) => {
      const { id } = req.params as { id: string };
      const deal = deals.byId(id);
      return { deal, events: deals.events(id), inviteUrl: deals.inviteUrl(deal.token) };
    });
    m.get('/api/deals/:id/kyc', async (req) => ({ images: deals.kycImages((req.params as { id: string }).id) }));
    m.post('/api/deals/:id/invite', async (req) => ({ deal: await deals.resendInvite((req.params as { id: string }).id, who(req).name) }));
    m.post('/api/deals/:id/cancel', async (req) =>
      ({ deal: await deals.cancel((req.params as { id: string }).id, String((req.body as { reason?: string } | null)?.reason ?? ''), who(req).name) }));

    m.post('/api/deals/:id/payments', async (req) =>
      ({ deal: deals.recordManual((req.params as { id: string }).id, (req.body ?? {}) as { what: PayWhat; method: PaidBy; note?: string }, who(req).name) }));

    // ----- company details -----
    m.get('/api/company', async () => ({ company: deals.company.get(), missing: deals.company.missing() }));
    m.put('/api/company', async (req) => {
      const company = deals.company.update(who(req), (req.body ?? {}) as Partial<Company>);
      return { company, missing: deals.company.missing(company) };
    });

    // ----- spreadsheets -----
    m.post('/api/export/key', async (req) => ({ key: exports.newKey(who(req).admin) }));
    m.get('/api/backups', async (req) => {
      if (!who(req).admin) throw new ApiError(403, 'Резервные копии видит только администратор');
      return { daily: backups ? { dir: backups.dir, keep: backups.keep, files: backups.list() } : null };
    });

    // ----- team -----
    m.get('/api/managers', async (req) => ({ managers: auth.list(who(req)) }));
    m.post('/api/managers', async (req, reply) => {
      const b = (req.body ?? {}) as { email?: string; name?: string; password?: string; admin?: boolean };
      return reply.code(201).send({ manager: auth.invite(who(req), b) });
    });
    const managerId = (req: { params: unknown }) => Number((req.params as { id: string }).id);
    m.post('/api/managers/:id/password', async (req) =>
      ({ manager: auth.resetPassword(who(req), managerId(req), (req.body as { password?: string } | null)?.password ?? '') }));
    m.post('/api/managers/:id/disabled', async (req) =>
      ({ manager: auth.setDisabled(who(req), managerId(req), (req.body as { disabled?: boolean } | null)?.disabled === true) }));
    m.post('/api/auth/password', async (req) => {
      const b = (req.body ?? {}) as { current?: string; next?: string };
      auth.changePassword(who(req), req.headers.authorization, b.current ?? '', b.next ?? '');
      return { ok: true };
    });
  });

  // ----- client: the token from the invite link is the credential -----
  type P = { token: string };
  const body = <T>(req: { body: unknown }) => (req.body ?? {}) as T;
  app.get('/api/client/:token', async (req) => ({ deal: deals.byToken((req.params as P).token) }));
  app.get('/api/client/:token/contract.pdf', async (req, reply) => {
    const deal = deals.byToken((req.params as P).token);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="dogovor-${encodeURIComponent(deal.no)}.pdf"`);
    return reply.send(await contractPdf(deal, deals.company.get()));
  });
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
  app.get('/api/esign-agreement', async () => ESIGN_AGREEMENT);
  app.post('/api/client/:token/contract/accept', async (req) =>
    ({ deal: deals.acceptContract((req.params as P).token, Number(body<{ esignEdition?: number }>(req).esignEdition)) }));
  app.post('/api/client/:token/sign/send', async (req) => ({ deal: await deals.sendSignCode((req.params as P).token) }));
  app.post('/api/client/:token/sign/verify', async (req) =>
    ({ deal: deals.verifySign((req.params as P).token, body<{ code: string }>(req).code) }));
  app.post('/api/client/:token/pay', async (req) => {
    const b = body<{ what: PayWhat; method: PayMethod }>(req);
    return deals.pay((req.params as P).token, b.what, b.method);
  });
  app.get('/api/client/:token/payments/:id', async (req) => {
    const p = req.params as P & { id: string };
    return deals.paymentStatus(p.token, p.id);
  });

  // ----- spreadsheet download, by a one-time key from /api/export/key -----
  app.get('/api/export/:kind', async (req, reply) => {
    const kind = (req.params as { kind: string }).kind;
    exports.useKey(String((req.query as { key?: string }).key ?? ''), kind === 'backup.db');
    if (kind === 'backup.db') {
      const file = path.join(tmpdir(), `sdelka-${randomUUID()}.db`);
      snapshot(db, file);
      const data = readFileSync(file);
      rmSync(file, { force: true });
      const name = `sdelka-${new Date().toISOString().slice(0, 10)}.db`;
      return reply.type('application/vnd.sqlite3').header('Content-Disposition', `attachment; filename="${name}"`).send(data);
    }
    const csv = kind === 'payments.csv' ? exports.payments() : kind === 'deals.csv' ? exports.dealsTable() : null;
    if (!csv) return reply.code(404).send({ error: 'Не найдено' });
    const name = `${kind === 'payments.csv' ? 'платежи' : 'сделки'}-${new Date().toISOString().slice(0, 10)}.csv`;
    return reply.type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${kind}"; filename*=UTF-8''${encodeURIComponent(name)}`).send(csv);
  });

  // ----- acquirer webhook -----
  app.post('/api/payments/notify', async (req, reply) => {
    if (!deals.handleNotification(req.body)) return reply.code(403).send({ error: 'Неверная подпись' });
    return reply.type('text/plain').send(providers.payments.notificationAck);
  });

  if (webDir) {
    app.register(fastifyStatic, { root: path.resolve(webDir), wildcard: false });
    // The web app routes on its own: any other page address gets index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Не найдено' });
      return reply.sendFile('index.html');
    });
  }

  return { app, deals, auth };
}
