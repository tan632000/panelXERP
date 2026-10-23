import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One user's column-visibility choice for one list screen.
 *
 * Keyed by `(user_id, module_key)`: a choice belongs to the person who made it, so two
 * accounts on the same machine never share one. The row is derived from the token's user on
 * every write, never from the payload.
 */
@Entity('user_list_preferences')
export class UserListPreference {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id', comment: 'ID' })
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  /** Which list the choice belongs to, e.g. `rfq_list_v3`. Validated against a registry. */
  @Column({ name: 'module_key', type: 'varchar', length: 100 })
  moduleKey: string;

  /** Column keys the user left visible, in the order the table declares them. */
  @Column({
    name: 'visible_columns',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  visibleColumns: string[];

  /**
   * Last column that stays pinned while the table scrolls sideways; every column before it
   * is pinned with it. NULL means the account froze nothing.
   */
  @Column({
    name: 'frozen_column',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  frozenColumn: string | null;

  /** Width in pixels of each column the user dragged, keyed by column key. */
  @Column({
    name: 'column_widths',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  columnWidths: Record<string, number>;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}
