export interface SandboxConfig {
  // Server Configuration
  port: number;
  host: string;
  timeout: number;
  maxConcurrent: number;

  // Docker Configuration
  dockerSocket: string;
  workspaceDir: string;

  // Security Configuration
  security: {
    seccompProfile: string;
    apparmorProfile: string;
    user: string;
    group: string;
    capabilities: string[];
    resourceLimits: {
      memory: string;
      memorySwap: string;
      cpus: string;
      processes: number;
      files: number;
      fileSize: string;
    };
  };

  // Language Support
  languages: {
    [key: string]: {
      image: string;
      fileName: string;
      compileCmd?: string;
      runCmd: string;
      needsCompilation: boolean;
    };
  };
}

export const sandboxConfig: SandboxConfig = {
  // Server Configuration
  port: parseInt(process.env.SANDBOX_PORT || '4000'),
  host: process.env.SANDBOX_HOST || 'localhost',
  timeout: parseInt(process.env.SANDBOX_TIMEOUT || '30000'),
  maxConcurrent: parseInt(process.env.SANDBOX_MAX_CONCURRENT || '5'),

  // Docker Configuration
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  workspaceDir: process.env.WORKSPACE_DIR || './workspace',

  // Security Configuration
  security: {
    seccompProfile: process.env.SECCOMP_PROFILE || './security/seccomp.json',
    apparmorProfile: process.env.APPARMOR_PROFILE || 'docker-default',
    user: process.env.SANDBOX_USER || '1000:1000',
    group: process.env.SANDBOX_GROUP || '1000',
    capabilities: ['ALL'],
    resourceLimits: {
      memory: process.env.MEMORY_LIMIT || '256m',
      memorySwap: process.env.MEMORY_SWAP_LIMIT || '256m',
      cpus: process.env.CPU_LIMIT || '1.0',
      processes: parseInt(process.env.PROCESS_LIMIT || '64'),
      files: parseInt(process.env.FILE_LIMIT || '1024'),
      fileSize: process.env.FILE_SIZE_LIMIT || '1m',
    },
  },

  // Language Support
  languages: {
    cpp: {
      image: 'frolvlad/alpine-gxx:latest',
      fileName: 'main.cpp',
      compileCmd: 'g++ -std=c++17 -O2 -static -o /work/solution /work/main.cpp',
      runCmd: '/work/solution',
      needsCompilation: true,
    },
    python: {
      image: 'python:3.11-slim',
      fileName: 'main.py',
      runCmd: 'python3 -u /work/main.py',
      needsCompilation: false,
    },
    java: {
      image: 'openjdk:17-slim',
      fileName: 'Main.java',
      compileCmd: 'javac /work/Main.java',
      runCmd: 'java -cp /work Main',
      needsCompilation: true,
    },
    javascript: {
      image: 'node:18-slim',
      fileName: 'main.js',
      runCmd: 'node /work/main.js',
      needsCompilation: false,
    },
  },
};
