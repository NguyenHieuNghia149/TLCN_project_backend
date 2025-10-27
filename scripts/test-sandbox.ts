#!/usr/bin/env ts-node

import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const SANDBOX_URL = process.env.SANDBOX_URL || 'http://localhost:4000';

interface TestCase {
  name: string;
  config: any;
  expectedResult: 'SUCCESS' | 'FAILURE';
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'C++ Addition',
    config: {
      code: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
      language: 'cpp',
      testcases: [
        { id: '1', input: '5 3', output: '8', point: 10 },
        { id: '2', input: '10 20', output: '30', point: 10 },
      ],
      timeLimit: 1000,
      memoryLimit: '128m',
    },
    expectedResult: 'SUCCESS',
    description: 'Basic C++ arithmetic - should succeed',
  },
  {
    name: 'Python Addition',
    config: {
      code: `a, b = map(int, input().split())
print(a + b)`,
      language: 'python',
      testcases: [
        { id: '1', input: '5 3', output: '8', point: 10 },
        { id: '2', input: '10 20', output: '30', point: 10 },
      ],
      timeLimit: 2000,
      memoryLimit: '256m',
    },
    expectedResult: 'SUCCESS',
    description: 'Basic Python arithmetic - should succeed',
  },
  {
    name: 'Java Addition',
    config: {
      code: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`,
      language: 'java',
      testcases: [
        { id: '1', input: '5 3', output: '8', point: 10 },
        { id: '2', input: '10 20', output: '30', point: 10 },
      ],
      timeLimit: 2000,
      memoryLimit: '256m',
    },
    expectedResult: 'SUCCESS',
    description: 'Basic Java arithmetic - should succeed',
  },
  {
    name: 'JavaScript Addition',
    config: {
      code: `const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (line) => {
    const [a, b] = line.split(' ').map(Number);
    console.log(a + b);
    rl.close();
});`,
      language: 'javascript',
      testcases: [
        { id: '1', input: '5 3', output: '8', point: 10 },
        { id: '2', input: '10 20', output: '30', point: 10 },
      ],
      timeLimit: 2000,
      memoryLimit: '256m',
    },
    expectedResult: 'SUCCESS',
    description: 'Basic JavaScript arithmetic - should succeed',
  },
  {
    name: 'Malicious Code (Fork Bomb)',
    config: {
      code: `#include <unistd.h>
int main() {
    while(1) {
        fork();
    }
    return 0;
}`,
      language: 'cpp',
      testcases: [{ id: '1', input: '5 3', output: '8', point: 10 }],
      timeLimit: 1000,
      memoryLimit: '128m',
    },
    expectedResult: 'FAILURE',
    description: 'Fork bomb - should be blocked by security',
  },
  {
    name: 'System Call Attack',
    config: {
      code: `#include <iostream>
#include <cstdlib>
using namespace std;
int main() {
    system("rm -rf /");
    return 0;
}`,
      language: 'cpp',
      testcases: [{ id: '1', input: '5 3', output: '8', point: 10 }],
      timeLimit: 1000,
      memoryLimit: '128m',
    },
    expectedResult: 'FAILURE',
    description: 'System call attack - should be blocked',
  },
];

async function testSandboxService(): Promise<void> {
  console.log('🧪 Testing Sandbox Service...\n');

  // Test sandbox health
  console.log('🔍 Checking sandbox health...');
  try {
    const healthResponse = await axios.get(`${SANDBOX_URL}/health`);
    console.log(`✅ Sandbox is healthy: ${healthResponse.data.status}`);
  } catch (error) {
    console.error('❌ Sandbox health check failed:', error);
    console.log('Please ensure sandbox service is running: npm run dev:sandbox');
    process.exit(1);
  }

  // Test sandbox status
  console.log('\n📊 Checking sandbox status...');
  try {
    const statusResponse = await axios.get(`${SANDBOX_URL}/api/sandbox/status`);
    console.log(`📈 Active jobs: ${statusResponse.data.data.activeJobs}`);
    console.log(`🔢 Max concurrent: ${statusResponse.data.data.maxConcurrent}`);
    console.log(`💚 Healthy: ${statusResponse.data.data.isHealthy}`);
  } catch (error) {
    console.error('❌ Failed to get sandbox status:', error);
  }

  let passed = 0;
  let failed = 0;

  // Run test cases
  console.log('\n🚀 Running test cases...\n');

  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🎯 Expected: ${testCase.expectedResult}`);

    try {
      const response = await axios.post(`${SANDBOX_URL}/api/sandbox/execute`, testCase.config, {
        timeout: 30000, // 30 seconds timeout
      });

      const actualResult = response.data.success ? 'SUCCESS' : 'FAILURE';
      console.log(`📊 Result: ${actualResult}`);

      if (actualResult === testCase.expectedResult) {
        console.log('✅ PASS');
        passed++;
      } else {
        console.log('❌ FAIL');
        failed++;
      }

      if (response.data.success && response.data.data) {
        const result = response.data.data;
        console.log(`   📈 Passed: ${result.summary.passed}/${result.summary.total}`);
        console.log(`   📊 Success Rate: ${result.summary.successRate}%`);
        console.log(`   ⏱️  Processing Time: ${result.processingTime}ms`);
      } else {
        console.log(`   ❌ Error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      const actualResult = testCase.expectedResult === 'FAILURE' ? 'SUCCESS' : 'FAILURE';
      console.log(`📊 Result: ${actualResult}`);

      if (actualResult === testCase.expectedResult) {
        console.log('✅ PASS (Expected failure)');
        passed++;
      } else {
        console.log('❌ FAIL');
        failed++;
      }

      console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
    }

    console.log(''); // Empty line for readability
  }

  // Print summary
  console.log('='.repeat(60));
  console.log('📊 SANDBOX TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(2)}%`);

  // Test sandbox endpoints
  console.log('\n🔗 Testing sandbox endpoints...');

  try {
    // Test root endpoint
    const rootResponse = await axios.get(`${SANDBOX_URL}/`);
    console.log('✅ Root endpoint working');

    // Test test endpoint
    const testResponse = await axios.get(`${SANDBOX_URL}/api/sandbox/test?language=cpp`);
    console.log('✅ Test endpoint working');
  } catch (error) {
    console.error('❌ Endpoint test failed:', error);
  }

  console.log('\n🎉 Sandbox testing completed!');

  if (failed === 0) {
    console.log('🎊 All tests passed! Sandbox service is working perfectly!');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Check the logs above for details.`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testSandboxService().catch(error => {
    console.error('❌ Sandbox tests failed:', error);
    process.exit(1);
  });
}

export { testSandboxService };
