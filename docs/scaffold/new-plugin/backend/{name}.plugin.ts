import type { ErpPlugin } from '../../platform/plugins/plugin.contract';
import { {NamePascal}Module } from './{name}.module';
import { {name}Permissions } from './{name}.permissions';
import { seed{NamePascal} } from './database/seeds/index';

export const {name}Plugin = {
  name: '{name}',
  module: {NamePascal}Module,
  permissions: {name}Permissions,
  seed: seed{NamePascal},
} satisfies ErpPlugin;
