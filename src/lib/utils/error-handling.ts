export class AppError extends Error {
	constructor(
		public override message: string,
		public status: number = 500,
		public code?: string
	) {
		super(message);
		this.name = 'AppError';
	}
}

export class ApiResponseError extends AppError {
	constructor(message: string, status: number) {
		super(message, status, 'API_ERROR');
		this.name = 'ApiResponseError';
	}
}

export function handleError(error: unknown): AppError {
	if (error instanceof AppError) return error;
	if (error instanceof Error) return new AppError(error.message);
	return new AppError('An unexpected error occurred');
}

export function logError(error: unknown, context?: string): void {
	const appError = handleError(error);
	console.error(`[Error${context ? ` in ${context}` : ''}]:`, appError.message);
}
