import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Item, ItemCategory, ItemClaim, ItemImage } from '../index';
import { ItemStatus } from '../../../common/enums/item-status.enum';
import { ClaimStatus } from '../../../common/enums/claim-status.enum';

// Simple test user entity to avoid auth dependencies
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('test_users')
class TestUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

describe('Entity Relationships Integration', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let itemRepository: Repository<Item>;
  let categoryRepository: Repository<ItemCategory>;
  let claimRepository: Repository<ItemClaim>;
  let imageRepository: Repository<ItemImage>;
  let userRepository: Repository<TestUser>;

  // Test data
  let testUser: TestUser;
  let testCategory: ItemCategory;
  let testItem: Item;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [TestUser, Item, ItemCategory, ItemClaim, ItemImage],
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([TestUser, Item, ItemCategory, ItemClaim, ItemImage]),
      ],
    }).compile();

    dataSource = module.get<DataSource>(DataSource);
    itemRepository = module.get<Repository<Item>>(getRepositoryToken(Item));
    categoryRepository = module.get<Repository<ItemCategory>>(getRepositoryToken(ItemCategory));
    claimRepository = module.get<Repository<ItemClaim>>(getRepositoryToken(ItemClaim));
    imageRepository = module.get<Repository<ItemImage>>(getRepositoryToken(ItemImage));
    userRepository = module.get<Repository<TestUser>>(getRepositoryToken(TestUser));
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  beforeEach(async () => {
    // Create test user
    testUser = await userRepository.save(userRepository.create({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      passwordHash: 'hashed_password',
    }));

    // Create test category
    testCategory = await categoryRepository.save(categoryRepository.create({
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices',
    }));

    // Create test item
    testItem = await itemRepository.save(itemRepository.create({
      userId: testUser.id,
      categoryId: testCategory.id,
      title: 'Free Laptop',
      description: 'Old laptop, still works',
      status: ItemStatus.ACTIVE,
      zipCode: '12345',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    }));
  });

  afterEach(async () => {
    // Clean up test data
    await imageRepository.delete({});
    await claimRepository.delete({});
    await itemRepository.delete({});
    await categoryRepository.delete({});
    await userRepository.delete({});
  });

  describe('Item-User Relationship', () => {
    it('should load item with user relationship', async () => {
      const item = await itemRepository.findOne({
        where: { id: testItem.id },
        relations: ['user'],
      });

      expect(item).toBeDefined();
      expect(item.user).toBeDefined();
      expect(item.user.id).toBe(testUser.id);
      expect(item.user.email).toBe('test@example.com');
    });

    it('should cascade delete items when user is deleted', async () => {
      await userRepository.delete({ id: testUser.id });

      const item = await itemRepository.findOne({
        where: { id: testItem.id },
      });

      expect(item).toBeNull();
    });
  });

  describe('Item-Category Relationship', () => {
    it('should load item with category relationship', async () => {
      const item = await itemRepository.findOne({
        where: { id: testItem.id },
        relations: ['category'],
      });

      expect(item).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.category.id).toBe(testCategory.id);
      expect(item.category.name).toBe('Electronics');
    });

    it('should set category to null when category is deleted', async () => {
      await categoryRepository.delete({ id: testCategory.id });

      const item = await itemRepository.findOne({
        where: { id: testItem.id },
        relations: ['category'],
      });

      expect(item).toBeDefined();
      expect(item.categoryId).toBeNull();
      expect(item.category).toBeNull();
    });

    it('should load category with items relationship', async () => {
      const category = await categoryRepository.findOne({
        where: { id: testCategory.id },
        relations: ['items'],
      });

      expect(category).toBeDefined();
      expect(category.items).toBeDefined();
      expect(category.items).toHaveLength(1);
      expect(category.items[0].id).toBe(testItem.id);
    });
  });

  describe('Category Hierarchy', () => {
    it('should support parent-child category relationships', async () => {
      const parentCategory = await categoryRepository.save(categoryRepository.create({
        name: 'Technology',
        slug: 'technology',
      }));

      const childCategory = await categoryRepository.save(categoryRepository.create({
        name: 'Computers',
        slug: 'computers',
        parentId: parentCategory.id,
      }));

      const loadedChild = await categoryRepository.findOne({
        where: { id: childCategory.id },
        relations: ['parent'],
      });

      const loadedParent = await categoryRepository.findOne({
        where: { id: parentCategory.id },
        relations: ['subcategories'],
      });

      expect(loadedChild.parent).toBeDefined();
      expect(loadedChild.parent.id).toBe(parentCategory.id);

      expect(loadedParent.subcategories).toBeDefined();
      expect(loadedParent.subcategories).toHaveLength(1);
      expect(loadedParent.subcategories[0].id).toBe(childCategory.id);
    });
  });

  describe('Item-Claims Relationship (FIFO Queue)', () => {
    it('should create claims in FIFO order', async () => {
      const user2 = await userRepository.save(userRepository.create({
        email: 'user2@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        passwordHash: 'hashed_password',
      }));

      const user3 = await userRepository.save(userRepository.create({
        email: 'user3@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        passwordHash: 'hashed_password',
      }));

      // Create claims in sequence
      const claim1 = await claimRepository.save(claimRepository.create({
        itemId: testItem.id,
        userId: testUser.id,
        queuePosition: 1,
        status: ClaimStatus.PENDING,
        preferredPickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }));

      const claim2 = await claimRepository.save(claimRepository.create({
        itemId: testItem.id,
        userId: user2.id,
        queuePosition: 2,
        status: ClaimStatus.PENDING,
        preferredPickupDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }));

      const claim3 = await claimRepository.save(claimRepository.create({
        itemId: testItem.id,
        userId: user3.id,
        queuePosition: 3,
        status: ClaimStatus.PENDING,
        preferredPickupDate: new Date(Date.now() + 72 * 60 * 60 * 1000),
      }));

      // Load item with claims
      const item = await itemRepository.findOne({
        where: { id: testItem.id },
        relations: ['claims', 'claims.user'],
      });

      expect(item.claims).toBeDefined();
      expect(item.claims).toHaveLength(3);

      // Verify FIFO order
      const sortedClaims = item.claims.sort((a, b) => a.queuePosition - b.queuePosition);
      expect(sortedClaims[0].userId).toBe(testUser.id);
      expect(sortedClaims[1].userId).toBe(user2.id);
      expect(sortedClaims[2].userId).toBe(user3.id);
    });

    it('should load claim with item and user relationships', async () => {
      const claim = await claimRepository.save(claimRepository.create({
        itemId: testItem.id,
        userId: testUser.id,
        queuePosition: 1,
        status: ClaimStatus.PENDING,
      }));

      const loadedClaim = await claimRepository.findOne({
        where: { id: claim.id },
        relations: ['item', 'user'],
      });

      expect(loadedClaim).toBeDefined();
      expect(loadedClaim.item).toBeDefined();
      expect(loadedClaim.item.id).toBe(testItem.id);
      expect(loadedClaim.user).toBeDefined();
      expect(loadedClaim.user.id).toBe(testUser.id);
    });

    it('should cascade delete claims when item is deleted', async () => {
      const claim = await claimRepository.save(claimRepository.create({
        itemId: testItem.id,
        userId: testUser.id,
        queuePosition: 1,
        status: ClaimStatus.PENDING,
      }));

      await itemRepository.delete({ id: testItem.id });

      const deletedClaim = await claimRepository.findOne({
        where: { id: claim.id },
      });

      expect(deletedClaim).toBeNull();
    });
  });

  describe('Item-Images Relationship', () => {
    it('should create images with proper sort order', async () => {
      const image1 = await imageRepository.save(imageRepository.create({
        itemId: testItem.id,
        uploadedBy: testUser.id,
        filename: 'image1.jpg',
        originalFilename: 'IMG_001.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
        width: 1920,
        height: 1080,
        url: 'https://s3.amazonaws.com/bucket/image1.jpg',
        sortOrder: 1,
        isPrimary: true,
      }));

      const image2 = await imageRepository.save(imageRepository.create({
        itemId: testItem.id,
        uploadedBy: testUser.id,
        filename: 'image2.jpg',
        originalFilename: 'IMG_002.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048000,
        width: 1920,
        height: 1080,
        url: 'https://s3.amazonaws.com/bucket/image2.jpg',
        sortOrder: 2,
        isPrimary: false,
      }));

      const item = await itemRepository.findOne({
        where: { id: testItem.id },
        relations: ['images'],
      });

      expect(item.images).toBeDefined();
      expect(item.images).toHaveLength(2);

      const sortedImages = item.images.sort((a, b) => a.sortOrder - b.sortOrder);
      expect(sortedImages[0].isPrimary).toBe(true);
      expect(sortedImages[1].isPrimary).toBe(false);
    });

    it('should load image with item and uploader relationships', async () => {
      const image = await imageRepository.save(imageRepository.create({
        itemId: testItem.id,
        uploadedBy: testUser.id,
        filename: 'test.jpg',
        originalFilename: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
        width: 1920,
        height: 1080,
        url: 'https://s3.amazonaws.com/bucket/test.jpg',
        sortOrder: 1,
      }));

      const loadedImage = await imageRepository.findOne({
        where: { id: image.id },
        relations: ['item', 'uploader'],
      });

      expect(loadedImage).toBeDefined();
      expect(loadedImage.item).toBeDefined();
      expect(loadedImage.item.id).toBe(testItem.id);
      expect(loadedImage.uploader).toBeDefined();
      expect(loadedImage.uploader.id).toBe(testUser.id);
    });

    it('should cascade delete images when item is deleted', async () => {
      const image = await imageRepository.save(imageRepository.create({
        itemId: testItem.id,
        uploadedBy: testUser.id,
        filename: 'test.jpg',
        originalFilename: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
        width: 1920,
        height: 1080,
        url: 'https://s3.amazonaws.com/bucket/test.jpg',
        sortOrder: 1,
      }));

      await itemRepository.delete({ id: testItem.id });

      const deletedImage = await imageRepository.findOne({
        where: { id: image.id },
      });

      expect(deletedImage).toBeNull();
    });
  });

  describe('Complex Relationships', () => {
    it('should load item with all relationships', async () => {
      // Create claim
      const claim = await claimRepository.save(claimRepository.create({
        itemId: testItem.id,
        userId: testUser.id,
        queuePosition: 1,
        status: ClaimStatus.PENDING,
      }));

      // Create image
      const image = await imageRepository.save(imageRepository.create({
        itemId: testItem.id,
        uploadedBy: testUser.id,
        filename: 'test.jpg',
        originalFilename: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
        width: 1920,
        height: 1080,
        url: 'https://s3.amazonaws.com/bucket/test.jpg',
        sortOrder: 1,
        isPrimary: true,
      }));

      const item = await itemRepository.findOne({
        where: { id: testItem.id },
        relations: ['user', 'category', 'claims', 'claims.user', 'images'],
      });

      expect(item).toBeDefined();
      expect(item.user).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.claims).toBeDefined();
      expect(item.claims).toHaveLength(1);
      expect(item.claims[0].user).toBeDefined();
      expect(item.images).toBeDefined();
      expect(item.images).toHaveLength(1);
    });

    it('should handle virtual properties correctly', async () => {
      // Create expired item
      const expiredItem = await itemRepository.save(itemRepository.create({
        userId: testUser.id,
        categoryId: testCategory.id,
        title: 'Expired Item',
        description: 'This item has expired',
        status: ItemStatus.ACTIVE,
        zipCode: '54321',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      }));

      const item = await itemRepository.findOne({
        where: { id: expiredItem.id },
      });

      expect(item.isExpired).toBe(true);
      expect(item.isClaimable).toBe(false);
      expect(item.daysUntilExpiration).toBe(0);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity', async () => {
      // Try to create item with non-existent user
      const invalidItem = itemRepository.create({
        userId: 999999, // Non-existent user
        title: 'Invalid Item',
        description: 'Should fail',
        status: ItemStatus.ACTIVE,
        zipCode: '12345',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      await expect(itemRepository.save(invalidItem)).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      const invalidItem = itemRepository.create({
        userId: testUser.id,
        // Missing required title and description
        status: ItemStatus.ACTIVE,
        zipCode: '12345',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      await expect(itemRepository.save(invalidItem)).rejects.toThrow();
    });
  });
});