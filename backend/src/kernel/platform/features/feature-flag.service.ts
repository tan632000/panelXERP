import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FeatureFlag } from '@kernel/platform/features/feature-flag.entity';
import { parseEnabledFeatureKeys } from '@kernel/platform/features/resolve-enabled-features';

import { DEFAULT_IN_MEMORY_CACHE_TTL_MS } from '@shared/constants/cache';

/**
 * Runtime feature flag service.
 *
 * Single-tenant resolution:
 *   1. DB row — runtime override via admin UI
 *   2. Env var fallback (ENABLED_FEATURES) — boot-time default
 *
 * NOTE: This is a single-tenant system. Each customer gets their own
 * database instance, so there is no tenantId column in the entity.
 */
@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagService.name);

  private cache = new Map<string, boolean>();
  private cacheTTL = DEFAULT_IN_MEMORY_CACHE_TTL_MS;
  private lastCacheRefresh = 0;
  private dbAvailable = true;

  constructor(
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepo: Repository<FeatureFlag>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.refreshCache();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.dbAvailable = false;
      this.logger.warn(
        `FeatureFlag table not available, falling back to env defaults: ${message}`,
      );
    }
  }

  /**
   * Check if a feature is enabled.
   * Priority: DB override > env var default.
   */
  async isEnabled(key: string): Promise<boolean> {
    if (!this.dbAvailable) {
      return this.envFallback(key);
    }

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    await this.refreshCache();
    return this.cache.get(key) ?? this.envFallback(key);
  }

  async setOverride(
    key: string,
    enabled: boolean,
    description?: string,
  ): Promise<FeatureFlag> {
    if (!this.dbAvailable) {
      throw new Error(
        'FeatureFlag database table is not available. Run migrations first.',
      );
    }

    const existing = await this.featureFlagRepo.findOne({
      where: { key },
    });

    let flag: FeatureFlag;
    if (existing) {
      existing.enabled = enabled;
      if (description !== undefined) existing.description = description;
      flag = await this.featureFlagRepo.save(existing);
    } else {
      flag = await this.featureFlagRepo.save(
        this.featureFlagRepo.create({
          key,
          enabled,
          description: description ?? null,
        }),
      );
    }

    this.cache.delete(key);
    return flag;
  }

  /**
   * Remove a feature flag override (revert to env var default).
   */
  async removeOverride(key: string): Promise<void> {
    if (!this.dbAvailable) {
      throw new Error(
        'FeatureFlag database table is not available. Run migrations first.',
      );
    }

    await this.featureFlagRepo.delete({ key });
    this.cache.delete(key);
  }

  async getOverrides(): Promise<FeatureFlag[]> {
    if (!this.dbAvailable) {
      return [];
    }

    return this.featureFlagRepo.find();
  }

  private async refreshCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheRefresh < this.cacheTTL) return;

    const flags = await this.featureFlagRepo.find();
    this.cache.clear();
    for (const flag of flags) {
      this.cache.set(flag.key, flag.enabled);
    }
    this.lastCacheRefresh = now;
  }

  private envFallback(key: string): boolean {
    const defaultKeys: string[] = [];
    const enabledKeys = parseEnabledFeatureKeys(
      process.env.ENABLED_FEATURES,
      defaultKeys,
    );
    return enabledKeys.includes(key);
  }
}
