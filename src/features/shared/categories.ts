import { categoryLabel } from '@/domain/budget';
import { CategorySchema } from '@/domain/entities';

/** Options for a category select: every category, with the name the app shows for it. */
export const CATEGORY_OPTIONS = CategorySchema.options.map((c) => ({
  value: c,
  label: categoryLabel(c),
}));
