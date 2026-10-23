import { Module } from '@nestjs/common';

/**
 * Example extension module.
 *
 * Extensions live in src/_extensions/{name}/ and are auto-discovered
 * by the ExtensionLoader at boot time.
 *
 * Convention:
 *   - Directory: src/_extensions/{name}/
 *   - Module file: {name}.extension.ts (must default-export a NestJS @Module)
 *   - Can import any @kernel/* or @shared/* module
 *   - Can declare its own controllers, providers, and exports
 *
 * To enable/disable at runtime, use ENABLED_FEATURES env var
 * or set EXT_{NAME}_ENABLED=false.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ExampleExtensionModule {}
