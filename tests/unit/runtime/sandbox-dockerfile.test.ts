import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'yaml';

describe('sandbox Dockerfile runtime dependencies', () => {
  it('installs nlohmann-json3-dev for the C++ JSON wrapper', () => {
    const dockerfilePath = path.resolve(process.cwd(), 'docker', 'Dockerfile.sandbox');
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toContain('nlohmann-json3-dev');
  });

  it('installs Jackson libraries for the Java JSON wrapper', () => {
    const dockerfilePath = path.resolve(process.cwd(), 'docker', 'Dockerfile.sandbox');
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toContain('libjackson2-annotations-java');
    expect(dockerfile).toContain('libjackson2-core-java');
    expect(dockerfile).toContain('libjackson2-databind-java');
  });
});

describe('sandbox Java runtime configuration', () => {
  it('uses the Jackson classpath when compiling and running Java wrappers', () => {
    const configPath = path.resolve(process.cwd(), 'config', 'sandbox.yaml');
    const config = yaml.parse(fs.readFileSync(configPath, 'utf8')) as {
      judge: {
        languages: Array<{
          value: string;
          compile?: { command_template: string[] };
          test_case_run: { command_template: string[] };
        }>;
      };
    };
    const java = config.judge.languages.find(language => language.value === 'java');

    expect(java?.compile?.command_template).toEqual([
      'javac',
      '-cp',
      '.:/usr/share/java/*',
      '$SOURCE',
    ]);
    expect(java?.test_case_run.command_template).toContain('-cp');
    expect(java?.test_case_run.command_template).toContain('.:/usr/share/java/*');
  });
});
