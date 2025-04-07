import type { ApiError } from '$lib/server/api/types';

export class AppError extends Error {
    constructor(
        public message: string,
        public status: number = 500,
        public code?: string,
        public details?: unknown
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class ApiResponseError extends AppError {
    constructor(
        message: string,
        status: number,
        public errors?: string[],
        public data?: unknown
    ) {
        super(message, status, 'API_ERROR', { errors, data });
        this.name = 'ApiResponseError';
    }
}

export function handleError(error: unknown): AppError {
    if (error instanceof AppError) {
        return error;
    }

    if (error instanceof Error) {
        return new AppError(error.message);
    }

    return new AppError('An unexpected error occurred');
}

export function logError(error: unknown, context?: string): void {
    const appError = handleError(error);
    
    console.error(`[${new Date().toISOString()}] Error${context ? ` in ${context}` : ''}:`, {
        message: appError.message,
        status: appError.status,
        code: appError.code,
        details: appError.details,
        stack: appError.stack
    });
}

export function isApiError(error: unknown): error is ApiError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        'status' in error &&
        typeof (error as ApiError).message === 'string' &&
        typeof (error as ApiError).status === 'number'
    );
} 
