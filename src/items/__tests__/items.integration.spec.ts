import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { ItemsModule } from '../items.module';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { Item } from '../entities/item.entity';
import { ItemClaim } from '../entities/item-claim.entity';
import { ItemCategory } from '../entities/item-category.entity';
import { User } from '../../users/entities/user.entity';
import { ItemStatus } from '../../common/enums/item-status.enum';
import { ClaimStatus } from '../../common/enums/claim-status.enum';
import { JwtService } from '@nestjs/jwt';

describe('Items Integration Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let authToken: string;
  let testUser: any;
  let testItem: any;
  let testCategory: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          username: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'password',
          database: process.env.DB_NAME_TEST || 'frauc_test',
          entities: [User, Item, ItemClaim, ItemCategory],
          synchronize: true,
          dropSchema: true,
        }),
        AuthModule,
        UsersModule,
        ItemsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    await app.init();

    // Create test user
    testUser = {
      id: 1,
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    // Generate auth token
    authToken = jwtService.sign(testUser);

    // Create test category
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Electronics',
        description: 'Electronic items and gadgets',
      });

    testCategory = { id: 1, name: 'Electronics' };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const queryRunner = app.get('DataSource').createQueryRunner();
    await queryRunner.query('DELETE FROM item_claims');
    await queryRunner.query('DELETE FROM item_images');
    await queryRunner.query('DELETE FROM items');
    await queryRunner.release();
  });

  describe('Complete Item Listing Workflow', () => {
    it('should complete full item lifecycle: create -> list -> claim -> complete', async () => {
      // Step 1: Create a new item listing
      const createItemDto = {
        title: 'Free Laptop - Dell XPS',
        description: 'Working laptop, good for students',
        categoryId: 1,
        zipCode: '12345',
        pickupInstructions: 'Ring doorbell',
        contactMethod: 'email',
        daysUntilExpiration: 14,
      };

      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createItemDto)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toMatchObject({
        title: createItemDto.title,
        description: createItemDto.description,
        status: ItemStatus.ACTIVE,
        userId: testUser.id,
      });

      const itemId = createResponse.body.data.id;

      // Step 2: List and search for the item
      const searchResponse = await request(app.getHttpServer())
        .get('/items')
        .query({ searchTerm: 'laptop', category: 'Electronics' })
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.data.items).toHaveLength(1);
      expect(searchResponse.body.data.items[0].id).toBe(itemId);

      // Step 3: Another user creates a claim
      const claimerUser = {
        id: 2,
        email: 'claimer@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      };
      const claimerToken = jwtService.sign(claimerUser);

      const createClaimDto = {
        contactMethod: 'email',
        notes: 'I really need this for school',
        preferredPickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const claimResponse = await request(app.getHttpServer())
        .post(`/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send(createClaimDto)
        .expect(201);

      expect(claimResponse.body.success).toBe(true);
      expect(claimResponse.body.data).toMatchObject({
        itemId: itemId,
        userId: claimerUser.id,
        status: ClaimStatus.PENDING,
        queuePosition: 1,
      });

      const claimId = claimResponse.body.data.id;

      // Step 4: Check queue information
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(queueResponse.body.success).toBe(true);
      expect(queueResponse.body.data.activeClaims).toBe(1);
      expect(queueResponse.body.data.queue).toHaveLength(1);

      // Step 5: Lister contacts the claimer
      const contactResponse = await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/contact`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'Hi! When would you like to pick this up?' })
        .expect(200);

      expect(contactResponse.body.success).toBe(true);

      // Step 6: Lister selects the claimer
      const selectResponse = await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/select`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(selectResponse.body.success).toBe(true);

      // Step 7: Verify item status changed to claimed
      const itemResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}`)
        .expect(200);

      expect(itemResponse.body.data.status).toBe(ItemStatus.CLAIMED);

      // Step 8: Claimer completes the claim
      const completeResponse = await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/complete`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .expect(200);

      expect(completeResponse.body.success).toBe(true);

      // Step 9: Verify final statuses
      const finalClaimCheck = await request(app.getHttpServer())
        .get(`/items/user/my-claims`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .expect(200);

      const completedClaim = finalClaimCheck.body.data.find(c => c.id === claimId);
      expect(completedClaim.status).toBe(ClaimStatus.COMPLETED);
    });

    it('should handle FIFO queue with multiple claimers', async () => {
      // Create an item
      const createItemDto = {
        title: 'Free Textbooks',
        description: 'College textbooks, various subjects',
        categoryId: 1,
        zipCode: '12345',
        contactMethod: 'email',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createItemDto)
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Create multiple claims from different users
      const users = [
        { id: 2, email: 'user2@test.com', firstName: 'User', lastName: 'Two' },
        { id: 3, email: 'user3@test.com', firstName: 'User', lastName: 'Three' },
        { id: 4, email: 'user4@test.com', firstName: 'User', lastName: 'Four' },
      ];

      const claimIds = [];
      
      for (let i = 0; i < users.length; i++) {
        const userToken = jwtService.sign(users[i]);
        
        const claimResponse = await request(app.getHttpServer())
          .post(`/items/${itemId}/claim`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            contactMethod: 'email',
            notes: `Claim from user ${users[i].id}`,
          })
          .expect(201);

        expect(claimResponse.body.data.queuePosition).toBe(i + 1);
        claimIds.push(claimResponse.body.data.id);
      }

      // Check queue has all claims in correct order
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(queueResponse.body.data.activeClaims).toBe(3);
      expect(queueResponse.body.data.queue).toHaveLength(3);
      
      // Verify queue positions
      queueResponse.body.data.queue.forEach((claim, index) => {
        expect(claim.queuePosition).toBe(index + 1);
        expect(claim.userId).toBe(users[index].id);
      });

      // First user cancels their claim
      const firstUserToken = jwtService.sign(users[0]);
      await request(app.getHttpServer())
        .put(`/items/claims/${claimIds[0]}/cancel`)
        .set('Authorization', `Bearer ${firstUserToken}`)
        .send({ reason: 'Changed my mind' })
        .expect(200);

      // Check that queue positions were adjusted
      const updatedQueueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(updatedQueueResponse.body.data.activeClaims).toBe(2);
      expect(updatedQueueResponse.body.data.queue).toHaveLength(2);
      
      // User 2 should now be position 1, User 3 should be position 2
      const remainingClaims = updatedQueueResponse.body.data.queue;
      expect(remainingClaims[0].userId).toBe(users[1].id);
      expect(remainingClaims[0].queuePosition).toBe(1);
      expect(remainingClaims[1].userId).toBe(users[2].id);
      expect(remainingClaims[1].queuePosition).toBe(2);
    });
  });

  describe('Search and Filtering Integration', () => {
    beforeEach(async () => {
      // Create multiple test items with different categories and locations
      const items = [
        {
          title: 'Free Laptop',
          description: 'Dell laptop for students',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: 'Free Desk Chair',
          description: 'Ergonomic office chair',
          categoryId: 1,
          zipCode: '12346',
          contactMethod: 'phone',
        },
        {
          title: 'Free Books',
          description: 'Programming books collection',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
      ];

      for (const item of items) {
        await request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${authToken}`)
          .send(item)
          .expect(201);
      }
    });

    it('should filter items by search term', async () => {
      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ searchTerm: 'laptop' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].title).toContain('Laptop');
    });

    it('should filter items by location', async () => {
      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ zipCode: '12345' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(2);
    });

    it('should paginate results correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(3);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle duplicate claims from same user', async () => {
      // Create item
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Item',
          description: 'For testing',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Create claim
      const claimerToken = jwtService.sign({
        id: 2,
        email: 'claimer@test.com',
        firstName: 'Test',
        lastName: 'User',
      });

      await request(app.getHttpServer())
        .post(`/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({ contactMethod: 'email' })
        .expect(201);

      // Try to create duplicate claim
      const duplicateResponse = await request(app.getHttpServer())
        .post(`/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({ contactMethod: 'email' })
        .expect(400);

      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error).toContain('already have an active claim');
    });

    it('should handle unauthorized access attempts', async () => {
      // Try to create item without auth
      await request(app.getHttpServer())
        .post('/items')
        .send({
          title: 'Unauthorized Item',
          description: 'Should fail',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(401);

      // Try to access user-specific endpoints without auth
      await request(app.getHttpServer())
        .get('/items/user/my-items')
        .expect(401);

      await request(app.getHttpServer())
        .get('/items/user/my-claims')
        .expect(401);
    });

    it('should handle non-existent resources', async () => {
      // Try to get non-existent item
      await request(app.getHttpServer())
        .get('/items/99999')
        .expect(404);

      // Try to create claim for non-existent item
      const claimerToken = jwtService.sign({
        id: 2,
        email: 'claimer@test.com',
        firstName: 'Test',
        lastName: 'User',
      });

      await request(app.getHttpServer())
        .post('/items/99999/claim')
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({ contactMethod: 'email' })
        .expect(404);
    });

    it('should validate input data', async () => {
      // Try to create item with missing required fields
      const invalidResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: '', // Empty title
          categoryId: 'invalid', // Invalid category
          contactMethod: 'invalid_method', // Invalid contact method
        })
        .expect(400);

      expect(invalidResponse.body.success).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of claims efficiently', async () => {
      // Create an item
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Popular Item',
          description: 'Everyone wants this',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Create many claims concurrently
      const claimPromises = [];
      const numClaims = 50;

      for (let i = 0; i < numClaims; i++) {
        const userToken = jwtService.sign({
          id: i + 100, // Start from 100 to avoid conflicts
          email: `user${i}@test.com`,
          firstName: 'User',
          lastName: `${i}`,
        });

        const promise = request(app.getHttpServer())
          .post(`/items/${itemId}/claim`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            contactMethod: 'email',
            notes: `Claim ${i}`,
          });

        claimPromises.push(promise);
      }

      const startTime = Date.now();
      const results = await Promise.all(claimPromises);
      const endTime = Date.now();

      // All claims should be created successfully
      results.forEach((result, index) => {
        expect(result.status).toBe(201);
        expect(result.body.success).toBe(true);
        expect(result.body.data.queuePosition).toBe(index + 1);
      });

      // Performance check: should complete within reasonable time
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(10000); // Less than 10 seconds

      // Verify queue integrity
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(queueResponse.body.data.activeClaims).toBe(numClaims);
      expect(queueResponse.body.data.queue).toHaveLength(numClaims);
    });

    it('should handle search queries efficiently', async () => {
      // Create many items for search testing
      const itemPromises = [];
      const numItems = 100;

      for (let i = 0; i < numItems; i++) {
        const promise = request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Item ${i} ${i % 2 === 0 ? 'laptop' : 'chair'}`,
            description: `Description for item ${i}`,
            categoryId: 1,
            zipCode: `1234${i % 10}`,
            contactMethod: i % 2 === 0 ? 'email' : 'phone',
          });

        itemPromises.push(promise);
      }

      await Promise.all(itemPromises);

      // Test search performance
      const startTime = Date.now();
      const searchResponse = await request(app.getHttpServer())
        .get('/items')
        .query({ searchTerm: 'laptop', limit: 20 })
        .expect(200);
      const endTime = Date.now();

      const searchTime = endTime - startTime;
      expect(searchTime).toBeLessThan(2000); // Less than 2 seconds

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.data.items.length).toBeGreaterThan(0);
      
      // Verify pagination works with large dataset
      const paginatedResponse = await request(app.getHttpServer())
        .get('/items')
        .query({ page: 2, limit: 10 })
        .expect(200);

      expect(paginatedResponse.body.data.items).toHaveLength(10);
    });
  });
});