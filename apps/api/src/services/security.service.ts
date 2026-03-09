import { BaseException } from '@/exceptions/auth.exceptions';
import * as fs from 'fs';
import * as path from 'path';

export interface SecurityProfile {
  seccomp: any;
  apparmor: string;
  capabilities: string[];
  ulimits: {
    nproc: number;
    nofile: number;
    fsize: number;
    cpu: number;
  };
}

export class SecurityService {
  private securityDir: string;
  private seccompProfile: any;

  constructor() {
    this.securityDir = path.join(process.cwd(), 'security');
    this.ensureSecurityDir();
    this.initializeSeccompProfile();
  }

  private ensureSecurityDir(): void {
    if (!fs.existsSync(this.securityDir)) {
      fs.mkdirSync(this.securityDir, { recursive: true });
    }
  }

  private initializeSeccompProfile(): void {
    // Create a restrictive seccomp profile
    this.seccompProfile = {
      defaultAction: 'SCMP_ACT_ERRNO',
      architectures: ['SCMP_ARCH_X86_64', 'SCMP_ARCH_X86', 'SCMP_ARCH_X32'],
      syscalls: [
        {
          names: [
            'accept',
            'accept4',
            'access',
            'adjtimex',
            'alarm',
            'bind',
            'brk',
            'capget',
            'capset',
            'chdir',
            'chmod',
            'chown',
            'chroot',
            'clock_getres',
            'clock_gettime',
            'clock_nanosleep',
            'close',
            'connect',
            'copy_file_range',
            'creat',
            'dup',
            'dup2',
            'dup3',
            'epoll_create',
            'epoll_create1',
            'epoll_ctl',
            'epoll_pwait',
            'epoll_wait',
            'eventfd',
            'eventfd2',
            'execve',
            'execveat',
            'exit',
            'exit_group',
            'faccessat',
            'fadvise64',
            'fallocate',
            'fchdir',
            'fchmod',
            'fchmodat',
            'fchown',
            'fchownat',
            'fcntl',
            'fdatasync',
            'fgetxattr',
            'flistxattr',
            'flock',
            'fork',
            'fremovexattr',
            'fsetxattr',
            'fstat',
            'fstatfs',
            'fsync',
            'ftruncate',
            'futex',
            'getcwd',
            'getdents',
            'getdents64',
            'getegid',
            'geteuid',
            'getgid',
            'getgroups',
            'getpeername',
            'getpgid',
            'getpgrp',
            'getpid',
            'getppid',
            'getpriority',
            'getrandom',
            'getresgid',
            'getresuid',
            'getrlimit',
            'get_robust_list',
            'getrusage',
            'getsid',
            'getsockname',
            'getsockopt',
            'get_thread_area',
            'gettid',
            'gettimeofday',
            'getuid',
            'getxattr',
            'get_mempolicy',
            'init_module',
            'inotify_add_watch',
            'inotify_init',
            'inotify_init1',
            'inotify_rm_watch',
            'io_cancel',
            'ioctl',
            'io_destroy',
            'io_getevents',
            'ioprio_get',
            'ioprio_set',
            'io_setup',
            'io_submit',
            'ipc',
            'kill',
            'lchown',
            'lgetxattr',
            'link',
            'linkat',
            'listen',
            'listxattr',
            'llistxattr',
            'lremovexattr',
            'lseek',
            'lsetxattr',
            'lstat',
            'madvise',
            'mincore',
            'mkdir',
            'mkdirat',
            'mknod',
            'mknodat',
            'mlock',
            'mlockall',
            'mmap',
            'mmap2',
            'mprotect',
            'mq_getsetattr',
            'mq_notify',
            'mq_open',
            'mq_timedreceive',
            'mq_timedsend',
            'mq_unlink',
            'mremap',
            'msgctl',
            'msgget',
            'msgrcv',
            'msgsnd',
            'msync',
            'munlock',
            'munlockall',
            'munmap',
            'nanosleep',
            'newfstatat',
            '_newselect',
            'open',
            'openat',
            'pause',
            'pipe',
            'pipe2',
            'poll',
            'ppoll',
            'prctl',
            'pread64',
            'preadv',
            'prlimit64',
            'pselect6',
            'ptrace',
            'pwrite64',
            'pwritev',
            'read',
            'readahead',
            'readlink',
            'readlinkat',
            'readv',
            'reboot',
            'recv',
            'recvfrom',
            'recvmmsg',
            'recvmsg',
            'remap_file_pages',
            'removexattr',
            'rename',
            'renameat',
            'renameat2',
            'restart_syscall',
            'rmdir',
            'rt_sigaction',
            'rt_sigpending',
            'rt_sigprocmask',
            'rt_sigqueueinfo',
            'rt_sigreturn',
            'rt_sigsuspend',
            'rt_sigtimedwait',
            'rt_sigwaitinfo',
            'rt_tgsigqueueinfo',
            'sched_get_priority_max',
            'sched_get_priority_min',
            'sched_getaffinity',
            'sched_getparam',
            'sched_getscheduler',
            'sched_rr_get_interval',
            'sched_setaffinity',
            'sched_setparam',
            'sched_setscheduler',
            'sched_yield',
            'seccomp',
            'select',
            'send',
            'sendfile',
            'sendmmsg',
            'sendmsg',
            'sendto',
            'setfsgid',
            'setfsuid',
            'setgid',
            'setgroups',
            'setitimer',
            'setpgid',
            'setpriority',
            'setregid',
            'setresgid',
            'setresuid',
            'setreuid',
            'setrlimit',
            'set_robust_list',
            'setsid',
            'setsockopt',
            'set_thread_area',
            'set_tid_address',
            'setuid',
            'setxattr',
            'set_mempolicy',
            'shmat',
            'shmctl',
            'shmdt',
            'shmget',
            'shutdown',
            'sigaltstack',
            'signalfd',
            'signalfd4',
            'sigreturn',
            'socket',
            'socketcall',
            'socketpair',
            'splice',
            'stat',
            'statfs',
            'symlink',
            'symlinkat',
            'sync',
            'sync_file_range',
            'syncfs',
            'sysinfo',
            'syslog',
            'tee',
            'tgkill',
            'time',
            'timer_create',
            'timer_delete',
            'timerfd_create',
            'timerfd_gettime',
            'timerfd_settime',
            'timer_getoverrun',
            'timer_gettime',
            'timer_settime',
            'times',
            'tkill',
            'truncate',
            'umask',
            'uname',
            'unlink',
            'unlinkat',
            'utime',
            'utimensat',
            'utimes',
            'vfork',
            'vmsplice',
            'wait4',
            'waitid',
            'waitpid',
            'write',
            'writev',
          ],
          action: 'SCMP_ACT_ALLOW',
        },
        {
          names: [
            'acct',
            'add_key',
            'bpf',
            'clock_adjtime',
            'clock_settime',
            'create_module',
            'delete_module',
            'fanotify_init',
            'fanotify_mark',
            'finit_module',
            'get_kernel_syms',
            'get_mempolicy',
            'getpmsg',
            'getppid',
            'ioctl',
            'iopl',
            'ioprio_get',
            'ioprio_set',
            'kcmp',
            'kexec_file_load',
            'kexec_load',
            'keyctl',
            'lookup_dcookie',
            'mbind',
            'migrate_pages',
            'move_pages',
            'name_to_handle_at',
            'nfsservctl',
            'open_by_handle_at',
            'perf_event_open',
            'personality',
            'pivot_root',
            'process_vm_readv',
            'process_vm_writev',
            'ptrace',
            'query_module',
            'quotactl',
            'readahead',
            'reboot',
            'request_key',
            'setdomainname',
            'sethostname',
            'setns',
            'swapoff',
            'swapon',
            'sysfs',
            'syslog',
            'timerfd_create',
            'timerfd_gettime',
            'timerfd_settime',
            'tuxcall',
            'umount',
            'umount2',
            'unshare',
            'uselib',
            'userfaultfd',
            'ustat',
            'vhangup',
            'vserver',
            'waitid',
            'write',
          ],
          action: 'SCMP_ACT_ERRNO',
        },
      ],
    };

    // Write seccomp profile to file
    const seccompPath = path.join(this.securityDir, 'seccomp.json');
    fs.writeFileSync(seccompPath, JSON.stringify(this.seccompProfile, null, 2));
  }

  getSecurityProfile(): SecurityProfile {
    return {
      seccomp: this.seccompProfile,
      apparmor: 'docker-default',
      capabilities: [],
      ulimits: {
        nproc: 64,
        nofile: 1024,
        fsize: 1048576, // 1MB
        cpu: 30, // 30 seconds
      },
    };
  }

  getSeccompProfilePath(): string {
    return path.join(this.securityDir, 'seccomp.json');
  }

  /**
   * Validate code for additional security threats
   */
  validateCodeSecurity(code: string, language: string): void {
    // Check for potential buffer overflow attempts
    const bufferOverflowPatterns = [
      /strcpy\s*\(/gi,
      /strcat\s*\(/gi,
      /sprintf\s*\(/gi,
      /gets\s*\(/gi,
      /scanf\s*\(/gi,
    ];

    for (const pattern of bufferOverflowPatterns) {
      if (pattern.test(code)) {
        throw new BaseException(
          `Code contains potentially unsafe function: ${pattern.source}`,
          400,
          'UNSAFE_CODE_DETECTED'
        );
      }
    }

    // Check for infinite loop patterns
    const infiniteLoopPatterns = [
      /while\s*\(\s*true\s*\)/gi,
      /for\s*\(\s*;\s*;\s*\)/gi,
      /while\s*\(\s*1\s*\)/gi,
    ];

    for (const pattern of infiniteLoopPatterns) {
      if (pattern.test(code)) {
        // Silent check for infinite loop patterns
      }
    }

    // Check for recursion depth
    const recursionPatterns = [
      /function\s+\w+\s*\([^)]*\)\s*{[^}]*\w+\s*\([^}]*\)/gi,
      /def\s+\w+\s*\([^)]*\):[^:]*\w+\s*\([^)]*\)/gi,
    ];

    for (const pattern of recursionPatterns) {
      if (pattern.test(code)) {
        // Silent check for recursion patterns
      }
    }
  }

  /**
   * Generate secure Docker run arguments
   */
  generateSecureDockerArgs(
    image: string,
    command: string,
    memoryLimit: string,
    timeLimit: number,
    workDir: string
  ): string[] {
    const profile = this.getSecurityProfile();

    return [
      'run',
      '--rm',
      '--memory',
      memoryLimit,
      '--memory-swap',
      memoryLimit, // Disable swap
      '--cpus',
      '1.0',
      '--network',
      'none',
      '--read-only',
      '--tmpfs',
      '/tmp:size=50m,noexec,nosuid,nodev',
      '--user',
      '1000:1000',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--security-opt=seccomp=' + this.getSeccompProfilePath(),
      '--security-opt=apparmor=' + profile.apparmor,
      '--ulimit',
      `nproc=${profile.ulimits.nproc}`,
      '--ulimit',
      `nofile=${profile.ulimits.nofile}`,
      '--ulimit',
      `fsize=${profile.ulimits.fsize}`,
      '--ulimit',
      `cpu=${profile.ulimits.cpu}`,
      '-v',
      `${workDir}:/work:ro`,
      image,
      'timeout',
      `${timeLimit}s`,
      'bash',
      '-c',
      command,
    ];
  }

  /**
   * Monitor resource usage during execution
   */
  async monitorResourceUsage(processId: string): Promise<{
    memory: number;
    cpu: number;
    duration: number;
  }> {
    // This would integrate with system monitoring tools
    // For now, return mock data
    return {
      memory: 0,
      cpu: 0,
      duration: 0,
    };
  }

  /**
   * Clean up security resources
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.securityDir)) {
        fs.rmSync(this.securityDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Silent error handling for cleanup
    }
  }
}

// Singleton instance
export const securityService = new SecurityService();
