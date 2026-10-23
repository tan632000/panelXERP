import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  const password = process.env.DB_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DB_PASSWORD must be set in production.');
    }
  }

  return {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'erp_platform',
    user: process.env.DB_USER || 'erp_user',
    password: password || 'erp_pass_dev',
  };
});
