#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { config } from 'dotenv';
import axios from 'axios';

// Load environment variables
config();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SANDBOX_URL = process.env.SANDBOX_URL || 'http://localhost:4000';

const processes: Array<{ name: string; process: any; port: number | null }> = [];

async function startService(service: any): Promise<void> {
  console.log(`🚀 Starting ${service.name}...`);

  const proc = spawn(service.command, service.args, {
    stdio: 'pipe',
    shell: true,
  });

  processes.push({
    name: service.name,
    process: proc,
    port: service.port,
  });

  proc.on('error', error => {
    console.error(`❌ Failed to start ${service.name}:`, error);
  });

  proc.on('exit', code => {
    console.log(`📤 ${service.name} exited with code ${code}`);
  });

  // Wait a bit for service to start
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function waitForService(
  url: string,
  serviceName: string,
  maxAttempts: number = 30
): Promise<boolean> {
  console.log(`⏳ Waiting for ${serviceName} to be ready...`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(url, { timeout: 2000 });
      if (response.status === 200) {
        console.log(`✅ ${serviceName} is ready!`);
        return true;
      }
    } catch (error) {
      // Service not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`⚠️  ${serviceName} health check timeout`);
  return false;
}

async function runTests(): Promise<void> {
  console.log('🧪 Running tests...\n');

  const tests = [
    {
      name: 'API Server Health Check',
      fn: async () => {
        const response = await axios.get(`${API_URL}/api/health`);
        if (response.status !== 200) {
          throw new Error('API server health check failed');
        }
      },
    },
    {
      name: 'Sandbox Service Health Check',
      fn: async () => {
        const response = await axios.get(`${SANDBOX_URL}/health`);
        if (response.status !== 200 || response.data.status !== 'healthy') {
          throw new Error('Sandbox service health check failed');
        }
      },
    },
    {
      name: 'Code Execution Test',
      fn: async () => {
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
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`🧪 Running: ${test.name}`);
    const startTime = Date.now();

    try {
      await test.fn();
      const duration = Date.now() - startTime;
      console.log(`✅ ${test.name} - PASSED (${duration}ms)`);
      passed++;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${test.name} - FAILED (${duration}ms): ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / tests.length) * 100).toFixed(2)}%`);
}

async function startAllAndTest(): Promise<void> {
  console.log('🎯 Starting Code Execution Platform and Running Tests...\n');

  const services = [
    {
      name: 'API Server',
      command: 'npm',
      args: ['run', 'dev'],
      port: 3000,
    },
    {
      name: 'Sandbox Service',
      command: 'npm',
      args: ['run', 'dev:sandbox'],
      port: 4000,
    },
    {
      name: 'Worker Service',
      command: 'npm',
      args: ['run', 'dev:worker'],
      port: null,
    },
  ];

  try {
    // Start all services
    for (const service of services) {
      await startService(service);
    }

    // Wait for services to be ready
    console.log('\n🔍 Waiting for services to be ready...\n');

    const apiReady = await waitForService(`${API_URL}/api/health`, 'API Server');
    const sandboxReady = await waitForService(`${SANDBOX_URL}/health`, 'Sandbox Service');

    if (apiReady && sandboxReady) {
      console.log('\n🎉 All services are ready! Running tests...\n');
      await runTests();
    } else {
      console.log('\n❌ Some services failed to start. Skipping tests.');
    }

    console.log('\n🛑 Press Ctrl+C to stop all services');
  } catch (error) {
    console.error('❌ Error during startup:', error);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down all services...`);

  for (const { name, process } of processes) {
    console.log(`🛑 Stopping ${name}...`);
    process.kill('SIGTERM');
  }

  // Wait for processes to exit
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('👋 All services stopped');
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  console.error('❌ Unhandled Rejection:', reason);
});

// Start all services and run tests
startAllAndTest().catch(error => {
  console.error('❌ Failed to start services:', error);
  process.exit(1);
});
