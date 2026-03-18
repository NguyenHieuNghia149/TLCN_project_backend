import { DateUtils, StringUtils } from '@backend/shared/utils';

describe('CommonUtils', () => {
  describe('StringUtils', () => {
    describe('capitalize', () => {
      it('should capitalize the first letter of a string', () => {
        expect(StringUtils.capitalize('hello')).toBe('Hello');
      });
      it('should return empty string if input is empty', () => {
        expect(StringUtils.capitalize('')).toBe('');
      });
    });

    describe('truncate', () => {
      it('should truncate string and add suffix', () => {
        expect(StringUtils.truncate('Hello World', 5)).toBe('Hello...');
      });
      it('should return original string if shorter than limit', () => {
        expect(StringUtils.truncate('Hi', 5)).toBe('Hi');
      });
    });

    describe('generateRandomString', () => {
      it('should generate string with correct length', () => {
        expect(StringUtils.generateRandomString(15)).toHaveLength(15);
      });
      it('should generate different strings', () => {
        const s1 = StringUtils.generateRandomString();
        const s2 = StringUtils.generateRandomString();
        expect(s1).not.toBe(s2);
      });
    });

    describe('trimOutput', () => {
      it('should remove carriage returns and trailing newlines', () => {
        expect(StringUtils.trimOutput('Hello\r\nWorld\n\n')).toBe('Hello\nWorld');
      });
      it('should handle empty input', () => {
        expect(StringUtils.trimOutput('')).toBe('');
      });
    });
  });

  describe('DateUtils', () => {
    describe('formatDate', () => {
      it('should return ISO string for Date object', () => {
        const date = new Date('2026-03-08T10:00:00Z');
        expect(DateUtils.formatDate(date)).toBe('2026-03-08T10:00:00.000Z');
      });
      it('should return current ISO string if input is null', () => {
        const result = DateUtils.formatDate(null);
        expect(new Date(result).getTime()).toBeLessThanOrEqual(Date.now());
      });
    });

    describe('isPast/isFuture', () => {
      it('should correctly identify past/future dates', () => {
        const past = new Date(Date.now() - 100000);
        const future = new Date(Date.now() + 100000);
        expect(DateUtils.isPast(past)).toBe(true);
        expect(DateUtils.isFuture(future)).toBe(true);
      });
    });
  });
});
