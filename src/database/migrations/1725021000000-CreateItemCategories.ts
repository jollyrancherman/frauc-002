import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateItemCategories1725021000000 implements MigrationInterface {
  name = 'CreateItemCategories1725021000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'item_categories',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '100',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'icon_name',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'parent_id',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'sort_order',
            type: 'integer',
            default: 0,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
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
        ],
        foreignKeys: [
          {
            name: 'FK_item_categories_parent',
            columnNames: ['parent_id'],
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
      'item_categories',
      new Index('IDX_item_categories_slug', ['slug']),
    );

    await queryRunner.createIndex(
      'item_categories',
      new Index('IDX_item_categories_parent_id', ['parent_id']),
    );

    await queryRunner.createIndex(
      'item_categories',
      new Index('IDX_item_categories_sort_order', ['sort_order']),
    );

    await queryRunner.createIndex(
      'item_categories',
      new Index('IDX_item_categories_active', ['is_active']),
    );

    // Insert default categories
    await queryRunner.query(`
      INSERT INTO item_categories (name, slug, description, icon_name, sort_order) VALUES
      ('Electronics', 'electronics', 'Electronic devices and gadgets', 'computer-desktop', 1),
      ('Furniture', 'furniture', 'Home and office furniture', 'home-modern', 2),
      ('Clothing', 'clothing', 'Clothes and accessories', 'user-circle', 3),
      ('Books', 'books', 'Books and educational materials', 'book-open', 4),
      ('Sports', 'sports', 'Sports equipment and gear', 'trophy', 5),
      ('Home & Garden', 'home-garden', 'Home improvement and gardening items', 'home', 6),
      ('Toys', 'toys', 'Toys and games', 'puzzle-piece', 7),
      ('Kitchen', 'kitchen', 'Kitchen appliances and utensils', 'cake', 8),
      ('Tools', 'tools', 'Tools and hardware', 'wrench-screwdriver', 9),
      ('Other', 'other', 'Items that don''t fit other categories', 'squares-plus', 10);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('item_categories');
  }
}