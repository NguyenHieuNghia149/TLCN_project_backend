#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config();

const services = [
  {
    name: 'API Server',
    command: 'npm',
    args: ['run', 'dev'],
    port: 3000,
    healthCheck: 'http://localhost:3000/api/health',
  },
  {
    name: 'Sandbox Service',
    command: 'npm',
    args: ['run', 'dev:sandbox'],
    port: 4000,
    healthCheck: 'http://localhost:4000/health',
  },
  {
    name: 'Worker Service',
    command: 'npm',
    args: ['run', 'dev:worker'],
    port: null,
    healthCheck: null,
  },
];

const processes: Array<{ name: string; process: any; port: number | null }> = [];

async function startService(service: any): Promise<void> {
  console.log(`🚀 Starting ${service.name}...`);

  const proc = spawn(service.command, service.args, {
    stdio: 'inherit',
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
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function healthCheck(url: string, serviceName: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch (error) {
    console.log(`⏳ Waiting for ${serviceName} to be ready...`);
    return false;
  }
}

async function waitForServices(): Promise<void> {
  console.log('\n🔍 Waiting for services to be ready...\n');

  for (const service of services) {
    if (service.healthCheck) {
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (attempts < maxAttempts) {
        const isHealthy = await healthCheck(service.healthCheck, service.name);
        if (isHealthy) {
          console.log(`✅ ${service.name} is ready!`);
          break;
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (attempts >= maxAttempts) {
        console.log(`⚠️  ${service.name} health check timeout`);
      }
    }
  }
}

async function startAllServices(): Promise<void> {
  console.log('🎯 Starting Code Execution Platform...\n');

  // Start all services
  for (const service of services) {
    await startService(service);
  }

  // Wait for services to be ready
  await waitForServices();

  console.log('\n🎉 All services started!');
  console.log('\n📋 Service URLs:');
  console.log('   🌐 API Server: http://localhost:3000');
  console.log('   🏗️  Sandbox Service: http://localhost:4000');
  console.log('   👷 Worker Service: Running in background');
  console.log('\n🔗 Health Checks:');
  console.log('   📊 API Health: http://localhost:3000/api/health');
  console.log('   🏗️  Sandbox Health: http://localhost:4000/health');
  console.log('\n🧪 Test Commands:');
  console.log('   🔒 Security Test: npm run test:security');
  console.log('   🏗️  Sandbox Test: npm run test:sandbox');
  console.log('\n📖 Documentation:');
  console.log('   📚 API Docs: http://localhost:3000/');
  console.log('   🏗️  Sandbox Docs: http://localhost:4000/');

  console.log('\n🛑 Press Ctrl+C to stop all services');
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

// Start all services
startAllServices().catch(error => {
  console.error('❌ Failed to start services:', error);
  process.exit(1);
});
