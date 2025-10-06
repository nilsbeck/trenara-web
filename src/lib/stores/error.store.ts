/**
 * Centralized error store using traditional Svelte stores
 */

import { writable, derived } from 'svelte/store';
import type { ErrorStore, AppError } from '$lib/types/index.js';
import { ErrorClassifier } from '$lib/utils/error-boundary.js';

/**
 * Create a centralized error store
 */
export function createErrorStore(): ErrorStore {
	const errors = writable<AppError[]>([]);

	const hasErrors = derived(errors, ($errors) => $errors.length > 0);

	const addError = (error: AppError | Error | string) => {
		let appError: AppError;

		if (typeof error === 'string') {
			appError = {
				id: crypto.randomUUID(),
				type: 'unknown',
				message: error,
				timestamp: new Date()
			};
		} else if (error instanceof Error) {
			appError = {
				id: crypto.randomUUID(),
				type: ErrorClassifier.getErrorType(error),
				message: ErrorClassifier.getUserFriendlyMessage(error),
				timestamp: new Date(),
				context: {
					originalMessage: error.message,
					stack: error.stack
				}
			};
		} else {
			appError = {
				...error,
				id: error.id || crypto.randomUUID(),
				timestamp: error.timestamp || new Date()
			};
		}

		errors.update((currentErrors) => [...currentErrors, appError]);

		// Auto-remove errors after 10 seconds for non-critical errors
		if (appError.type !== 'auth') {
			setTimeout(() => {
				removeError(appError.id);
			}, 10000);
		}
	};

	const removeError = (id: string) => {
		errors.update((currentErrors) => currentErrors.filter((e) => e.id !== id));
	};

	const clearErrors = () => {
		errors.set([]);
	};

	const getErrorsByType = (type: AppError['type']) => {
		let currentErrors: AppError[];
		errors.subscribe((value) => (currentErrors = value))();
		return currentErrors!.filter((e) => e.type === type);
	};

	const hasErrorOfType = (type: AppError['type']) => {
		let currentErrors: AppError[];
		errors.subscribe((value) => (currentErrors = value))();
		return currentErrors!.some((e) => e.type === type);
	};

	return {
		// Store subscriptions
		subscribe: derived([errors, hasErrors], ([$errors, $hasErrors]) => ({
			errors: $errors,
			hasErrors: $hasErrors
		})).subscribe,

		// Direct property access for compatibility
		get errors() {
			let value: AppError[];
			errors.subscribe((v) => (value = v))();
			return value!;
		},
		get hasErrors() {
			let value: boolean;
			hasErrors.subscribe((v) => (value = v))();
			return value!;
		},

		// Actions
		addError,
		removeError,
		clearErrors,
		// Additional utility methods
		getErrorsByType,
		hasErrorOfType
	};
}

// Global error store instance
export const errorStore = createErrorStore();

// Global error handler that adds errors to the store
export function handleGlobalError(error: Error | string) {
	errorStore.addError(error);
}

// Setup global error listeners
if (typeof window !== 'undefined') {
	window.addEventListener('unhandledrejection', (event) => {
		handleGlobalError(event.reason);
		event.preventDefault();
	});

	window.addEventListener('error', (event) => {
		handleGlobalError(event.error);
	});
}
