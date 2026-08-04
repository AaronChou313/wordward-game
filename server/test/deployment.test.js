import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => {
  try { return readFileSync(new URL(path, root), 'utf8'); } catch { return ''; }
};

describe('production deployment contract', () => {
  it('builds both production images on Node 22 and runs them as non-root users', () => {
    const api = read('server/Dockerfile');
    const web = read('Dockerfile');

    expect(api).toMatch(/FROM node:22/);
    expect(api).toMatch(/apt-get install[^\n]*openssl/);
    expect(api).toContain('npm ci');
    expect(api).toContain('npm prune --omit=dev');
    expect(api).toMatch(/USER node/);
    expect(api).toContain('prisma:migrate:deploy');
    expect(web).toMatch(/FROM node:22/);
    expect(web).toContain('npm run build');
    expect(web).toMatch(/nginx-unprivileged/);
    expect(web).toMatch(/USER 101/);
  });

  it('keeps only migration-capable production dependencies in the API image', () => {
    const packageJson = JSON.parse(read('server/package.json'));

    expect(packageJson.dependencies.prisma).toBeDefined();
    expect(packageJson.devDependencies.vitest).toBeDefined();
  });

  it('defines a healthy persistent PostgreSQL service and migration-gated API', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toMatch(/postgres:16/);
    expect(compose).toContain('pg_isready');
    expect(compose).toMatch(/wordward_db:\s*$/m);
    expect(compose).toMatch(/condition: service_healthy/);
    expect(compose).toContain('npm run prisma:migrate:deploy');
    expect(compose).toContain('restart: unless-stopped');
  });

  it('serves the SPA and proxies API requests with release security headers', () => {
    const nginx = read('deploy/nginx.conf');

    expect(nginx).toMatch(/location \/api\//);
    expect(nginx).toMatch(/proxy_pass http:\/\/api:3000/);
    expect(nginx).toMatch(/map \$http_x_forwarded_proto \$upstream_proto/);
    expect(nginx).toContain('proxy_set_header X-Forwarded-Proto $upstream_proto');
    expect(nginx).toContain('try_files $uri $uri/ /index.html');
    expect(nginx).toContain('X-Content-Type-Options');
    expect(nginx).toContain('Content-Security-Policy');
    expect(nginx).toMatch(/client_max_body_size\s+1m/);
  });

  it('documents the complete production workflow without embedding live secrets', () => {
    const docs = read('docs/deployment.md');

    for (const heading of ['配置阿里云 DNS 和安全组', '创建生产环境变量',
      '第一次构建和启动应用', '安装 Caddy', '配置数据库每日自动备份',
      '数据库恢复演练', '应用代码回滚', '常用运维命令']) {
      expect(docs).toContain(heading);
    }
    expect(docs).toContain('npm run prisma:migrate:deploy');
    expect(docs).toContain('pg_restore');
    expect(docs).toContain('docker compose logs');
    expect(docs).not.toMatch(/JWT_ACCESS_SECRET=\S{32,}/);
    expect(docs).not.toMatch(/REFRESH_TOKEN_PEPPER=\S{32,}/);
  });

  it('ships a deployable baseline migration for every production table', () => {
    const migration = read('server/prisma/migrations/20260803000000_initial/migration.sql');

    for (const table of ['users', 'profiles', 'game_saves', 'merit_claims',
      'merit_run_checkpoints', 'refresh_tokens']) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain('FOREIGN KEY');
  });

  it('ships an end-to-end smoke check for health, registration, save, claim, and ranking', () => {
    const smoke = read('deploy/smoke.sh');

    for (const endpoint of ['/api/health', '/api/auth/register', '/api/save',
      '/api/merit/claims', '/api/leaderboard']) {
      expect(smoke).toContain(endpoint);
    }
    expect(smoke).toContain('set -eu');
    expect(smoke).not.toContain('meritTotal');
  });

  it('writes backups through a validated partial file before publishing them', () => {
    const backup = read('deploy/backup.sh');

    expect(backup).toContain('set -eu');
    expect(backup).toContain('partial_path="$final_path.partial"');
    expect(backup).toContain('test -s "$partial_path"');
    expect(backup).toContain("pg_restore --list");
    expect(backup).toContain('mv "$partial_path" "$final_path"');
  });
});
