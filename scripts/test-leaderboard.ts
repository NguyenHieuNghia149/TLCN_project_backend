import { LeaderboardService } from '@/services/leaderboard.service';
import { LeaderboardRepository } from '@/repositories/leaderboard.repository';

/**
 * Leaderboard Service Test Examples
 * 
 * These examples demonstrate how to use the leaderboard service
 * in different scenarios.
 */

async function exampleGetLeaderboard() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 1: Get first page of leaderboard
  console.log('=== Example 1: Get Paginated Leaderboard ===');
  const leaderboard = await leaderboardService.getLeaderboard(1, 20);
  console.log(`Total users: ${leaderboard.total}`);
  console.log(`Top 5 users:`);
  leaderboard.entries.slice(0, 5).forEach((entry) => {
    console.log(
      `  ${entry.rank}. ${entry.firstName} ${entry.lastName} - ${entry.rankingPoint} pts (${entry.submissionCount} submissions)`
    );
  });
}

async function exampleGetTopUsers() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 2: Get top 10 users
  console.log('\n=== Example 2: Get Top 10 Users ===');
  const topUsers = await leaderboardService.getTopUsers(10);
  console.log(`Top 10 users:`);
  topUsers.forEach((user) => {
    console.log(
      `  ${user.rank}. ${user.email} - ${user.rankingPoint} pts`
    );
  });
}

async function exampleGetUserRank() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 3: Get specific user's rank
  console.log('\n=== Example 3: Get User Rank ===');
  const userId = '123e4567-e89b-12d3-a456-426614174000'; // Replace with real UUID
  const userRank = await leaderboardService.getUserRank(userId);
  
  if (userRank) {
    console.log(`User Rank Information:`);
    console.log(`  Name: ${userRank.firstName} ${userRank.lastName}`);
    console.log(`  Rank: #${userRank.rank}`);
    console.log(`  Percentile: Top ${userRank.percentile}%`);
    console.log(`  Points: ${userRank.rankingPoint}`);
    console.log(`  Submissions: ${userRank.submissionCount}`);
  } else {
    console.log('User not found or inactive');
  }
}

async function exampleGetRankContext() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 4: Get users around a specific rank
  console.log('\n=== Example 4: Get User Rank Context ===');
  const userId = '123e4567-e89b-12d3-a456-426614174000'; // Replace with real UUID
  const context = await leaderboardService.getUserRankContext(userId, 5);
  
  console.log(`Users around your rank (±5):`);
  context.forEach((user) => {
    console.log(
      `  ${user.rank}. ${user.firstName} ${user.lastName} - ${user.rankingPoint} pts`
    );
  });
}

async function exampleAwardPoints() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 5: Award ranking points to user (after accepted submission)
  console.log('\n=== Example 5: Award Ranking Points ===');
  const userId = '123e4567-e89b-12d3-a456-426614174000'; // Replace with real UUID
  
  try {
    // Award 25 points for a medium difficulty problem
    await leaderboardService.awardRankingPoints(userId, 25);
    console.log(`✓ Awarded 25 points to user`);
    
    // Get updated rank
    const updatedRank = await leaderboardService.getUserRank(userId);
    if (updatedRank) {
      console.log(`  New rank: #${updatedRank.rank} (${updatedRank.rankingPoint} total points)`);
    }
  } catch (error) {
    console.error('Error awarding points:', error);
  }
}

async function exampleSearch() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 6: Search leaderboard
  console.log('\n=== Example 6: Search Leaderboard ===');
  const searchResults = await leaderboardService.getLeaderboard(
    1,
    10,
    'john' // Search for users with "john" in name or email
  );
  
  console.log(`Search results for "john":`);
  searchResults.entries.forEach((entry) => {
    console.log(
      `  ${entry.rank}. ${entry.email} - ${entry.rankingPoint} pts`
    );
  });
}

async function exampleGetStats() {
  const leaderboardRepo = new LeaderboardRepository();
  const leaderboardService = new LeaderboardService(leaderboardRepo);

  // Example 7: Get leaderboard statistics
  console.log('\n=== Example 7: Get Leaderboard Statistics ===');
  const stats = await leaderboardService.getLeaderboardStats();
  
  console.log(`Leaderboard Statistics:`);
  console.log(`  Total Users: ${stats.totalUsers}`);
  if (stats.topUser) {
    console.log(`  Top User: ${stats.topUser.firstName} ${stats.topUser.lastName}`);
    console.log(`    Points: ${stats.topUser.rankingPoint}`);
    console.log(`    Submissions: ${stats.topUser.submissionCount}`);
  }
  console.log(`  Average Points: ${stats.avgRankingPoints}`);
}

/**
 * Run all examples
 * 
 * To use these examples:
 * 1. Uncomment the example function calls you want to run
 * 2. Replace placeholder UUIDs with real user IDs from your database
 * 3. Run: npx ts-node scripts/test-leaderboard.ts
 */
async function runAllExamples() {
  try {
    // Uncomment to run examples:
    // await exampleGetLeaderboard();
    // await exampleGetTopUsers();
    // await exampleGetUserRank();
    // await exampleGetRankContext();
    // await exampleAwardPoints();
    // await exampleSearch();
    // await exampleGetStats();
    
    console.log('\n✓ All examples completed successfully');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Export for use in other files
export {
  exampleGetLeaderboard,
  exampleGetTopUsers,
  exampleGetUserRank,
  exampleGetRankContext,
  exampleAwardPoints,
  exampleSearch,
  exampleGetStats,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}
