import './env.ts';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.ts';
import { corsOptions } from './common/core.ts';
import { mpesaConfigFromEnv, mpesaConfigProblems } from './providers/mpesa.ts';

async function bootstrap() {
  for (const k of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!process.env[k]) throw new Error(`Missing required env var ${k}. See SETUP.md section "Environment variables".`);
  }
  if (process.env.NODE_ENV === 'production' && /change-me/.test(`${process.env.JWT_ACCESS_SECRET}${process.env.JWT_REFRESH_SECRET}${process.env.PAYMENT_WEBHOOK_SECRET}`)) {
    throw new Error('Refusing to start in production with placeholder secrets (change-me)');
  }
  const provider = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'mpesa') {
    const problems = mpesaConfigProblems(mpesaConfigFromEnv());
    if (problems.length) {
      const msg = `M-Pesa is not configured correctly:\n  - ${problems.join('\n  - ')}\nSee SETUP.md section "Going live with M-Pesa".`;
      if (process.env.NODE_ENV === 'production') throw new Error(msg);
      console.warn(`[warn] ${msg}`);
    }
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO === 'true') console.warn('[warn] ENABLE_DEMO=true with real M-Pesa: turn demo mode off before real customers.');
  } else if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO !== 'true') {
    throw new Error('PAYMENT_PROVIDER is "mock" in production. Set PAYMENT_PROVIDER=mpesa (see SETUP.md) or ENABLE_DEMO=true for a staging environment.');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true }); // raw body needed for webhook signatures
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors(corsOptions);
  app.set('trust proxy', 1);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  if (process.env.ENABLE_DEMO === 'true' && process.env.SEED_DEMO_ON_BOOT === 'true') {
    import('./scripts/seed-demo.ts').then((x) => x.runSeed()).catch((e) => console.error('Demo seed failed:', e.message));
  }
  console.log(`FundiLink API listening on :${port}  (demo mode: ${process.env.ENABLE_DEMO === 'true' ? 'ON' : 'off'})`);
}
bootstrap();
