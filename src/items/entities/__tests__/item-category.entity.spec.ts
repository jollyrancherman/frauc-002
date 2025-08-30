import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCategory } from '../item-category.entity';
import { Item } from '../item.entity';

describe('ItemCategory Entity', () => {
  let repository: Repository<ItemCategory>;
  let category: ItemCategory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(ItemCategory),
          useClass: Repository,
        },
      ],
    }).compile();

    repository = module.get<Repository<ItemCategory>>(getRepositoryToken(ItemCategory));
  });

  beforeEach(() => {
    category = new ItemCategory();
    category.id = 1;
    category.name = 'Electronics';
    category.slug = 'electronics';
    category.description = 'Electronic devices and gadgets';
    category.iconName = 'computer-desktop';
    category.sortOrder = 1;
    category.isActive = true;
    category.createdAt = new Date('2025-08-30T10:00:00Z');
  });

  describe('Entity Properties', () => {
    it('should have all required properties', () => {
      expect(category.id).toBe(1);
      expect(category.name).toBe('Electronics');
      expect(category.slug).toBe('electronics');
      expect(category.description).toBe('Electronic devices and gadgets');
      expect(category.iconName).toBe('computer-desktop');
      expect(category.sortOrder).toBe(1);
      expect(category.isActive).toBe(true);
    });

    it('should have proper timestamps', () => {
      expect(category.createdAt).toBeInstanceOf(Date);
      expect(category.updatedAt).toBeUndefined(); // Not set until update
    });

    it('should initialize items collection as empty array', () => {
      const newCategory = new ItemCategory();
      expect(newCategory.items).toEqual([]);
    });
  });

  describe('Hierarchical Structure', () => {
    it('should support parent-child relationships', () => {
      const parentCategory = new ItemCategory();
      parentCategory.id = 1;
      parentCategory.name = 'Electronics';

      const childCategory = new ItemCategory();
      childCategory.id = 2;
      childCategory.name = 'Computers';
      childCategory.parent = parentCategory;
      childCategory.parentId = parentCategory.id;

      expect(childCategory.parent).toBe(parentCategory);
      expect(childCategory.parentId).toBe(1);
    });

    it('should handle subcategories collection', () => {
      const subcategory1 = { id: 2, name: 'Laptops', parentId: category.id } as ItemCategory;
      const subcategory2 = { id: 3, name: 'Phones', parentId: category.id } as ItemCategory;
      
      category.subcategories = [subcategory1, subcategory2];
      expect(category.subcategories).toHaveLength(2);
      expect(category.subcategories[0].name).toBe('Laptops');
      expect(category.subcategories[1].name).toBe('Phones');
    });
  });

  describe('Virtual Properties', () => {
    it('should calculate isRootCategory correctly for root category', () => {
      category.parentId = null;
      expect(category.isRootCategory).toBe(true);
    });

    it('should calculate isRootCategory correctly for subcategory', () => {
      category.parentId = 1;
      expect(category.isRootCategory).toBe(false);
    });

    it('should calculate hasSubcategories correctly with subcategories', () => {
      const subcategory = { id: 2, name: 'Laptops' } as ItemCategory;
      category.subcategories = [subcategory];
      expect(category.hasSubcategories).toBe(true);
    });

    it('should calculate hasSubcategories correctly without subcategories', () => {
      category.subcategories = [];
      expect(category.hasSubcategories).toBe(false);
    });

    it('should calculate itemCount correctly', () => {
      const item1 = { id: 1, title: 'Laptop' } as Item;
      const item2 = { id: 2, title: 'Phone' } as Item;
      category.items = [item1, item2];
      expect(category.itemCount).toBe(2);
    });

    it('should return full path for root category', () => {
      category.name = 'Electronics';
      category.parentId = null;
      expect(category.fullPath).toBe('Electronics');
    });
  });

  describe('Helper Methods', () => {
    it('should generate slug from name', () => {
      category.generateSlug();
      expect(category.slug).toBe('electronics');
    });

    it('should generate slug with special characters', () => {
      category.name = 'Home & Garden';
      category.generateSlug();
      expect(category.slug).toBe('home-garden');
    });

    it('should generate slug with numbers', () => {
      category.name = 'Tools & Hardware 2024';
      category.generateSlug();
      expect(category.slug).toBe('tools-hardware-2024');
    });

    it('should activate category', () => {
      category.isActive = false;
      category.activate();
      expect(category.isActive).toBe(true);
    });

    it('should deactivate category', () => {
      category.isActive = true;
      category.deactivate();
      expect(category.isActive).toBe(false);
    });

    it('should update sort order', () => {
      category.updateSortOrder(5);
      expect(category.sortOrder).toBe(5);
    });

    it('should update icon', () => {
      category.updateIcon('mobile-phone');
      expect(category.iconName).toBe('mobile-phone');
    });
  });

  describe('Validation', () => {
    it('should require name', () => {
      category.name = '';
      expect(() => category.validateRequiredFields()).toThrow('Category name is required');
    });

    it('should require slug', () => {
      category.slug = '';
      expect(() => category.validateRequiredFields()).toThrow('Category slug is required');
    });

    it('should validate slug format', () => {
      category.slug = 'Invalid Slug!';
      expect(() => category.validateRequiredFields()).toThrow('Invalid slug format');
    });

    it('should accept valid slug formats', () => {
      const validSlugs = ['electronics', 'home-garden', 'tools-2024', 'a'];
      
      validSlugs.forEach(slug => {
        category.slug = slug;
        expect(() => category.validateRequiredFields()).not.toThrow();
      });
    });

    it('should validate sort order is positive', () => {
      category.sortOrder = -1;
      expect(() => category.validateRequiredFields()).toThrow('Sort order must be positive');
    });

    it('should pass validation with all required fields', () => {
      expect(() => category.validateRequiredFields()).not.toThrow();
    });
  });

  describe('Search and Filtering', () => {
    it('should match search terms in name', () => {
      expect(category.matchesSearch('electr')).toBe(true);
      expect(category.matchesSearch('Electronics')).toBe(true);
      expect(category.matchesSearch('ELECTRONICS')).toBe(true);
    });

    it('should match search terms in description', () => {
      expect(category.matchesSearch('devices')).toBe(true);
      expect(category.matchesSearch('gadgets')).toBe(true);
    });

    it('should not match unrelated search terms', () => {
      expect(category.matchesSearch('clothing')).toBe(false);
      expect(category.matchesSearch('furniture')).toBe(false);
    });

    it('should handle empty search term', () => {
      expect(category.matchesSearch('')).toBe(true);
      expect(category.matchesSearch(null)).toBe(true);
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should generate slug from name before insert', () => {
      const newCategory = new ItemCategory();
      newCategory.name = 'Home & Garden';
      newCategory.beforeInsert();
      
      expect(newCategory.slug).toBe('home-garden');
      expect(newCategory.isActive).toBe(true);
      expect(newCategory.sortOrder).toBeGreaterThan(0);
    });

    it('should update slug when name changes before update', () => {
      category.name = 'Updated Electronics';
      category.beforeUpdate();
      
      expect(category.slug).toBe('updated-electronics');
      expect(category.updatedAt).toBeInstanceOf(Date);
    });

    it('should update timestamp before update', () => {
      const oldDate = new Date('2025-08-29');
      category.updatedAt = oldDate;
      
      category.beforeUpdate();
      expect(category.updatedAt).toBeInstanceOf(Date);
      expect(category.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('Category Statistics', () => {
    it('should calculate usage statistics', () => {
      const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      const item1 = { id: 1, createdAt: recentDate } as Item;
      const item2 = { id: 2, createdAt: oldDate } as Item;
      category.items = [item1, item2];
      
      const stats = category.getUsageStats();
      expect(stats.totalItems).toBe(2);
      expect(stats.recentItems).toBe(1); // Only items from last 7 days
    });
  });
});