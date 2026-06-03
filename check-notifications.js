const pg = require('pg');
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.vfbgyuncchgucuufyetd:%40Hieunghia848@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: true,
});

async function checkNotifications() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Query all notifications from last 24 hours
    const result = await client.query(`
      SELECT 
        id,
        user_id,
        type,
        title,
        message,
        metadata,
        is_read,
        created_at
      FROM notifications
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20;
    `);

    console.log(`📊 Found ${result.rows.length} notifications in the last 24 hours:\n`);
    console.log('─'.repeat(120));

    result.rows.forEach((row, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(`  ID: ${row.id}`);
      console.log(`  User ID: ${row.user_id}`);
      console.log(`  Type: ${row.type}`);
      console.log(`  Title: ${row.title}`);
      console.log(`  Message: ${row.message}`);
      console.log(`  Metadata: ${row.metadata ? JSON.stringify(row.metadata, null, 2) : 'None'}`);
      console.log(`  Read: ${row.is_read}`);
      console.log(`  Created: ${row.created_at}`);
    });

    // Count by type
    const typeResult = await client.query(`
      SELECT type, COUNT(*) as count
      FROM notifications
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY type
      ORDER BY count DESC;
    `);

    console.log('\n' + '─'.repeat(120));
    console.log('\n📈 Notifications by type (last 24 hours):');
    typeResult.rows.forEach(row => {
      console.log(`  ${row.type}: ${row.count}`);
    });

    // Check total notifications
    const totalResult = await client.query('SELECT COUNT(*) as count FROM notifications;');
    console.log(`\n📝 Total notifications in database: ${totalResult.rows[0].count}`);

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkNotifications();
