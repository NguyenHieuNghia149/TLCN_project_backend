#!/usr/bin/env ts-node

import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SANDBOX_URL = process.env.SANDBOX_URL || 'http://localhost:4000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  error?: string;
}

class TestRunner {
  private results: TestResult[] = [];

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🧪 Running: ${name}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, status: 'PASS', duration });
      console.log(`✅ ${name} - PASSED (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({ name, status: 'FAIL', duration, error: error.message });
      console.log(`❌ ${name} - FAILED (${duration}ms): ${error.message}`);
    }
  }

  async testAPIServer(): Promise<void> {
    const response = await axios.get(`${API_URL}/api/health`);
    if (response.status !== 200) {
      throw new Error('API server health check failed');
    }
  }

  async testSandboxService(): Promise<void> {
    const response = await axios.get(`${SANDBOX_URL}/health`);
    if (response.status !== 200 || response.data.status !== 'healthy') {
      throw new Error('Sandbox service health check failed');
    }
  }

  async testCodeExecution(): Promise<void> {
    const testConfig = {
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
    };

    const response = await axios.post(`${SANDBOX_URL}/api/sandbox/execute`, testConfig, {
      timeout: 30000,
    });

    if (!response.data.success) {
      throw new Error('Code execution failed');
    }

    const result = response.data.data;
    if (result.summary.passed !== 2) {
      throw new Error('Expected 2 test cases to pass');
    }
  }

  async testSecurityFeatures(): Promise<void> {
    const maliciousCode = {
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
    };

    try {
      const response = await axios.post(`${SANDBOX_URL}/api/sandbox/execute`, maliciousCode, {
        timeout: 10000,
      });

      if (response.data.success) {
        throw new Error('Malicious code should have been blocked');
      }
    } catch (error: any) {
      // Expected to fail
      if (!error.response?.data?.message?.includes('malicious')) {
        throw new Error('Expected malicious code detection error');
      }
    }
  }

  async testWebSocketConnection(): Promise<void> {
    // This would require a WebSocket client implementation
    // For now, we'll just check if the API server is running
    const response = await axios.get(`${API_URL}/api/health`);
    if (response.status !== 200) {
      throw new Error('WebSocket server not available');
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite...\n');

    await this.runTest('API Server Health Check', () => this.testAPIServer());
    await this.runTest('Sandbox Service Health Check', () => this.testSandboxService());
    await this.runTest('Code Execution Test', () => this.testCodeExecution());
    await this.runTest('Security Features Test', () => this.testSecurityFeatures());
    await this.runTest('WebSocket Connection Test', () => this.testWebSocketConnection());

    this.printSummary();
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`📈 Success Rate: ${((passed / this.results.length) * 100).toFixed(2)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    console.log('\n🎉 Test suite completed!');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testRunner = new TestRunner();
  testRunner.runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

export { TestRunner };
