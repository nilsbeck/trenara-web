/**
 * Pure utility functions for date calculations and formatting
 * Used throughout the calendar component for consistent date handling
 */

export interface DateOffset {
  years?: number;
  months?: number;
  days?: number;
}

/**
 * Adds an offset to a date and returns a new Date object
 * @param date - The base date
 * @param offset - The offset to add
 * @returns A new Date object with the offset applied
 */
export function addDateOffset(date: Date, offset: DateOffset): Date {
  const newDate = new Date(date);
  
  if (offset.years) {
    newDate.setFullYear(newDate.getFullYear() + offset.years);
  }
  
  if (offset.months) {
    newDate.setMonth(newDate.getMonth() + offset.months);
  }
  
  if (offset.days) {
    newDate.setDate(newDate.getDate() + offset.days);
  }
  
  return newDate;
}

/**
 * Formats a date to YYYY-MM-DD string format
 * @param date - The date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date to a localized month and year string
 * @param date - The date to format
 * @param locale - The locale to use (defaults to 'en-US')
 * @returns Formatted month and year string
 */
export function formatMonthYear(date: Date, locale: string = 'en-US'): string {
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/**
 * Extracts date from ISO string and returns YYYY-MM-DD format
 * @param isoString - ISO date string
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateFromISOString(isoString: string): string {
  const date = new Date(isoString);
  return formatDateToISO(date);
}

/**
 * Validates if a date is valid
 * @param date - The date to validate
 * @returns True if the date is valid, false otherwise
 */
export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Validates if a date string is in YYYY-MM-DD format
 * @param dateString - The date string to validate
 * @returns True if the format is valid, false otherwise
 */
export function isValidDateString(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }
  
  const date = new Date(dateString);
  return isValidDate(date) && formatDateToISO(date) === dateString;
}

/**
 * Sanitizes date input by ensuring it's a valid Date object
 * @param input - Date input (Date, string, or number)
 * @returns Valid Date object or null if invalid
 */
export function sanitizeDateInput(input: Date | string | number): Date | null {
  let date: Date;
  
  if (input instanceof Date) {
    date = input;
  } else {
    date = new Date(input);
  }
  
  return isValidDate(date) ? date : null;
}

/**
 * Compares two dates and returns true if they represent the same day
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if dates are the same day, false otherwise
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return formatDateToISO(date1) === formatDateToISO(date2);
}

/**
 * Gets the start of the month for a given date
 * @param date - The date
 * @returns Date object representing the first day of the month
 */
export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Gets the end of the month for a given date
 * @param date - The date
 * @returns Date object representing the last day of the month
 */
export function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Gets the number of days in a month
 * @param date - The date
 * @returns Number of days in the month
 */
export function getDaysInMonth(date: Date): number {
  return getEndOfMonth(date).getDate();
}
