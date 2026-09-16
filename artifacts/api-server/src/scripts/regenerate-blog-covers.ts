import { eq, sql } from "drizzle-orm";
import {
  blogArticlesTable,
  blogAuditLogsTable,
  blogCategoriesTable,
  db,
} from "@workspace/db";
import { generateCover } from "../lib/blog-cover-system";
import { composeQuickXchangeCover, uploadCover } from "../routes/blog";

const COMPOSITOR_VERSION = "quickxchange-cover-v3";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const rows = await db
    .select({
      article: blogArticlesTable,
      categoryName: blogCategoriesTable.name,
    })
    .from(blogArticlesTable)
    .innerJoin(blogCategoriesTable, eq(blogCategoriesTable.id, blogArticlesTable.categoryId))
    .where(sql`${blogArticlesTable.generationMetadata}->>'archivedAt' is null`);

  let regenerated = 0;
  let skipped = 0;
  const failures: Array<{ id: string; title: string; reason: string }> = [];

  for (const { article, categoryName } of rows) {
    const priorFeatured = article.featuredImagePath;
    const priorSocial = article.socialImagePath;
    const existingCover = (
      article.generationMetadata?.featuredImage as Record<string, unknown> | undefined
    );

    if (!force && existingCover?.compositorVersion === COMPOSITOR_VERSION) {
      skipped += 1;
      continue;
    }

    try {
      const topic = article.title;
      const design = generateCover({ title: article.title, category: categoryName, topic });
      const bytes = await composeQuickXchangeCover(
        null,
        { title: article.title, category: categoryName },
        topic,
      );
      const path = await uploadCover(bytes);
      const now = new Date();
      const featuredImage = {
        model: "quickxchange-template-system",
        source: "template-system",
        outcome: "uploaded",
        width: 1200,
        height: 675,
        format: "webp",
        compositorVersion: COMPOSITOR_VERSION,
        template: design.template,
        assets: design.detectedAssets,
        regeneratedAt: now.toISOString(),
        previousFeaturedImagePath: priorFeatured,
        previousSocialImagePath: priorSocial,
      };

      await db.transaction(async (tx) => {
        await tx.update(blogArticlesTable).set({
          featuredImagePath: path,
          socialImagePath: path,
          featuredImageAlt: `QuickXchange ${categoryName} cover for ${article.title}.`,
          generationMetadata: {
            ...article.generationMetadata,
            featuredImage,
          },
          updatedAt: now,
        }).where(eq(blogArticlesTable.id, article.id));

        await tx.insert(blogAuditLogsTable).values({
          action: "article.cover_regenerated",
          actorId: "system:quickxchange-cover-v3",
          articleId: article.id,
          details: {
            template: design.template,
            assets: design.detectedAssets,
            compositorVersion: COMPOSITOR_VERSION,
          },
        });
      });
      regenerated += 1;
      console.log(`Regenerated ${article.slug}: ${design.template} [${design.detectedAssets.join(", ") || "geometry"}]`);
    } catch (error) {
      failures.push({
        id: article.id,
        title: article.title,
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  console.log(JSON.stringify({ total: rows.length, regenerated, skipped, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});