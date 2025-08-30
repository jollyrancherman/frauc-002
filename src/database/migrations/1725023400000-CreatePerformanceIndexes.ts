import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePerformanceIndexes1725023400000 implements MigrationInterface {
  name = 'CreatePerformanceIndexes1725023400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Additional performance indexes beyond those in entity migrations

    // Items table - Complex search and filtering queries
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_title_gin 
      ON items USING GIN (to_tsvector('english', title));
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_description_gin 
      ON items USING GIN (to_tsvector('english', description));
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_combined_search 
      ON items USING GIN (to_tsvector('english', title || ' ' || description));
    `);

    // Location-based queries with distance sorting
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_location_active 
      ON items USING GIST (location) 
      WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP;
    `);

    // Hot path queries for active items
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_active_recent 
      ON items (created_at DESC, id) 
      WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP;
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_active_by_category 
      ON items (category_id, created_at DESC) 
      WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP;
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_active_by_location 
      ON items (zip_code, created_at DESC) 
      WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP;
    `);

    // User's items management
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_user_status_recent 
      ON items (user_id, status, created_at DESC);
    `);

    // Expired items cleanup
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_expired_cleanup 
      ON items (expires_at, status) 
      WHERE status = 'active';
    `);

    // Item Claims - FIFO queue performance
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_claims_active_queue_order 
      ON item_claims (item_id, queue_position ASC, created_at ASC) 
      WHERE status IN ('pending', 'contacted');
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_claims_user_active 
      ON item_claims (user_id, status, created_at DESC) 
      WHERE status NOT IN ('completed', 'cancelled');
    `);

    // Claims by item for lister management
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_claims_item_management 
      ON item_claims (item_id, status, queue_position ASC, created_at ASC);
    `);

    // Recent activity tracking
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_claims_recent_activity 
      ON item_claims (updated_at DESC) 
      WHERE status IN ('contacted', 'selected');
    `);

    // Item Images - Gallery and display optimization
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_images_display_order 
      ON item_images (item_id, is_primary DESC, sort_order ASC);
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_images_processing_queue 
      ON item_images (processing_status, created_at ASC) 
      WHERE processing_status IN ('pending', 'processing');
    `);

    // User's image management
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_images_user_recent 
      ON item_images (uploaded_by, created_at DESC);
    `);

    // Categories - Hierarchy and usage optimization
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_categories_hierarchy 
      ON item_categories (parent_id, sort_order ASC, name ASC) 
      WHERE is_active = true;
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_categories_usage_stats 
      ON item_categories (is_active, sort_order) 
      WHERE is_active = true;
    `);

    // Analytics and reporting indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_analytics_daily 
      ON items (DATE(created_at), status);
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_claims_analytics_daily 
      ON item_claims (DATE(created_at), status);
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_popular_categories 
      ON items (category_id, created_at) 
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days';
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_items_popular_locations 
      ON items (zip_code, created_at) 
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all the performance indexes
    const indexes = [
      'IDX_items_title_gin',
      'IDX_items_description_gin', 
      'IDX_items_combined_search',
      'IDX_items_location_active',
      'IDX_items_active_recent',
      'IDX_items_active_by_category',
      'IDX_items_active_by_location',
      'IDX_items_user_status_recent',
      'IDX_items_expired_cleanup',
      'IDX_claims_active_queue_order',
      'IDX_claims_user_active',
      'IDX_claims_item_management',
      'IDX_claims_recent_activity',
      'IDX_images_display_order',
      'IDX_images_processing_queue',
      'IDX_images_user_recent',
      'IDX_categories_hierarchy',
      'IDX_categories_usage_stats',
      'IDX_items_analytics_daily',
      'IDX_claims_analytics_daily',
      'IDX_items_popular_categories',
      'IDX_items_popular_locations',
    ];

    for (const indexName of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${indexName};`);
    }
  }
}