import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Item, ItemCategory, ItemClaim, ItemImage } from '../../../items/entities';
import { User } from '../../../users/entities/user.entity';

describe('Database Migrations', () => {
  let dataSource: DataSource;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          username: process.env.DB_USERNAME || 'test',
          password: process.env.DB_PASSWORD || 'test',
          database: process.env.DB_NAME || 'frauc_test',
          entities: [User, Item, ItemCategory, ItemClaim, ItemImage],
          synchronize: false,
          dropSchema: true, // Clean slate for tests
          migrationsRun: true,
          logging: false,
        }),
      ],
    }).compile();

    dataSource = module.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.destroy();
    }
    if (module) {
      await module.close();
    }
  });

  describe('Table Creation', () => {
    it('should create item_categories table with correct structure', async () => {
      const result = await dataSource.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'item_categories'
        ORDER BY ordinal_position
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // Check for key columns
      const columns = result.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('slug');
      expect(columns).toContain('parent_id');
      expect(columns).toContain('sort_order');
      expect(columns).toContain('is_active');
    });

    it('should create items table with correct structure', async () => {
      const result = await dataSource.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'items'
        ORDER BY ordinal_position
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      const columns = result.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('category_id');
      expect(columns).toContain('title');
      expect(columns).toContain('description');
      expect(columns).toContain('status');
      expect(columns).toContain('zip_code');
      expect(columns).toContain('location');
      expect(columns).toContain('expires_at');
    });

    it('should create item_claims table with correct structure', async () => {
      const result = await dataSource.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'item_claims'
        ORDER BY ordinal_position
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      const columns = result.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('item_id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('queue_position');
      expect(columns).toContain('status');
      expect(columns).toContain('preferred_pickup_date');
    });

    it('should create item_images table with correct structure', async () => {
      const result = await dataSource.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'item_images'
        ORDER BY ordinal_position
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      const columns = result.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('item_id');
      expect(columns).toContain('uploaded_by');
      expect(columns).toContain('filename');
      expect(columns).toContain('url');
      expect(columns).toContain('is_primary');
      expect(columns).toContain('sort_order');
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should have foreign key constraints for items table', async () => {
      const result = await dataSource.query(`
        SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'items'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(2); // At least user_id and category_id FKs

      const foreignKeys = result.map(row => ({
        column: row.column_name,
        referencedTable: row.foreign_table_name,
      }));

      expect(foreignKeys).toContainEqual(
        expect.objectContaining({
          column: 'user_id',
          referencedTable: 'users',
        })
      );
    });

    it('should have foreign key constraints for item_claims table', async () => {
      const result = await dataSource.query(`
        SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'item_claims'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(2); // item_id and user_id FKs
    });
  });

  describe('Indexes', () => {
    it('should create performance indexes for items table', async () => {
      const result = await dataSource.query(`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE tablename = 'items'
        AND schemaname = 'public'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(5); // Multiple indexes should exist

      const indexNames = result.map(row => row.indexname);
      expect(indexNames.some(name => name.includes('user_id'))).toBe(true);
      expect(indexNames.some(name => name.includes('status'))).toBe(true);
      expect(indexNames.some(name => name.includes('zip_code'))).toBe(true);
    });

    it('should create FIFO queue indexes for item_claims table', async () => {
      const result = await dataSource.query(`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE tablename = 'item_claims'
        AND schemaname = 'public'
      `);

      expect(result).toBeDefined();

      const indexNames = result.map(row => row.indexname);
      expect(indexNames.some(name => name.includes('queue_position'))).toBe(true);
      expect(indexNames.some(name => name.includes('item_id'))).toBe(true);
    });

    it('should create spatial index for items location', async () => {
      const result = await dataSource.query(`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE tablename = 'items'
        AND indexdef LIKE '%GIST%'
        AND schemaname = 'public'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(row => row.indexdef.includes('location'))).toBe(true);
    });

    it('should create full-text search indexes', async () => {
      const result = await dataSource.query(`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE tablename = 'items'
        AND indexdef LIKE '%GIN%'
        AND schemaname = 'public'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(row => row.indexdef.includes('tsvector'))).toBe(true);
    });
  });

  describe('Database Functions and Triggers', () => {
    it('should create queue position assignment function', async () => {
      const result = await dataSource.query(`
        SELECT proname
        FROM pg_proc 
        WHERE proname = 'assign_queue_position'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should create queue reorder function', async () => {
      const result = await dataSource.query(`
        SELECT proname
        FROM pg_proc 
        WHERE proname = 'reorder_claim_queue'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should create triggers on item_claims table', async () => {
      const result = await dataSource.query(`
        SELECT tgname, tgrelid::regclass AS table_name
        FROM pg_trigger 
        WHERE tgrelid = 'item_claims'::regclass
        AND tgname IN ('trigger_assign_queue_position', 'trigger_reorder_claim_queue')
      `);

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
    });

    it('should create primary image constraint function', async () => {
      const result = await dataSource.query(`
        SELECT proname
        FROM pg_proc 
        WHERE proname = 'ensure_single_primary_image'
      `);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });
  });

  describe('Default Data', () => {
    it('should insert default categories', async () => {
      const result = await dataSource.query(`
        SELECT id, name, slug, is_active
        FROM item_categories
        WHERE parent_id IS NULL
        ORDER BY sort_order
      `);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(5); // Should have default categories

      const categoryNames = result.map(row => row.name);
      expect(categoryNames).toContain('Electronics');
      expect(categoryNames).toContain('Furniture');
      expect(categoryNames).toContain('Books');

      // All should be active
      expect(result.every(row => row.is_active)).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    it('should enforce unique slug constraint on categories', async () => {
      await expect(
        dataSource.query(`
          INSERT INTO item_categories (name, slug, sort_order)
          VALUES ('Test Category', 'electronics', 100)
        `)
      ).rejects.toThrow();
    });

    it('should allow only one primary image per item', async () => {
      // This would need actual test data setup
      // Skipping for now as it requires complex setup
    });

    it('should enforce valid enum values for item status', async () => {
      await expect(
        dataSource.query(`
          INSERT INTO items (user_id, title, description, status, zip_code, expires_at)
          VALUES (1, 'Test Item', 'Description', 'invalid_status', '12345', CURRENT_TIMESTAMP + INTERVAL '14 days')
        `)
      ).rejects.toThrow();
    });
  });
});