import { testDatabaseUrl } from './testConfig';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl(),
  JWT_ACCESS_SECRET: 'test-access-secret-con-mas-de-32-caracteres',
  JWT_REFRESH_SECRET: 'test-refresh-secret-con-mas-de-32-caracteres',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL_DAYS: '7',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  S3_BUCKET: 'gestor-documental-test',
  S3_ENDPOINT: '',
  S3_PUBLIC_ENDPOINT: '',
  CORS_ORIGINS: 'http://localhost:8081',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_MAX: '100000',
  LOGIN_RATE_LIMIT_MAX: '5',
  PASSWORD_RATE_LIMIT_MAX: '100',
  WEB_DIST_DIR: '',
  BASE_DOMAIN: 'rtlco.cl',
  DEFAULT_SCHOOL_SLUG: 'demo',
});
