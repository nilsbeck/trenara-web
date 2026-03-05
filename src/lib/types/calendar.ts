export interface CalendarDate {
	year: number;
	month: number;
	day: number;
}

export interface TrainingFilter {
	type: 'run' | 'strength';
	day: number;
}

export type TrainingStatus = 'none' | 'scheduled' | 'completed' | 'missed';

export interface MonthData {
	daysWithOffset: number[];
	firstDayOfMonth: number;
	offsetAtStart: number;
	offsetAtEnd: number;
	daysInMonth: number;
}
