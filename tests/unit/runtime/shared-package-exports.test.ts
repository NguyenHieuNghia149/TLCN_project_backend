import sharedPackage from '../../../packages/shared/package.json';

describe('@backend/shared package exports', () => {
  it('exports database repository subpaths used by production API and worker bundles', () => {
    expect(sharedPackage.exports).toMatchObject({
      './db/repositories/*': './dist/db/repositories/*.js',
    });
  });
});
