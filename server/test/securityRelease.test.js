import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootPath = new URL('../../', import.meta.url).pathname;
const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

describe('online security release contract', () => {
  it('tracks no live environment or certificate material', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: rootPath, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
    const liveEnvironmentFiles = tracked.filter((path) => basename(path).startsWith('.env')
      && basename(path) !== '.env.example');

    expect(liveEnvironmentFiles).toEqual([]);
    expect(tracked.some((path) => path.startsWith('deploy/certs/'))).toBe(false);
    expect(read('.gitignore')).toContain('deploy/certs/');
  });

  it('keeps production cookies, body limits, CORS, and sensitive-route limits explicit', () => {
    const app = read('server/src/app.js');
    const auth = read('server/src/modules/auth/routes.js');
    const merit = read('server/src/modules/merit/routes.js');
    const compose = read('docker-compose.yml');

    expect(app).toContain('bodyLimit: 1024 * 1024');
    expect(app).toContain("import cors from '@fastify/cors'");
    expect(compose).toContain('APP_ORIGIN: ${APP_ORIGIN:?APP_ORIGIN is required}');
    expect(auth).toMatch(/secure:\s*true/);
    expect(auth).toMatch(/httpOnly:\s*true/);
    expect(auth).toMatch(/sameSite:\s*'lax'/);
    expect(auth).toMatch(/rateLimit:\s*\{ max: 5/);
    expect(merit).toMatch(/rateLimit:\s*\{ max: 20/);
  });

  it('documents the boundary of rule-based merit validation', () => {
    const docs = read('docs/deployment.md');

    expect(docs).toContain('服务端会校验关卡进度、敌人数、用时、连续 Boss 证据和奖励幂等性');
    expect(docs).toContain('完全权威的反作弊需要服务端回放或服务端战斗模拟');
  });
});
