import { getPrisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface ToxicStoryItem {
  id: string;
  orderId: string | null;
  authorName: string;
  jobRole: string | null;
  sloganSlug: string | null;
  storyText: string;
  verifiedBuyer: boolean;
  likesCount: number;
  createdAt: Date;
}

/**
 * Load published toxic boss stories ordered by verified status and likes count.
 */
export async function loadPublishedStories(): Promise<ToxicStoryItem[]> {
  try {
    const prisma = getPrisma();
    const records = await prisma.toxicBossStory.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [
        { verifiedBuyer: 'desc' },
        { likesCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 12,
    });

    return records.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      authorName: r.authorName,
      jobRole: r.jobRole,
      sloganSlug: r.sloganSlug,
      storyText: r.storyText,
      verifiedBuyer: r.verifiedBuyer,
      likesCount: r.likesCount,
      createdAt: r.createdAt,
    }));
  } catch (err) {
    console.error('Failed to load published stories:', err);
    return [];
  }
}

/**
 * Submit a new toxic boss story. Checks optional order ID to grant "Verified Survivor" badge!
 */
export async function submitStoryAction(formData: FormData): Promise<{ success: boolean; message?: string }> {
  'use server';

  const authorName = (formData.get('authorName') as string || 'Anonymous').trim();
  const jobRole = (formData.get('jobRole') as string || '').trim();
  const sloganSlug = (formData.get('sloganSlug') as string || '').trim();
  const storyText = (formData.get('storyText') as string || '').trim();
  const rawOrderId = (formData.get('orderId') as string || '').trim();

  if (!storyText || storyText.length < 10) {
    return { success: false, message: 'Story text must be at least 10 characters long.' };
  }

  const prisma = getPrisma();
  let verifiedBuyer = false;
  let cleanOrderId: string | null = null;

  if (rawOrderId.length > 0) {
    cleanOrderId = rawOrderId.toUpperCase();
    try {
      // Check if order exists in database
      const existingOrder = await prisma.order.findUnique({
        where: { id: cleanOrderId },
      });
      if (existingOrder) {
        verifiedBuyer = true;
      }
    } catch {
      // Ignore DB lookup error
    }
  }

  try {
    await prisma.toxicBossStory.create({
      data: {
        authorName: authorName || 'Anonymous Survivor',
        jobRole: jobRole || null,
        sloganSlug: sloganSlug || null,
        storyText,
        orderId: cleanOrderId,
        verifiedBuyer,
        status: 'PUBLISHED', // Auto-publish for immediate feedback
      },
    });

    revalidatePath('/');
    return { success: true, message: verifiedBuyer ? 'Story published with Verified Survivor badge! 🏷️' : 'Story published successfully!' };
  } catch (err) {
    console.error('Failed to save story:', err);
    return { success: false, message: 'Failed to submit story. Please try again.' };
  }
}

/**
 * Upvote / Relate to a story
 */
export async function upvoteStoryAction(formData: FormData): Promise<void> {
  'use server';

  const storyId = (formData.get('storyId') as string || '').trim();
  if (!storyId) return;

  try {
    const prisma = getPrisma();
    await prisma.toxicBossStory.update({
      where: { id: storyId },
      data: { likesCount: { increment: 1 } },
    });
    revalidatePath('/');
  } catch (err) {
    console.error('Failed to upvote story:', err);
  }
}
