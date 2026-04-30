import { getDb } from '@backend/shared/db';
import { roadmaps, roadmapItems, users, lessons } from '@backend/shared/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function seedRoadmaps() {
  const db = getDb();

  try {
    console.log('🌱 Starting roadmap seed...');

    // Get a teacher/owner user
    const teacherUsers = await db
      .select()
      .from(users)
      .where(eq(users.role, 'teacher'))
      .limit(1);

    if (!teacherUsers || teacherUsers.length === 0) {
      console.error('❌ No teacher user found. Please create a teacher account first.');
      process.exit(1);
    }

    const createdBy = teacherUsers[0]!.id;
    console.log(`✅ Using teacher user: ${teacherUsers[0]!.email}`);

    // Get some lessons for roadmap items
    const existingLessons = await db.select().from(lessons).limit(10);

    if (existingLessons.length === 0) {
      console.warn('⚠️  No lessons found. Roadmaps will be created without items.');
    }

    // Create sample roadmaps
    const roadmapSamples = [
      {
        title: 'Web Development Fundamentals',
        description:
          'Master the basics of web development: HTML, CSS, and JavaScript. Perfect for beginners starting their web development journey.',
        visibility: 'public' as const,
      },
      {
        title: 'Advanced TypeScript Patterns',
        description:
          'Learn advanced TypeScript concepts including generics, decorators, and type-safe patterns for enterprise applications.',
        visibility: 'public' as const,
      },
      {
        title: 'React Mastery',
        description:
          'Complete guide to building modern React applications with hooks, context, and state management.',
        visibility: 'private' as const,
      },
      {
        title: 'Database Design & Optimization',
        description: 'Learn database design principles, SQL optimization, and NoSQL concepts.',
        visibility: 'public' as const,
      },
      {
        title: 'DevOps & CI/CD Pipeline',
        description:
          'Master Docker, Kubernetes, and CI/CD pipelines for modern application deployment.',
        visibility: 'private' as const,
      },
    ];

    const createdRoadmaps: Array<{
      id: string;
      title: string;
      visibility: string;
    }> = [];

    for (const sample of roadmapSamples) {
      const roadmapId = uuidv4();
      const newRoadmap = {
        id: roadmapId,
        title: sample.title,
        description: sample.description,
        createdBy,
        visibility: sample.visibility,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.insert(roadmaps).values(newRoadmap).returning();
      if (result[0]) {
        createdRoadmaps.push(result[0]);
        console.log(`✅ Created roadmap: ${sample.title}`);

        // Add sample items to the roadmap
        if (existingLessons.length > 0) {
          const itemsToAdd = existingLessons.slice(0, 3);
          const itemInserts = itemsToAdd.map((lesson, index) => ({
            id: uuidv4(),
            roadmapId: roadmapId,
            itemType: 'lesson' as const,
            itemId: lesson.id,
            order: index + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

          await db.insert(roadmapItems).values(itemInserts);
          console.log(`   📚 Added ${itemsToAdd.length} lessons to roadmap`);
        }
      }
    }

    console.log(`\n✨ Successfully created ${createdRoadmaps.length} sample roadmaps!`);
    console.log('\n📋 Roadmaps created:');
    createdRoadmaps.forEach((roadmap, index) => {
      console.log(
        `   ${index + 1}. ${roadmap.title} (${roadmap.visibility}) - ID: ${roadmap.id}`
      );
    });

    console.log('\n✅ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding roadmaps:', error);
    process.exit(1);
  }
}

seedRoadmaps();

