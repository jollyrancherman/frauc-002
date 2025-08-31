import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import { Item } from './item.entity';

@Entity('item_categories')
@Index(['slug'], { unique: true })
@Index(['parentId'])
@Index(['sortOrder'])
@Index(['isActive'])
export class ItemCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'icon_name', length: 50, nullable: true })
  iconName: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => ItemCategory, category => category.subcategories, { 
    nullable: true, 
    onDelete: 'SET NULL' 
  })
  @JoinColumn({ name: 'parent_id' })
  parent: ItemCategory;

  @OneToMany(() => ItemCategory, category => category.parent)
  subcategories: ItemCategory[] = [];

  @OneToMany(() => Item, item => item.category)
  items: Item[] = [];

  // Virtual properties
  get isRootCategory(): boolean {
    return !this.parentId;
  }

  get hasSubcategories(): boolean {
    return this.subcategories && this.subcategories.length > 0;
  }

  get itemCount(): number {
    return this.items ? this.items.length : 0;
  }

  get fullPath(): string {
    if (!this.parent) {
      return this.name;
    }
    return `${this.parent.fullPath} > ${this.name}`;
  }

  // Helper methods
  generateSlug(): void {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }

  activate(): void {
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
  }

  updateSortOrder(order: number): void {
    this.sortOrder = order;
  }

  updateIcon(iconName: string): void {
    this.iconName = iconName;
  }

  matchesSearch(searchTerm: string): boolean {
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    return (
      this.name.toLowerCase().includes(term) ||
      (this.description && this.description.toLowerCase().includes(term))
    );
  }

  getUsageStats(): { totalItems: number; recentItems: number } {
    if (!this.items) {
      return { totalItems: 0, recentItems: 0 };
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentItems = this.items.filter(item => item.createdAt > sevenDaysAgo).length;

    return {
      totalItems: this.items.length,
      recentItems,
    };
  }

  // Validation
  validateRequiredFields(): void {
    if (!this.name || this.name.trim() === '') {
      throw new Error('Category name is required');
    }

    if (!this.slug || this.slug.trim() === '') {
      throw new Error('Category slug is required');
    }

    // Validate slug format (lowercase, alphanumeric, hyphens only)
    const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!slugRegex.test(this.slug)) {
      throw new Error('Invalid slug format. Use lowercase letters, numbers, and hyphens only.');
    }

    if (this.sortOrder < 0) {
      throw new Error('Sort order must be positive');
    }
  }

  // Lifecycle hooks
  @BeforeInsert()
  beforeInsert(): void {
    this.generateSlug();
    if (this.isActive === undefined) {
      this.isActive = true;
    }
    if (!this.sortOrder || this.sortOrder <= 0) {
      this.sortOrder = Date.now();
    }
  }

  @BeforeUpdate()
  beforeUpdate(): void {
    this.generateSlug();
    this.updatedAt = new Date();
  }
}