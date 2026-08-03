import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

describe('MeritClaim schema contract', () => {
  it('allows one run to report multiple Bosses without a global run ID collision', () => {
    expect(schema).toMatch(/runId\s+String/);
    expect(schema).not.toMatch(/runId\s+String\s+@unique/);
    expect(schema).toContain('@@index([userId, runId])');
  });

  it('qualifies idempotent endless claims by floor as well as Boss wave', () => {
    expect(schema).toContain('endlessFloor Int');
    expect(schema).toContain('@@unique([userId, difficulty, endlessFloor, bossWave])');
    expect(schema).toContain('@@index([userId, difficulty, bossWave])');
  });

  it('stores per-run Boss checkpoints separately from permanent reward claims', () => {
    expect(schema).toContain('model MeritRunCheckpoint');
    expect(schema).toContain('lastBossWave Int');
    expect(schema).toContain('lastFinishedAt DateTime');
    expect(schema).toContain('@@unique([userId, runId])');
  });
});
