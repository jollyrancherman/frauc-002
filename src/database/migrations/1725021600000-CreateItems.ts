import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateItems1725021600000 implements MigrationInterface {
  name = 'CreateItems1725021600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'items',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'user_id',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'category_id',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'active', 'claimed', 'expired', 'deleted', 'suspended'],
            default: "'active'",
          },
          {
            name: 'zip_code',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'location_text',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'location',
            type: 'geography',
            spatialFeatureType: 'Point',
            srid: 4326,
            isNullable: true,
          },
          {
            name: 'pickup_instructions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'pickup_schedule',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'view_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'claim_count',
            type: 'integer',
            default: 0,
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
            name: 'expires_at',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'claimed_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'expired_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            name: 'FK_items_user',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_items_category',
            columnNames: ['category_id'],
            referencedTableName: 'item_categories',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_user_id', ['user_id']),
    );

    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_category_id', ['category_id']),
    );

    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_status', ['status']),
    );

    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_zip_code', ['zip_code']),
    );

    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_created_at', ['created_at']),
    );

    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_expires_at', ['expires_at']),
    );

    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_active_not_expired', ['status', 'expires_at']),
    );

    // Create spatial index for location-based queries
    await queryRunner.query(`
      CREATE INDEX IDX_items_location ON items USING GIST (location);
    `);

    // Create full-text search index for title and description
    await queryRunner.query(`
      CREATE INDEX IDX_items_search ON items USING GIN (to_tsvector('english', title || ' ' || description));
    `);

    // Create composite index for common queries
    await queryRunner.createIndex(
      'items',
      new Index('IDX_items_active_zip_created', ['status', 'zip_code', 'created_at']),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('items');
  }
}