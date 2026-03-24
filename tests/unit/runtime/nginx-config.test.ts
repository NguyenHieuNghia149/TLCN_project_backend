import fs from 'node:fs';
import path from 'node:path';

describe('nginx runtime upstream resolution', () => {
  it('uses Docker DNS resolver and variable-based proxy_pass for API routing', () => {
    const nginxConfigPath = path.resolve(process.cwd(), 'docker/nginx.conf');
    const nginxConfig = fs.readFileSync(nginxConfigPath, 'utf8');

    expect(nginxConfig).toContain('resolver 127.0.0.11 ipv6=off valid=10s;');
    expect(nginxConfig).toContain('resolver_timeout 5s;');
    expect(nginxConfig).toContain('set $api_backend http://api:3001;');
    expect(nginxConfig).toContain('proxy_pass $api_backend;');
    expect(nginxConfig).toContain('set $sandbox_backend http://sandbox:4000;');
    expect(nginxConfig).toContain('proxy_pass $sandbox_backend/;');
  });
});
