// Gera prisma/<provedor>/schema.prisma a partir de prisma/schema.base.prisma.
//
//   DATABASE_PROVIDER=sqlite      → prisma/sqlite/schema.prisma   (desenvolvimento)
//   DATABASE_PROVIDER=postgresql  → prisma/postgresql/schema.prisma (Supabase)
//
// Cada provedor tem a sua pasta de migrações ao lado do schema gerado, então o
// histórico do SQLite nunca se mistura com o do Postgres.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function resolveProvider() {
  loadEnv(root);
  const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').trim();
  if (provider !== 'sqlite' && provider !== 'postgresql') {
    throw new Error(`DATABASE_PROVIDER inválido: "${provider}". Use "sqlite" ou "postgresql".`);
  }
  return provider;
}

const DATASOURCES = {
  sqlite: `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`,
  // Supabase: DATABASE_URL usa o pooler (porta 6543, ?pgbouncer=true) e
  // DIRECT_URL a conexão direta (porta 5432), exigida pelas migrações.
  postgresql: `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`,
};

export function writeSchema(provider = resolveProvider()) {
  const base = readFileSync(join(root, 'prisma', 'schema.base.prisma'), 'utf8');
  const banner = '// ARQUIVO GERADO por scripts/prisma-schema.mjs — edite prisma/schema.base.prisma.\n';
  const schema = banner + base.replace('//@@DATASOURCE@@', DATASOURCES[provider]);
  const target = join(root, 'prisma', provider, 'schema.prisma');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, schema);
  return target;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = writeSchema();
  console.log(`schema gerado em ${target}`);
}
