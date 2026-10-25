import { describe, expect, it } from 'vitest';
import { localDatabaseConfig } from './local-dev-config.mjs';

const url = 'postgresql://local:password@127.0.0.1:55432/kvantolingo_local';
describe('local development database isolation', () => {
  it('allows the same loopback database for app and migrations', () => {
    expect(localDatabaseConfig({ DATABASE_URL: url, DIRECT_URL: url }).port).toBe('55432');
  });
  it.each([
    'postgresql://local:password@192.168.0.28/db',
    'postgresql://local:password@db.example.org/db',
    `${url}?host=db.example.org`,
    `${url}?hostaddr=192.168.0.28`,
    `${url}?service=remote`,
    'file:./dev.db',
  ])('rejects remote or redirected connections: %s', (remote) => {
    expect(() => localDatabaseConfig({ DATABASE_URL: remote, DIRECT_URL: remote })).toThrow();
  });
  it('rejects migration target mismatch', () => {
    expect(() => localDatabaseConfig({ DATABASE_URL: url, DIRECT_URL: `${url}_other` })).toThrow();
  });
  it('requires an explicit migration target', () => {
    expect(() => localDatabaseConfig({ DATABASE_URL: url })).toThrow();
  });
});
