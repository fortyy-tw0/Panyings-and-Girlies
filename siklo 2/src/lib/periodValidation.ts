import { compareDates, todayLocal } from './calendarDate';
import type { PeriodAnswer } from '../types/profile';

export type PeriodErrors = {
  start?: string;
  end?: string;
};

/**
 * Checks the complete period answer. Invalid combinations are explained to the
 * person; nothing is silently replaced with a different date.
 */
export const validatePeriod = (period: PeriodAnswer, today = todayLocal()): PeriodErrors => {
  if (period.kind !== 'known') return {};

  const errors: PeriodErrors = {};

  if (compareDates(period.start, today) > 0) {
    errors.start = 'The start date is after today. Choose an observed date.';
  }

  if (period.end) {
    if (period.ongoing) {
      errors.end = 'An ongoing period has no end date yet. Clear the end date or turn off “Still ongoing”.';
    } else if (compareDates(period.end, period.start) < 0) {
      errors.end = 'The end date is before the start date. Choose a new end date or clear it.';
    } else if (compareDates(period.end, today) > 0) {
      errors.end = 'The end date is after today. Choose an observed date or leave it unrecorded.';
    }
  }

  return errors;
};

export const hasErrors = (errors: PeriodErrors): boolean => Boolean(errors.start || errors.end);
