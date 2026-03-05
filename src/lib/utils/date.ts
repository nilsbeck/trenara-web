export function formatDateString(year: number, month: number, day: number): string {
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getMonthTimestamps(date: Date): Date[] {
	const year = date.getFullYear();
	const month = date.getMonth();
	const firstDayOfMonthDate = new Date(year, month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();
	const offsetAtStart = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const weeksInMonth = Math.ceil((offsetAtStart + daysInMonth) / 7);

	const nextMonday = new Date(firstDayOfMonthDate);
	nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7));

	const timestamps: Date[] = [firstDayOfMonthDate];
	timestamps.push(new Date(nextMonday));
	for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		timestamps.push(new Date(nextMonday));
	}
	return timestamps;
}
