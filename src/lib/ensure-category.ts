import { db } from "@/lib/db";

/**
 * Keep Category catalog in sync with denormalized Product.category strings.
 * Product does not use a FK for POS simplicity; Category is used for backup/reporting lists.
 */
export async function ensureCategoryExists(name: string | null | undefined): Promise<void> {
  const trimmed = name?.trim();
  if (!trimmed) return;

  await db.category.upsert({
    where: { name: trimmed },
    create: { name: trimmed },
    update: {},
  });
}
