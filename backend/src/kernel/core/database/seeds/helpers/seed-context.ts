import type { DataSource } from 'typeorm';

export interface SeedContext {
  dataSource: DataSource;
}
