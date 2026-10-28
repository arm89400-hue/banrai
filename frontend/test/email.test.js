import { describe, expect, it } from 'vitest';
import { isEmail, mailAppFor } from '../src/lib/email';

describe('email helpers', () => {
  it('checks the shape of an email', () => {
    expect(isEmail('somchai@gmail.com')).toBe(true);
    for (const bad of ['', 'nope', 'a@b', 'a b@c.co']) expect(isEmail(bad)).toBe(false);
  });

  it('knows the webmail for common addresses', () => {
    expect(mailAppFor('a@gmail.com')[1]).toBe('Gmail');
    expect(mailAppFor('a@hotmail.co.th')[1]).toBe('Outlook');
    expect(mailAppFor('a@yahoo.com')[1]).toBe('Yahoo Mail');
    expect(mailAppFor('a@icloud.com')[1]).toBe('iCloud Mail');
    expect(mailAppFor('a@baanrai.th')).toBeUndefined();
  });
});
