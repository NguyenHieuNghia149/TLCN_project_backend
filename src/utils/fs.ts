import * as fs from 'fs';
import * as path from 'path';

/**
 * File system utility functions.
 */

export class FsUtils {
  /**
   * Ensures a directory exists, creating it recursively if needed.
   */
  static ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Writes content to a file.
   */
  static writeFile(filePath: string, content: string | Buffer, options: fs.WriteFileOptions = 'utf8'): void {
    fs.writeFileSync(filePath, content, options);
  }

  /**
   * Reads a file's content.
   */
  static readFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
    return fs.readFileSync(filePath, encoding);
  }

  /**
   * Checks if a path exists.
   */
  static exists(path: string): boolean {
    return fs.existsSync(path);
  }

  /**
   * Removes a file or directory recursively.
   */
  static remove(path: string): void {
    if (fs.existsSync(path)) {
      fs.rmSync(path, { recursive: true, force: true });
    }
  }

  /**
   * Sets file permissions.
   */
  static chmod(path: string, mode: number): void {
    fs.chmodSync(path, mode);
  }

  /**
   * Reads a directory's contents.
   */
  static readDir(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }
}
