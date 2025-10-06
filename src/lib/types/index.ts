/**
 * Main type exports
 */

// Calendar types
export type {
	CalendarDate,
	CalendarState,
	TrainingFilter,
	TrainingStatus,
	TrainingStatusInfo,
	CalendarGridData,
	CalendarNavigation,
	CalendarActions,
	CalendarStore,
	CalendarProps,
	CalendarCellProps,
	CalendarGridProps,
	CalendarHeaderProps,
	CalendarDetailsProps
} from './calendar.js';

// Auth types
export type {
	User,
	AuthError,
	LoginCredentials,
	AuthResponse,
	SessionData,
	AuthStore,
	TokenInfo,
	AuthState
} from './auth.js';

// API types
export type {
	ApiResponse,
	ApiError,
	PaginatedResponse,
	ApiRequestOptions,
	ApiClient,
	FetchOptions,
	CacheOptions
} from './api.js';

// Store types
export type {
	AsyncData,
	AsyncDataOptions,
	ErrorBoundary,
	AppError,
	ErrorStore,
	StoreContext,
	StoreOptions,
	StoreSubscriber,
	StoreUnsubscriber
} from './stores.js';

// UI types
export { Tab } from './ui.js';

export type {
	LoadingState,
	ErrorState,
	UIState,
	ModalProps,
	ButtonProps,
	FormFieldProps,
	NotificationProps
} from './ui.js';
