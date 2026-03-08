import { FsUtils } from '../../../src/utils/fs';
import * as fs from 'fs';

jest.mock('fs');

describe('FsUtils', () => {
  const mockPath = '/test/path/file.txt';
  const mockContent = 'Hello World';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      FsUtils.ensureDir('/test/dir');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/dir', { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      FsUtils.ensureDir('/test/dir');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('writeFile/readFile', () => {
    it('should call fs.writeFileSync with correct arguments', () => {
      FsUtils.writeFile(mockPath, mockContent);
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockPath, mockContent, 'utf8');
    });

    it('should call fs.readFileSync with correct arguments', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(mockContent);
      const result = FsUtils.readFile(mockPath);
      expect(fs.readFileSync).toHaveBeenCalledWith(mockPath, 'utf8');
      expect(result).toBe(mockContent);
    });
  });

  describe('exists', () => {
    it('should return true if file exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      expect(FsUtils.exists(mockPath)).toBe(true);
    });

    it('should return false if file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(FsUtils.exists(mockPath)).toBe(false);
    });
  });

  describe('remove', () => {
    it('should call fs.rmSync if path exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      FsUtils.remove(mockPath);
      expect(fs.rmSync).toHaveBeenCalledWith(mockPath, { recursive: true, force: true });
    });
  });
});
