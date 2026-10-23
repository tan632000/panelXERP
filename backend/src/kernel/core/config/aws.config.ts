import { registerAs } from '@nestjs/config';

export default registerAs('aws', () => ({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  endpoint: process.env.AWS_ENDPOINT,
  /** Browser-reachable S3 endpoint for presigned URLs (Docker: localhost:14566). */
  s3PublicEndpoint: process.env.AWS_S3_PUBLIC_ENDPOINT,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  forcePathStyle: process.env.AWS_FORCE_PATH_STYLE === 'true',
  s3Bucket: process.env.AWS_S3_BUCKET || 'erp-files',
  s3LogBucket: process.env.AWS_S3_LOG_BUCKET || 'erp-logs',
}));
