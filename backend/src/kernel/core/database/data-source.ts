import 'dotenv/config';
import { DataSource } from 'typeorm';

import { getFeatureMigrationGlobs } from '@kernel/platform/features/enabled-features';

// Follow the file being run, not NODE_ENV: dev runs the compiled dist/ for speed and must
// still seed with the development scope.
const isCompiled = __filename.endsWith('.js');
const sourceRoot = isCompiled ? 'dist' : 'src';
const ext = isCompiled ? 'js' : 'ts';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [`${sourceRoot}/**/*.entity.${ext}`],
  migrations: [
    `${sourceRoot}/kernel/core/database/migrations/*.${ext}`,
    ...getFeatureMigrationGlobs(isCompiled ? 'dist' : 'src'),
  ],
  synchronize: false,
});
