import {
  Bus,
  Clapperboard,
  Ellipsis,
  HeartPulse,
  House,
  ShoppingBag,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { categoryLabel } from '@/domain/budget';
import { CategorySchema, type Category } from '@/domain/entities';

/** Options for a category select: every category, with the name the app shows for it. */
export const CATEGORY_OPTIONS = CategorySchema.options.map((c) => ({
  value: c,
  label: categoryLabel(c),
}));

/** The lucide icon each category is drawn with in a list row (Cards' categories, Home's Recent). */
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  food: Utensils,
  transport: Bus,
  rent: House,
  utilities: Zap,
  entertainment: Clapperboard,
  health: HeartPulse,
  shopping: ShoppingBag,
  other: Ellipsis,
};
