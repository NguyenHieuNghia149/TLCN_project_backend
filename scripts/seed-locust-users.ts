#!/usr/bin/env node
/**
 * Seed test users from users.csv via the API.
 * Usage: node seed-locust-users.js
 */
const csv = `email,password,firstName,lastName
student001@example.com,Password123!,Load,Student001
student002@example.com,Password123!,Load,Student002
student003@example.com,Password123!,Load,Student003
student004@example.com,Password123!,Load,Student004
student005@example.com,Password123!,Load,Student005
student006@example.com,Password123!,Load,Student006
student007@example.com,Password123!,Load,Student007
student008@example.com,Password123!,Load,Student008
student009@example.com,Password123!,Load,Student009
student010@example.com,Password123!,Load,Student010
student011@example.com,Password123!,Load,Student011
student012@example.com,Password123!,Load,Student012
student013@example.com,Password123!,Load,Student013
student014@example.com,Password123!,Load,Student014
student015@example.com,Password123!,Load,Student015
student016@example.com,Password123!,Load,Student016
student017@example.com,Password123!,Load,Student017
student018@example.com,Password123!,Load,Student018
student019@example.com,Password123!,Load,Student019
student020@example.com,Password123!,Load,Student020`;

const API = process.env.API_URL || 'http://localhost:3001/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hieunghia484@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '@Hieunghia848';

async function main() {
  // 1. Login as admin to get token
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Login failed (${loginRes.status}): ${text}`);
  }
  const loginData: any = await loginRes.json();
  const token = loginData.data?.tokens?.accessToken;
  if (!token) throw new Error('No access token returned');

  console.log(`✅ Logged in as ${ADMIN_EMAIL}`);

  // 2. Parse CSV and register users
  const lines = csv.trim().split('\n').slice(1); // skip header
  let created = 0;
  let skipped = 0;

  for (const line of lines) {
    const [email, password, firstName, lastName] = line.split(',');
    const registerRes = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, password, passwordConfirm: password, firstName, lastName, role: 'student', otp: '' }),
    });
    if (registerRes.ok) {
      created++;
      console.log(`  ✅ Created: ${email}`);
    } else if (registerRes.status === 409) {
      skipped++;
      console.log(`  ⏭️  Exists: ${email}`);
    } else {
      const text = await registerRes.text();
      console.log(`  ❌ Failed ${email}: ${registerRes.status} ${text}`);
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
