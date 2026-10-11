// Executa a CLI do Prisma apontando para o schema do provedor ativo.
//   node scripts/prisma.mjs migrate dev --name add_x
//   DATABASE_PROVIDER=postgresql node scripts/prisma.mjs migrate deploy
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeSchema } from './prisma-schema.mjs';

const schema = writeSchema();
const args = process.argv.slice(2);
if (args.length === 0) args.push('--help');

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, ...args, '--schema', schema], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
