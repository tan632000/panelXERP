import { Injectable } from '@nestjs/common';

/**
 * Generic hook type — any function that receives context and optionally returns a value.
 */
export type Hook<TContext = unknown, TResult = void | Promise<void>> = (
  context: TContext,
) => TResult;

/**
 * HookRegistry — allows plugins and extensions to register lifecycle hooks
 * that fire at defined points in the request processing pipeline.
 *
 * This is the foundation for the Extension Zone pattern: customer-specific
 * extensions attach hooks here, while kernel code remains untouched.
 *
 * Usage (in a plugin):
 *   class OrderService extends Hookable {
 *     constructor(registry: HookRegistry) {
 *       registry.register('order.beforeCreate', async (ctx) => {
 *         // Extension logic here
 *       });
 *     }
 *   }
 *
 * Usage (in kernel service):
 *   async create(dto: CreateOrderDto) {
 *     dto = await this.hookRegistry.run('order.beforeCreate', dto);
 *     // ... core logic ...
 *   }
 */
@Injectable()
export class HookRegistry {
  private hooks = new Map<string, Array<Hook<unknown, unknown>>>();

  register<TContext = unknown, TResult = void | Promise<void>>(
    name: string,
    hook: Hook<TContext, TResult>,
  ): void {
    const existing = this.hooks.get(name) ?? [];
    existing.push(hook);
    this.hooks.set(name, existing);
  }

  /**
   * Run all hooks for a named hook point sequentially.
   * Each hook receives the context and can mutate it.
   * Returns the (possibly modified) context.
   */
  async run<T>(name: string, context: T): Promise<T> {
    const hooks = this.hooks.get(name);
    if (!hooks || hooks.length === 0) return context;

    let current = context;
    for (const hook of hooks) {
      const result: unknown = await hook(current);
      if (result !== undefined) {
        current = result as T;
      }
    }
    return current;
  }

  has(name: string): boolean {
    return (this.hooks.get(name)?.length ?? 0) > 0;
  }

  getRegisteredHookPoints(): string[] {
    return [...this.hooks.keys()];
  }

  /**
   * Clear all hooks (useful for testing).
   */
  clear(): void {
    this.hooks.clear();
  }
}
