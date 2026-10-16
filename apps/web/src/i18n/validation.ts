import type { z } from 'zod';
import { enFieldNames } from './en';

/**
 * Zod doğrulama hatasının İngilizcesi (FR-16). Şemalardaki Türkçe metinler sunucuyla ortak ve
 * kaynak metindir; İngilizce arayüz metni hatanın türünden ve alanından yeniden kurar.
 */
export function englishIssue(issue: z.core.$ZodIssue): string {
  const key = typeof issue.path[0] === 'string' ? issue.path[0] : '';
  const field = enFieldNames[key] ?? 'This field';

  switch (issue.code) {
    case 'too_small': {
      const min = String(issue.minimum);
      if (key === 'password') return `Password must be at least ${min} characters.`;
      if (key === 'followUpDays') return `Must be at least ${min} day.`;
      return issue.origin === 'string' ? `${field} cannot be empty.` : `Must be at least ${min}.`;
    }
    case 'too_big': {
      const max = String(issue.maximum);
      if (key === 'password') return `Password can be at most ${max} characters.`;
      if (key === 'followUpDays') return `Can be at most ${max} days.`;
      if (key === 'jobUrl' || key === 'website') return `${field} is too long.`;
      return issue.origin === 'string'
        ? `${field} can be at most ${max} characters.`
        : `Can be at most ${max}.`;
    }
    case 'invalid_format':
      switch (issue.format) {
        case 'email':
          return 'Enter a valid email address.';
        case 'url':
          return `${field} must start with http:// or https://.`;
        case 'date':
          return 'Date must be in YYYY-MM-DD format.';
        case 'datetime':
          return 'Enter a valid date and time.';
        case 'regex':
          if (key === 'recoveryCode') return 'Invalid recovery code format.';
          if (key === 'phone') return 'Phone can only contain digits, spaces and + ( ) -.';
          if (key === 'experience' || key === 'education') {
            return 'Date must be in YYYY or YYYY-MM format.';
          }
          return 'Enter the 6-digit code.';
        default:
          return 'Invalid format.';
      }
    case 'invalid_type':
      if (key === 'followUpDays') {
        return issue.expected === 'int' ? 'Enter a whole number.' : 'Enter a number of days.';
      }
      return 'Enter a valid value.';
    default:
      return 'Invalid value.';
  }
}
