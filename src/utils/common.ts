/**
 * Common utility functions for the backend services.
 */

export class DateUtils {
  /**
   * Formats a date to ISO string.
   * If value is null/undefined, returns current time as ISO string.
   */
  static formatDate(value?: Date | string | null): string {
    if (!value) {
      return new Date().toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  /**
   * Checks if a date is in the past.
   */
  static isPast(date: Date | string): boolean {
    return new Date(date).getTime() < Date.now();
  }

  /**
   * Checks if a date is in the future.
   */
  static isFuture(date: Date | string): boolean {
    return new Date(date).getTime() > Date.now();
  }
}

export class StringUtils {
  /**
   * Capitalizes the first letter of a string.
   */
  static capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Truncates a string to a specified length and appends a suffix.
   */
  static truncate(str: string, length: number, suffix: string = '...'): string {
    if (!str || str.length <= length) return str;
    return str.substring(0, length) + suffix;
  }

  /**
   * Generates a random alphanumeric string of a given length.
   */
  static generateRandomString(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Trims output by removing carriage returns and trailing newlines.
   */
  static trimOutput(output: string): string {
    if (!output) return '';
    return output.replace(/\r/g, '').replace(/\n+$/, '').trim();
  }
}
