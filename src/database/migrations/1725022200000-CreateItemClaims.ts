import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateItemClaims1725022200000 implements MigrationInterface {
  name = 'CreateItemClaims1725022200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'item_claims',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'item_id',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'queue_position',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'contacted', 'selected', 'completed', 'cancelled', 'skipped', 'expired'],
            default: "'pending'",
          },
          {
            name: 'preferred_pickup_date',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'preferred_pickup_time',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'contact_method',
            type: 'enum',
            enum: ['email', 'phone', 'both'],
            default: "'email'",
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'lister_notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'cancellation_reason',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'skip_reason',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'contacted_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'selected_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'cancelled_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'skipped_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            name: 'FK_item_claims_item',
            columnNames: ['item_id'],
            referencedTableName: 'items',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_item_claims_user',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create indexes for FIFO queue performance
    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_item_id', ['item_id']),
    );

    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_user_id', ['user_id']),
    );

    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_queue_position', ['item_id', 'queue_position']),
    );

    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_status', ['status']),
    );

    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_created_at', ['created_at']),
    );

    // Critical index for FIFO queue ordering
    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_fifo_queue', ['item_id', 'status', 'queue_position', 'created_at']),
    );

    // Index for finding next in queue
    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_next_in_queue', ['item_id', 'status', 'queue_position'])
        .where(`status IN ('pending', 'contacted')`),
    );

    // Unique constraint to prevent duplicate claims by same user for same item
    await queryRunner.createIndex(
      'item_claims',
      new Index('IDX_item_claims_unique_user_item', ['item_id', 'user_id'])
        .where(`status NOT IN ('completed', 'cancelled')`),
    );

    // Create function to automatically assign queue positions
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION assign_queue_position()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.queue_position IS NULL THEN
          SELECT COALESCE(MAX(queue_position), 0) + 1
          INTO NEW.queue_position
          FROM item_claims
          WHERE item_id = NEW.item_id
            AND status NOT IN ('completed', 'cancelled', 'skipped');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to assign queue positions automatically
    await queryRunner.query(`
      CREATE TRIGGER trigger_assign_queue_position
        BEFORE INSERT ON item_claims
        FOR EACH ROW
        EXECUTE FUNCTION assign_queue_position();
    `);

    // Create function to reorder queue when claims are removed
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reorder_claim_queue()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.status IN ('pending', 'contacted') AND NEW.status IN ('completed', 'cancelled', 'skipped') THEN
          UPDATE item_claims 
          SET queue_position = queue_position - 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE item_id = NEW.item_id
            AND queue_position > OLD.queue_position
            AND status IN ('pending', 'contacted');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to reorder queue
    await queryRunner.query(`
      CREATE TRIGGER trigger_reorder_claim_queue
        AFTER UPDATE ON item_claims
        FOR EACH ROW
        EXECUTE FUNCTION reorder_claim_queue();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_reorder_claim_queue ON item_claims;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_assign_queue_position ON item_claims;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS reorder_claim_queue();`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS assign_queue_position();`);
    await queryRunner.dropTable('item_claims');
  }
}