import type {
    Schedule,
    ScheduledTraining,
    StrengthTraining,
    Entry,
    NutritionAdvice
} from '$lib/server/api/types';

export enum Tab {
    Training = 'training',
    Strength = 'strength',
    Nutrition = 'nutrition'
}

export type CalendarDate = {
    year: number;
    month: number;
    day: number;
};

export type CalendarState = {
    selectedDate: CalendarDate | null;
    currentDate: Date;
    daysInMonthWithOffset: number[];
    firstDayOfMonth: number;
    offsetAtEnd: number;
    offsetAtStart: number;
};

export type TrainingFilter = {
    type: 'run' | 'strength';
    day: number;
};

export type CalendarEvent = {
    date: Date;
    type: 'training' | 'strength' | 'entry';
    data: unknown;
};

export function isValidCalendarDate(date: unknown): date is CalendarDate {
    return (
        typeof date === 'object' &&
        date !== null &&
        'year' in date &&
        'month' in date &&
        'day' in date &&
        typeof (date as CalendarDate).year === 'number' &&
        typeof (date as CalendarDate).month === 'number' &&
        typeof (date as CalendarDate).day === 'number'
    );
}

export function isValidTrainingFilter(filter: unknown): filter is TrainingFilter {
    return (
        typeof filter === 'object' &&
        filter !== null &&
        'type' in filter &&
        'day' in filter &&
        ((filter as TrainingFilter).type === 'run' ||
        (filter as TrainingFilter).type === 'strength') &&
        typeof (filter as TrainingFilter).day === 'number'
    );
}

export interface TrainingDetailsProps {
    schedule: Schedule;
    selectedTraining: ScheduledTraining[];
    selectedRunTrainingEntry: Entry[];
    day: number;
    month: number;
    year: number;
    selectedDate: string | null;
}

export interface StrengthDetailsProps {
    selectedTrainingStrength: StrengthTraining[];
}

export interface NutritionDetailsProps {
    selectedDate: string | null;
    nutritionDate: string | null;
    nutritionData: NutritionAdvice | null;
    isNutritionLoading: boolean;
}

export interface CalendarProps {
    today: Date;
    schedule?: Schedule;
}
