import { promises as fs } from 'fs';
import * as path from 'path';

const LOG_FILE_PATTERN =
  /^(app|error|audit|activity)_(\d{4}-\d{2}-\d{2})\.log$/;

const LOG_CATEGORIES = ['app', 'error', 'audit', 'activity'];

export class DailyFileLogWriter {
  constructor(
    private readonly baseDir: string,
    private readonly retentionDays: number,
  ) {}

  async append(category: string, line: string): Promise<void> {
    const filePath = this.resolveTodayFilePath(category);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${line}\n`, 'utf8');
  }

  resolveTodayFilePath(category: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.baseDir, category, `${category}_${date}.log`);
  }

  async cleanupExpiredFiles(): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - this.retentionDays);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    let removed = 0;

    for (const category of LOG_CATEGORIES) {
      const categoryDir = path.join(this.baseDir, category);

      try {
        const files = await fs.readdir(categoryDir);
        for (const file of files) {
          const match = file.match(LOG_FILE_PATTERN);
          if (!match || match[1] !== category) {
            continue;
          }

          const fileDate = match[2];
          if (fileDate >= cutoffKey) {
            continue;
          }

          await fs.unlink(path.join(categoryDir, file));
          removed += 1;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
    }

    return removed;
  }
}
