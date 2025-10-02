/**
 * Calendar math utilities for grid generation and positioning calculations
 * Handles complex calendar layout logic including offsets and grid positioning
 */

import { getDaysInMonth } from './dateUtils';

export interface CalendarGridData {
  daysInMonthWithOffset: number[];
  firstDayOfMonth: number;
  offsetAtStart: number;
  offsetAtEnd: number;
}

/**
 * Calculates the first day of the week for a given month
 * @param year - The year
 * @param month - The month (0-based, 0 = January)
 * @returns Day of week (0 = Sunday, 1 = Monday, etc.)
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/**
 * Calculates the offset needed at the start of the calendar grid
 * Converts Sunday-first week to Monday-first week
 * @param firstDayOfMonth - First day of month (0 = Sunday)
 * @returns Number of offset days needed at start
 */
export function calculateStartOffset(firstDayOfMonth: number): number {
  // Convert Sunday-first (0) to Monday-first system
  // Sunday becomes 6, Monday becomes 0, etc.
  return firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
}

/**
 * Calculates the total days needed in the calendar grid including offsets
 * @param year - The year
 * @param month - The month (0-based)
 * @param startOffset - The start offset days
 * @returns Total days needed in grid
 */
export function calculateTotalGridDays(year: number, month: number, startOffset: number): number {
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  return daysInMonth + startOffset;
}

/**
 * Calculates the offset needed at the end of the calendar grid
 * @param totalGridDays - Total days in the grid
 * @returns Number of offset days needed at end
 */
export function calculateEndOffset(totalGridDays: number): number {
  const remainder = totalGridDays % 7;
  return remainder === 0 ? 0 : 7 - remainder;
}

/**
 * Generates the complete calendar grid data for a given month
 * @param year - The year
 * @param month - The month (0-based, 0 = January)
 * @returns Complete calendar grid data
 */
export function generateCalendarGrid(year: number, month: number): CalendarGridData {
  const firstDayOfMonth = getFirstDayOfMonth(year, month);
  const offsetAtStart = calculateStartOffset(firstDayOfMonth);
  const totalGridDays = calculateTotalGridDays(year, month, offsetAtStart);
  const offsetAtEnd = calculateEndOffset(totalGridDays);
  
  // Generate array of day numbers including offset
  const daysInMonthWithOffset = Array.from(
    { length: totalGridDays },
    (_, i) => i + 1
  );

  return {
    daysInMonthWithOffset,
    firstDayOfMonth,
    offsetAtStart,
    offsetAtEnd
  };
}

/**
 * Determines if a day number represents an actual day in the month
 * @param dayNumber - The day number from the grid
 * @param offsetAtStart - The start offset
 * @param daysInMonth - Total days in the actual month
 * @returns True if it's a real day in the month
 */
export function isActualDayInMonth(
  dayNumber: number, 
  offsetAtStart: number, 
  daysInMonth: number
): boolean {
  const actualDay = dayNumber - offsetAtStart;
  return actualDay >= 1 && actualDay <= daysInMonth;
}

/**
 * Converts a grid day number to the actual day of the month
 * @param dayNumber - The day number from the grid
 * @param offsetAtStart - The start offset
 * @returns The actual day of the month, or null if not a valid day
 */
export function gridDayToActualDay(dayNumber: number, offsetAtStart: number): number | null {
  const actualDay = dayNumber - offsetAtStart;
  return actualDay >= 1 ? actualDay : null;
}

/**
 * Converts an actual day of the month to the grid position
 * @param actualDay - The actual day of the month (1-based)
 * @param offsetAtStart - The start offset
 * @returns The grid position
 */
export function actualDayToGridDay(actualDay: number, offsetAtStart: number): number {
  return actualDay + offsetAtStart;
}

/**
 * Calculates which week of the month a day falls into
 * @param dayNumber - The day number from the grid
 * @returns Week number (0-based)
 */
export function getWeekOfMonth(dayNumber: number): number {
  return Math.floor((dayNumber - 1) / 7);
}

/**
 * Calculates which day of the week a grid day falls on
 * @param dayNumber - The day number from the grid
 * @returns Day of week (0 = first day of week in grid)
 */
export function getDayOfWeek(dayNumber: number): number {
  return (dayNumber - 1) % 7;
}

/**
 * Checks if a year is a leap year
 * @param year - The year to check
 * @returns True if leap year, false otherwise
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Gets the number of days in February for a given year
 * @param year - The year
 * @returns 29 for leap years, 28 for non-leap years
 */
export function getDaysInFebruary(year: number): number {
  return isLeapYear(year) ? 29 : 28;
}
