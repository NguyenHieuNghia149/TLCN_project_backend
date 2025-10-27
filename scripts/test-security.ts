#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { monitoringService } from '../src/services/monitoring.service';
import { securityService } from '../src/services/security.service';
import { codeExecutionService } from '../src/services/code-execution.service';

// Load environment variables
config();

interface TestCase {
  name: string;
  code: string;
  language: string;
  expectedResult: 'BLOCKED' | 'ALLOWED';
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'Safe C++ Code',
    code: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
    language: 'cpp',
    expectedResult: 'ALLOWED',
    description: 'Basic arithmetic operation - should be allowed',
  },
  {
    name: 'Safe Python Code',
    code: `a, b = map(int, input().split())
print(a + b)`,
    language: 'python',
    expectedResult: 'ALLOWED',
    description: 'Basic arithmetic operation - should be allowed',
  },
  {
    name: 'Fork Bomb Detection',
    code: `#include <unistd.h>
int main() {
    while(1) {
        fork();
    }
    return 0;
}`,
    language: 'cpp',
    expectedResult: 'BLOCKED',
    description: 'Fork bomb - should be blocked',
  },
  {
    name: 'System Call Blocked',
    code: `#include <iostream>
#include <cstdlib>
using namespace std;
int main() {
    system("rm -rf /");
    return 0;
}`,
    language: 'cpp',
    expectedResult: 'BLOCKED',
    description: 'System call to delete files - should be blocked',
  },
  {
    name: 'File System Access Blocked',
    code: `import os
import sys
with open('/etc/passwd', 'r') as f:
    print(f.read())`,
    language: 'python',
    expectedResult: 'BLOCKED',
    description: 'File system access - should be blocked',
  },
  {
    name: 'Network Access Blocked',
    code: `import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('google.com', 80))`,
    language: 'python',
    expectedResult: 'BLOCKED',
    description: 'Network access - should be blocked',
  },
  {
    name: 'Process Execution Blocked',
    code: `import subprocess
result = subprocess.run(['ls', '-la'], capture_output=True, text=True)
print(result.stdout)`,
    language: 'python',
    expectedResult: 'BLOCKED',
    description: 'Process execution - should be blocked',
  },
  {
    name: 'JavaScript Dangerous Code',
    code: `const fs = require('fs');
const { exec } = require('child_process');
exec('rm -rf /', (error, stdout, stderr) => {
    console.log(stdout);
});`,
    language: 'javascript',
    expectedResult: 'BLOCKED',
    description: 'File system and process access - should be blocked',
  },
  {
    name: 'Java System Access',
    code: `import java.io.*;
public class Main {
    public static void main(String[] args) {
        try {
            Runtime.getRuntime().exec("rm -rf /");
        } catch (Exception e) {
            System.out.println("Error");
        }
    }
}`,
    language: 'java',
    expectedResult: 'BLOCKED',
    description: 'Runtime execution - should be blocked',
  },
  {
    name: 'Infinite Loop Warning',
    code: `#include <iostream>
using namespace std;
int main() {
    while(true) {
        cout << "Hello" << endl;
    }
    return 0;
}`,
    language: 'cpp',
    expectedResult: 'ALLOWED',
    description: 'Infinite loop - should be allowed but monitored',
  },
];

async function runSecurityTests(): Promise<void> {
  console.log('🔒 Starting Security Tests...\n');

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let allowed = 0;

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🔤 Language: ${testCase.language}`);
    console.log(`🎯 Expected: ${testCase.expectedResult}`);

    try {
      // Test malicious code detection
      const maliciousEvents = monitoringService.detectMaliciousCode(
        testCase.code,
        testCase.language
      );

      // Test security validation
      let securityValidationPassed = true;
      try {
        securityService.validateCodeSecurity(testCase.code, testCase.language);
      } catch (error) {
        securityValidationPassed = false;
        console.log(`🚫 Security validation failed: ${error}`);
      }

      const isBlocked = maliciousEvents.length > 0 || !securityValidationPassed;
      const actualResult = isBlocked ? 'BLOCKED' : 'ALLOWED';

      console.log(`🔍 Malicious events detected: ${maliciousEvents.length}`);
      if (maliciousEvents.length > 0) {
        maliciousEvents.forEach(event => {
          console.log(`   ⚠️  ${event.severity}: ${event.message}`);
        });
      }

      console.log(`📊 Result: ${actualResult}`);

      if (actualResult === testCase.expectedResult) {
        console.log('✅ PASS');
        passed++;
      } else {
        console.log('❌ FAIL');
        failed++;
      }

      if (actualResult === 'BLOCKED') {
        blocked++;
      } else {
        allowed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error}`);
      failed++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SECURITY TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`🚫 Blocked: ${blocked}`);
  console.log(`✅ Allowed: ${allowed}`);
  console.log(`📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(2)}%`);

  // Get security stats
  const securityStats = monitoringService.getSecurityStats();
  console.log('\n🔒 SECURITY STATISTICS');
  console.log('='.repeat(60));
  console.log(`Total Events: ${securityStats.totalEvents}`);
  console.log(`Events by Type:`, securityStats.eventsByType);
  console.log(`Events by Severity:`, securityStats.eventsBySeverity);

  if (securityStats.recentEvents.length > 0) {
    console.log('\n🚨 RECENT SECURITY EVENTS');
    console.log('='.repeat(60));
    securityStats.recentEvents.forEach(event => {
      console.log(`[${event.severity}] ${event.type}: ${event.message}`);
    });
  }

  console.log('\n🎉 Security tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runSecurityTests().catch(error => {
    console.error('❌ Security tests failed:', error);
    process.exit(1);
  });
}

export { runSecurityTests };
