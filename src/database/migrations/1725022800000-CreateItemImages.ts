import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateItemImages1725022800000 implements MigrationInterface {
  name = 'CreateItemImages1725022800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'item_images',
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
            name: 'uploaded_by',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'filename',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'original_filename',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'file_size',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'width',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'height',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'thumbnail_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'sort_order',
            type: 'integer',
            default: 1,
          },
          {
            name: 'is_primary',
            type: 'boolean',
            default: false,
          },
          {
            name: 'alt_text',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'processing_status',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: "'completed'",
          },
          {
            name: 'blur_hash',
            type: 'varchar',
            length: '50',
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
        ],
        foreignKeys: [
          {
            name: 'FK_item_images_item',
            columnNames: ['item_id'],
            referencedTableName: 'items',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_item_images_uploader',
            columnNames: ['uploaded_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'item_images',
      new Index('IDX_item_images_item_id', ['item_id']),
    );

    await queryRunner.createIndex(
      'item_images',
      new Index('IDX_item_images_uploader', ['uploaded_by']),
    );

    await queryRunner.createIndex(
      'item_images',
      new Index('IDX_item_images_sort_order', ['item_id', 'sort_order']),
    );

    await queryRunner.createIndex(
      'item_images',
      new Index('IDX_item_images_primary', ['item_id', 'is_primary']),
    );

    await queryRunner.createIndex(
      'item_images',
      new Index('IDX_item_images_processing_status', ['processing_status']),
    );

    // Ensure only one primary image per item
    await queryRunner.createIndex(
      'item_images',
      new Index('IDX_item_images_unique_primary', ['item_id'])
        .where('is_primary = true'),
    );

    // Create function to ensure only one primary image per item
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_single_primary_image()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.is_primary = true THEN
          UPDATE item_images 
          SET is_primary = false, 
              updated_at = CURRENT_TIMESTAMP
          WHERE item_id = NEW.item_id 
            AND id != NEW.id 
            AND is_primary = true;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to ensure single primary image
    await queryRunner.query(`
      CREATE TRIGGER trigger_ensure_single_primary_image
        BEFORE INSERT OR UPDATE ON item_images
        FOR EACH ROW
        EXECUTE FUNCTION ensure_single_primary_image();
    `);

    // Create function to auto-set first image as primary
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION auto_set_primary_image()
      RETURNS TRIGGER AS $$
      DECLARE
        image_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO image_count
        FROM item_images
        WHERE item_id = NEW.item_id;
        
        IF image_count = 1 AND NEW.is_primary = false THEN
          NEW.is_primary = true;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to auto-set primary image
    await queryRunner.query(`
      CREATE TRIGGER trigger_auto_set_primary_image
        BEFORE INSERT ON item_images
        FOR EACH ROW
        EXECUTE FUNCTION auto_set_primary_image();
    `);

    // Create function to maintain sort order
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION maintain_image_sort_order()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.sort_order IS NULL THEN
          SELECT COALESCE(MAX(sort_order), 0) + 1
          INTO NEW.sort_order
          FROM item_images
          WHERE item_id = NEW.item_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to maintain sort order
    await queryRunner.query(`
      CREATE TRIGGER trigger_maintain_image_sort_order
        BEFORE INSERT ON item_images
        FOR EACH ROW
        EXECUTE FUNCTION maintain_image_sort_order();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_maintain_image_sort_order ON item_images;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_auto_set_primary_image ON item_images;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_ensure_single_primary_image ON item_images;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS maintain_image_sort_order();`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS auto_set_primary_image();`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS ensure_single_primary_image();`);
    await queryRunner.dropTable('item_images');
  }
}