import fs from 'node:fs';
import path from 'node:path';

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map(part => Number.parseInt(part, 10));
  const rightParts = right.split('.').map(part => Number.parseInt(part, 10));
  const partCount = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
};

type LockfilePackageMetadata = {
  version?: string;
  dev?: boolean;
  devOptional?: boolean;
};

const isProductionPackage = (metadata: LockfilePackageMetadata): boolean => !metadata.dev && !metadata.devOptional;

const expectDependencyAtLeast = (
  packages: Record<string, LockfilePackageMetadata>,
  packagePath: string,
  minimum: string,
) => {
  const actual = packages[packagePath]?.version;

  expect(actual).toBeDefined();
  expect(compareVersions(actual as string, minimum)).toBeGreaterThanOrEqual(0);
};

describe('runtime dependency vulnerability floors', () => {
  const lockfile = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockfilePackageMetadata>;
  };

  it('uses fixed runtime versions for Docker Scout high-severity npm findings', () => {
    expectDependencyAtLeast(lockfile.packages, 'node_modules/multer', '2.1.1');
    expectDependencyAtLeast(lockfile.packages, 'node_modules/drizzle-orm', '0.45.2');

    const vulnerablePicomatchPackages = Object.entries(lockfile.packages).filter(([packagePath, metadata]) => {
      if (!packagePath.endsWith('node_modules/picomatch') || !metadata.version?.startsWith('4.0.')) {
        return false;
      }

      return compareVersions(metadata.version, '4.0.4') < 0;
    });

    expect(vulnerablePicomatchPackages).toEqual([]);
  });

  it('keeps production npm dependencies above audited vulnerability floors', () => {
    expectDependencyAtLeast(lockfile.packages, 'node_modules/nodemailer', '8.0.10');
    expectDependencyAtLeast(lockfile.packages, 'node_modules/qs', '6.15.2');
    expectDependencyAtLeast(lockfile.packages, 'node_modules/engine.io', '6.6.8');
    expectDependencyAtLeast(lockfile.packages, 'node_modules/socket.io-adapter', '2.5.7');

    const vulnerableProductionWsPackages = Object.entries(lockfile.packages).filter(([packagePath, metadata]) => {
      if (!packagePath.endsWith('node_modules/ws') || !metadata.version || !isProductionPackage(metadata)) {
        return false;
      }

      return compareVersions(metadata.version, '8.20.1') < 0;
    });

    expect(vulnerableProductionWsPackages).toEqual([]);

    const productionUuidPackages = Object.entries(lockfile.packages).filter(([packagePath, metadata]) => {
      return packagePath.endsWith('node_modules/uuid') && isProductionPackage(metadata);
    });

    expect(productionUuidPackages).toEqual([]);
  });
});
