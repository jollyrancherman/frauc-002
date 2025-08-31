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
import { JwtService } from '@nestjs/jwt';

describe('Performance Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let authToken: string;
  let testUser: any;

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
      email: 'performance@test.com',
      firstName: 'Performance',
      lastName: 'Tester',
    };

    authToken = jwtService.sign(testUser);

    // Create test categories
    const categories = [
      'Electronics', 'Furniture', 'Books', 'Clothing', 'Sports',
      'Toys', 'Tools', 'Kitchen', 'Garden', 'Art'
    ];

    for (let i = 0; i < categories.length; i++) {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: categories[i],
          description: `${categories[i]} category for testing`,
        });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    const queryRunner = app.get('DataSource').createQueryRunner();
    await queryRunner.query('DELETE FROM item_claims');
    await queryRunner.query('DELETE FROM items');
    await queryRunner.release();
  });

  describe('Search Performance Tests', () => {
    beforeEach(async () => {
      // Create a large dataset for performance testing
      console.log('Creating large dataset for performance testing...');
      
      const batchSize = 50;
      const totalItems = 1000;
      const batches = Math.ceil(totalItems / batchSize);

      const itemTemplates = [
        { title: 'Laptop Computer', description: 'High performance laptop for work and gaming', keywords: ['laptop', 'computer', 'gaming', 'work'] },
        { title: 'Office Chair', description: 'Ergonomic office chair for long work sessions', keywords: ['chair', 'office', 'furniture', 'ergonomic'] },
        { title: 'Programming Books', description: 'Collection of programming and software development books', keywords: ['books', 'programming', 'software', 'development'] },
        { title: 'Exercise Equipment', description: 'Home gym equipment for fitness enthusiasts', keywords: ['exercise', 'fitness', 'gym', 'sports'] },
        { title: 'Kitchen Appliances', description: 'Various kitchen appliances and cooking tools', keywords: ['kitchen', 'cooking', 'appliances', 'tools'] },
        { title: 'Art Supplies', description: 'Professional art supplies for creative projects', keywords: ['art', 'creative', 'supplies', 'painting'] },
        { title: 'Garden Tools', description: 'Essential tools for gardening and landscaping', keywords: ['garden', 'tools', 'landscaping', 'outdoor'] },
        { title: 'Electronic Gadgets', description: 'Various electronic devices and gadgets', keywords: ['electronics', 'gadgets', 'devices', 'tech'] },
        { title: 'Sporting Goods', description: 'Equipment for various sports and outdoor activities', keywords: ['sports', 'outdoor', 'equipment', 'recreation'] },
        { title: 'Educational Materials', description: 'Learning materials and educational resources', keywords: ['education', 'learning', 'materials', 'school'] },
      ];

      const zipCodes = ['12345', '23456', '34567', '45678', '56789', '67890', '78901', '89012', '90123', '01234'];

      for (let batch = 0; batch < batches; batch++) {
        const promises = [];
        const itemsInBatch = Math.min(batchSize, totalItems - batch * batchSize);

        for (let i = 0; i < itemsInBatch; i++) {
          const templateIndex = (batch * batchSize + i) % itemTemplates.length;
          const template = itemTemplates[templateIndex];
          const itemNumber = batch * batchSize + i + 1;

          const item = {
            title: `${template.title} #${itemNumber}`,
            description: `${template.description} (Item ${itemNumber})`,
            categoryId: (templateIndex % 10) + 1,
            zipCode: zipCodes[itemNumber % zipCodes.length],
            contactMethod: itemNumber % 2 === 0 ? 'email' : 'phone',
            pickupInstructions: `Pickup instructions for item ${itemNumber}`,
            condition: ['new', 'like-new', 'good', 'fair'][itemNumber % 4],
            tags: template.keywords.concat([`tag${itemNumber}`, `batch${batch}`]),
          };

          const promise = request(app.getHttpServer())
            .post('/items')
            .set('Authorization', `Bearer ${authToken}`)
            .send(item);

          promises.push(promise);
        }

        await Promise.all(promises);
        console.log(`Created batch ${batch + 1}/${batches} (${itemsInBatch} items)`);
      }

      console.log(`✓ Created ${totalItems} items for performance testing`);
    });

    it('should handle basic search queries efficiently', async () => {
      console.log('Testing basic search query performance...');

      const searchTerms = ['laptop', 'chair', 'book', 'exercise', 'kitchen'];
      const results = [];

      for (const term of searchTerms) {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
          .get('/items')
          .query({ searchTerm: term, limit: 20 })
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(response.body.success).toBe(true);
        expect(response.body.data.items).toBeDefined();
        expect(response.body.data.total).toBeGreaterThan(0);

        results.push({ term, responseTime, resultCount: response.body.data.total });

        // Performance requirement: basic search should complete within 1 second
        expect(responseTime).toBeLessThan(1000);
      }

      const averageResponseTime = results.reduce((sum, result) => sum + result.responseTime, 0) / results.length;
      console.log(`✓ Average search response time: ${averageResponseTime.toFixed(2)}ms`);
      console.log('Search results:', results);
    });

    it('should handle complex filtered queries efficiently', async () => {
      console.log('Testing complex filtered query performance...');

      const complexQueries = [
        { searchTerm: 'laptop', category: 'Electronics', zipCode: '12345' },
        { searchTerm: 'chair', category: 'Furniture', condition: 'good' },
        { category: 'Books', zipCode: '23456', sortBy: 'created_at', sortOrder: 'DESC' },
        { searchTerm: 'exercise', category: 'Sports', condition: 'new', limit: 10 },
        { zipCode: '34567', sortBy: 'title', sortOrder: 'ASC', limit: 15 },
      ];

      const results = [];

      for (const query of complexQueries) {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
          .get('/items')
          .query(query)
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(response.body.success).toBe(true);
        expect(response.body.data.items).toBeDefined();

        results.push({ 
          query: JSON.stringify(query), 
          responseTime, 
          resultCount: response.body.data.total 
        });

        // Performance requirement: complex queries should complete within 2 seconds
        expect(responseTime).toBeLessThan(2000);
      }

      const averageResponseTime = results.reduce((sum, result) => sum + result.responseTime, 0) / results.length;
      console.log(`✓ Average complex query response time: ${averageResponseTime.toFixed(2)}ms`);
    });

    it('should handle pagination efficiently across large datasets', async () => {
      console.log('Testing pagination performance...');

      const pageSize = 20;
      const totalPages = 10; // Test first 10 pages
      const results = [];

      for (let page = 1; page <= totalPages; page++) {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
          .get('/items')
          .query({ page, limit: pageSize })
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(response.body.success).toBe(true);
        expect(response.body.data.items).toHaveLength(pageSize);

        results.push({ page, responseTime });

        // Performance requirement: pagination should remain efficient
        expect(responseTime).toBeLessThan(1500);
      }

      const averageResponseTime = results.reduce((sum, result) => sum + result.responseTime, 0) / results.length;
      console.log(`✓ Average pagination response time: ${averageResponseTime.toFixed(2)}ms`);

      // Verify performance doesn't degrade significantly on later pages
      const firstPageTime = results[0].responseTime;
      const lastPageTime = results[results.length - 1].responseTime;
      const performanceDegradation = (lastPageTime - firstPageTime) / firstPageTime;

      // Allow up to 50% performance degradation for later pages
      expect(performanceDegradation).toBeLessThan(0.5);
      console.log(`✓ Performance degradation: ${(performanceDegradation * 100).toFixed(2)}%`);
    });

    it('should handle location-based searches efficiently', async () => {
      console.log('Testing location-based search performance...');

      const locationQueries = [
        { lat: 40.7128, lng: -74.0060, radius: 10 }, // New York
        { lat: 34.0522, lng: -118.2437, radius: 25 }, // Los Angeles
        { lat: 41.8781, lng: -87.6298, radius: 15 }, // Chicago
        { lat: 29.7604, lng: -95.3698, radius: 30 }, // Houston
        { lat: 33.4484, lng: -112.0740, radius: 20 }, // Phoenix
      ];

      const results = [];

      for (const locationQuery of locationQueries) {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
          .get('/items/search/nearby')
          .query({ ...locationQuery, limit: 50 })
          .expect(200);

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(response.body.success).toBe(true);

        results.push({ 
          location: `${locationQuery.lat},${locationQuery.lng}`, 
          responseTime, 
          resultCount: response.body.data.length || 0 
        });

        // Performance requirement: location queries should complete within 2 seconds
        expect(responseTime).toBeLessThan(2000);
      }

      const averageResponseTime = results.reduce((sum, result) => sum + result.responseTime, 0) / results.length;
      console.log(`✓ Average location search response time: ${averageResponseTime.toFixed(2)}ms`);
    });

    it('should handle concurrent search requests efficiently', async () => {
      console.log('Testing concurrent search performance...');

      const concurrentRequests = 50;
      const searchQueries = Array.from({ length: concurrentRequests }, (_, i) => ({
        searchTerm: ['laptop', 'chair', 'book', 'exercise', 'kitchen'][i % 5],
        category: ['Electronics', 'Furniture', 'Books', 'Sports', 'Kitchen'][i % 5],
        page: (i % 10) + 1,
        limit: 10,
      }));

      const startTime = Date.now();

      const promises = searchQueries.map(query =>
        request(app.getHttpServer())
          .get('/items')
          .query(query)
          .expect(200)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all requests succeeded
      results.forEach((result, index) => {
        expect(result.body.success).toBe(true);
        expect(result.body.data.items).toBeDefined();
      });

      const averageTimePerRequest = totalTime / concurrentRequests;

      console.log(`✓ Processed ${concurrentRequests} concurrent requests in ${totalTime}ms`);
      console.log(`✓ Average time per concurrent request: ${averageTimePerRequest.toFixed(2)}ms`);

      // Performance requirement: should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(10000); // Total time under 10 seconds
      expect(averageTimePerRequest).toBeLessThan(500); // Average under 500ms per request
    });
  });

  describe('Queue Performance Tests', () => {
    it('should handle large queue operations efficiently', async () => {
      console.log('Testing large queue performance...');

      // Create a popular item
      const itemResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Extremely Popular Item',
          description: 'Everyone wants this item',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = itemResponse.body.data.id;

      // Create a large number of claims
      const numClaims = 500;
      const batchSize = 50;
      const batches = Math.ceil(numClaims / batchSize);

      console.log(`Creating ${numClaims} claims in ${batches} batches...`);

      const allClaimIds = [];
      const allTokens = [];

      for (let batch = 0; batch < batches; batch++) {
        const promises = [];
        const claimsInBatch = Math.min(batchSize, numClaims - batch * batchSize);

        for (let i = 0; i < claimsInBatch; i++) {
          const claimIndex = batch * batchSize + i;
          const claimer = {
            id: claimIndex + 2000,
            email: `largeclaim${claimIndex}@test.com`,
            firstName: `Claimer${claimIndex}`,
            lastName: 'Test',
          };

          const token = jwtService.sign(claimer);
          allTokens.push(token);

          const promise = request(app.getHttpServer())
            .post(`/items/${itemId}/claim`)
            .set('Authorization', `Bearer ${token}`)
            .send({
              contactMethod: 'email',
              notes: `Large queue test claim ${claimIndex}`,
            });

          promises.push(promise);
        }

        const batchResults = await Promise.all(promises);
        
        // Verify all claims in batch succeeded
        batchResults.forEach((result, index) => {
          expect(result.status).toBe(201);
          expect(result.body.success).toBe(true);
          allClaimIds.push(result.body.data.id);
        });

        console.log(`✓ Batch ${batch + 1}/${batches} completed`);
      }

      // Test queue information retrieval performance
      const queueStartTime = Date.now();
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);
      const queueEndTime = Date.now();
      const queueResponseTime = queueEndTime - queueStartTime;

      expect(queueResponse.body.success).toBe(true);
      expect(queueResponse.body.data.activeClaims).toBe(numClaims);
      expect(queueResponse.body.data.queue).toHaveLength(numClaims);

      console.log(`✓ Queue retrieval with ${numClaims} claims: ${queueResponseTime}ms`);

      // Performance requirement: queue operations should remain efficient
      expect(queueResponseTime).toBeLessThan(3000);

      // Test bulk cancellation performance
      const cancellationIndices = [];
      for (let i = 0; i < 100; i++) { // Cancel 100 random claims
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * numClaims);
        } while (cancellationIndices.includes(randomIndex));
        cancellationIndices.push(randomIndex);
      }

      const cancellationStartTime = Date.now();
      const cancellationPromises = cancellationIndices.map(index =>
        request(app.getHttpServer())
          .put(`/items/claims/${allClaimIds[index]}/cancel`)
          .set('Authorization', `Bearer ${allTokens[index]}`)
          .send({ reason: `Bulk cancellation test ${index}` })
      );

      const cancellationResults = await Promise.all(cancellationPromises);
      const cancellationEndTime = Date.now();
      const cancellationTime = cancellationEndTime - cancellationStartTime;

      // Verify all cancellations succeeded
      cancellationResults.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
      });

      console.log(`✓ Bulk cancellation of 100 claims: ${cancellationTime}ms`);
      expect(cancellationTime).toBeLessThan(5000);

      // Verify final queue state
      const finalQueueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(finalQueueResponse.body.data.activeClaims).toBe(numClaims - 100);
      console.log(`✓ Final queue has ${finalQueueResponse.body.data.activeClaims} active claims`);
    });
  });

  describe('Database Performance Tests', () => {
    it('should maintain performance with large datasets', async () => {
      console.log('Testing database performance with large datasets...');

      // This test is already covered by the search performance tests above
      // which create 1000 items and test various query patterns

      // Test analytics query performance
      const analyticsStartTime = Date.now();
      const analyticsResponse = await request(app.getHttpServer())
        .get('/items/analytics/overview')
        .expect(200);
      const analyticsEndTime = Date.now();
      const analyticsTime = analyticsEndTime - analyticsStartTime;

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.data).toBeDefined();

      console.log(`✓ Analytics query performance: ${analyticsTime}ms`);
      expect(analyticsTime).toBeLessThan(2000);

      // Test category listing performance
      const categoriesStartTime = Date.now();
      const categoriesResponse = await request(app.getHttpServer())
        .get('/items/categories/list')
        .expect(200);
      const categoriesEndTime = Date.now();
      const categoriesTime = categoriesEndTime - categoriesStartTime;

      expect(categoriesResponse.body.success).toBe(true);
      expect(categoriesResponse.body.data).toBeDefined();

      console.log(`✓ Categories query performance: ${categoriesTime}ms`);
      expect(categoriesTime).toBeLessThan(500);
    });

    it('should handle stress testing scenarios', async () => {
      console.log('Running stress test scenarios...');

      // Create items rapidly
      const rapidCreationPromises = [];
      const numRapidItems = 100;

      const rapidStartTime = Date.now();
      
      for (let i = 0; i < numRapidItems; i++) {
        const promise = request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Stress Test Item ${i}`,
            description: `Created during stress testing ${i}`,
            categoryId: (i % 10) + 1,
            zipCode: '12345',
            contactMethod: i % 2 === 0 ? 'email' : 'phone',
          });

        rapidCreationPromises.push(promise);
      }

      const rapidResults = await Promise.all(rapidCreationPromises);
      const rapidEndTime = Date.now();
      const rapidCreationTime = rapidEndTime - rapidStartTime;

      // Verify all items were created
      rapidResults.forEach(result => {
        expect(result.status).toBe(201);
        expect(result.body.success).toBe(true);
      });

      console.log(`✓ Rapid item creation: ${numRapidItems} items in ${rapidCreationTime}ms`);
      expect(rapidCreationTime).toBeLessThan(10000);

      // Test mixed operations under load
      const mixedOperationsPromises = [];
      const numMixedOps = 50;

      const mixedStartTime = Date.now();

      for (let i = 0; i < numMixedOps; i++) {
        if (i % 3 === 0) {
          // Search operation
          mixedOperationsPromises.push(
            request(app.getHttpServer())
              .get('/items')
              .query({ searchTerm: 'stress', limit: 10 })
          );
        } else if (i % 3 === 1) {
          // Analytics operation
          mixedOperationsPromises.push(
            request(app.getHttpServer())
              .get('/items/analytics/overview')
          );
        } else {
          // Queue information operation (using first created item)
          mixedOperationsPromises.push(
            request(app.getHttpServer())
              .get(`/items/${rapidResults[0].body.data.id}/queue`)
          );
        }
      }

      const mixedResults = await Promise.all(mixedOperationsPromises);
      const mixedEndTime = Date.now();
      const mixedOperationsTime = mixedEndTime - mixedStartTime;

      // Verify all operations succeeded
      mixedResults.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
      });

      console.log(`✓ Mixed operations under load: ${numMixedOps} operations in ${mixedOperationsTime}ms`);
      expect(mixedOperationsTime).toBeLessThan(8000);
    });
  });

  describe('Memory and Resource Usage Tests', () => {
    it('should not leak memory during intensive operations', async () => {
      console.log('Testing memory usage during intensive operations...');

      const initialMemory = process.memoryUsage();
      console.log('Initial memory usage:', {
        rss: `${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      });

      // Perform intensive operations
      for (let iteration = 0; iteration < 5; iteration++) {
        console.log(`Memory test iteration ${iteration + 1}/5`);

        // Create many items
        const promises = [];
        for (let i = 0; i < 100; i++) {
          promises.push(
            request(app.getHttpServer())
              .post('/items')
              .set('Authorization', `Bearer ${authToken}`)
              .send({
                title: `Memory Test Item ${iteration}-${i}`,
                description: `Memory testing iteration ${iteration} item ${i}`,
                categoryId: (i % 10) + 1,
                zipCode: '12345',
                contactMethod: 'email',
              })
          );
        }

        await Promise.all(promises);

        // Perform searches
        const searchPromises = [];
        for (let i = 0; i < 20; i++) {
          searchPromises.push(
            request(app.getHttpServer())
              .get('/items')
              .query({ searchTerm: 'memory', limit: 50 })
          );
        }

        await Promise.all(searchPromises);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        const currentMemory = process.memoryUsage();
        console.log(`Iteration ${iteration + 1} memory usage:`, {
          rss: `${(currentMemory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(currentMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        });
      }

      const finalMemory = process.memoryUsage();
      console.log('Final memory usage:', {
        rss: `${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(finalMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      });

      // Memory should not increase dramatically (allow for some normal growth)
      const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / initialMemory.heapUsed;
      console.log(`Memory growth: ${(memoryGrowth * 100).toFixed(2)}%`);

      // Allow up to 100% memory growth (this is quite generous for intensive operations)
      expect(memoryGrowth).toBeLessThan(1.0);
    });
  });

  describe('Response Time SLA Tests', () => {
    it('should meet performance SLA requirements', async () => {
      console.log('Testing SLA compliance...');

      const slaTests = [
        {
          name: 'Basic Item Search',
          operation: () => request(app.getHttpServer()).get('/items').query({ limit: 20 }),
          maxTime: 500, // 500ms SLA
        },
        {
          name: 'Item Details',
          operation: async () => {
            // First create an item to retrieve
            const createResponse = await request(app.getHttpServer())
              .post('/items')
              .set('Authorization', `Bearer ${authToken}`)
              .send({
                title: 'SLA Test Item',
                description: 'For SLA testing',
                categoryId: 1,
                zipCode: '12345',
                contactMethod: 'email',
              });
            
            return request(app.getHttpServer()).get(`/items/${createResponse.body.data.id}`);
          },
          maxTime: 300, // 300ms SLA
        },
        {
          name: 'Categories List',
          operation: () => request(app.getHttpServer()).get('/items/categories/list'),
          maxTime: 200, // 200ms SLA
        },
        {
          name: 'Analytics Overview',
          operation: () => request(app.getHttpServer()).get('/items/analytics/overview'),
          maxTime: 1000, // 1s SLA for analytics
        },
      ];

      const results = [];

      for (const test of slaTests) {
        const measurements = [];
        const numMeasurements = 10;

        console.log(`Testing SLA for: ${test.name}`);

        for (let i = 0; i < numMeasurements; i++) {
          const startTime = Date.now();
          const response = await test.operation();
          const endTime = Date.now();
          const responseTime = endTime - startTime;

          expect(response.status).toBe(200);
          measurements.push(responseTime);
        }

        const averageTime = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
        const maxTime = Math.max(...measurements);
        const minTime = Math.min(...measurements);
        const p95Time = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];

        results.push({
          name: test.name,
          sla: test.maxTime,
          average: averageTime,
          min: minTime,
          max: maxTime,
          p95: p95Time,
          passedSLA: p95Time <= test.maxTime,
        });

        console.log(`${test.name}: Avg=${averageTime.toFixed(2)}ms, P95=${p95Time}ms, SLA=${test.maxTime}ms`);

        // SLA check: 95th percentile should be within SLA
        expect(p95Time).toBeLessThanOrEqual(test.maxTime);
      }

      console.log('\n✓ SLA Results Summary:');
      results.forEach(result => {
        const status = result.passedSLA ? '✓' : '✗';
        console.log(`${status} ${result.name}: ${result.p95}ms <= ${result.sla}ms`);
      });
    });
  });
});