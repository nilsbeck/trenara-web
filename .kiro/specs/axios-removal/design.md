# Design Document: Remove Axios Client

## Overview

This document outlines the design for replacing the axios HTTP client with SvelteKit's native fetch API while preserving all existing functionality, particularly the automatic token refresh mechanism that keeps users logged in.

## Architecture

### Current Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Modules   │───▶│   ApiClient     │───▶│   Axios         │
│ (auth, user,    │    │ (Singleton)     │    │ (with           │
│  training, etc) │    │                 │    │  interceptors)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  Interceptors   │
                       │ - Request       │
                       │ - Response      │
                       │ - Token Refresh │
                       └─────────────────┘
```

### New Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Modules   │───▶│   FetchClient   │───▶│   Native Fetch  │
│ (auth, user,    │    │ (Singleton)     │    │ (with custom    │
│  training, etc) │    │                 │    │  interceptors)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Fetch Wrapper   │
                       │ - Request prep  │
                       │ - Response proc │
                       │ - Token Refresh │
                       │ - Error Handling│
                       └─────────────────┘
```

## Components and Interfaces

### 1. FetchClient Class

**Purpose:** Replace the current `ApiClient` class with a fetch-based implementation.

**Key Features:**
- Singleton pattern (same as current)
- Automatic token refresh on 401 responses
- Request/response interceptor functionality
- Cookie handling for authentication
- Error handling and transformation

**Interface:**
```typescript
export class FetchClient {
    private static instance: FetchClient;
    private baseURL: string;
    private defaultHeaders: Record<string, string>;
    private isRefreshing: boolean = false;
    private refreshPromise: Promise<boolean> | null = null;

    public static getInstance(): FetchClient;
    public async request<T>(url: string, options?: RequestOptions): Promise<T>;
    public async get<T>(url: string, options?: RequestOptions): Promise<T>;
    public async post<T>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    public async put<T>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    public async delete<T>(url: string, options?: RequestOptions): Promise<T>;
}
```

### 2. Request/Response Interceptor System

**Purpose:** Replicate axios interceptor functionality using a custom wrapper system.

**Components:**
- `RequestInterceptor`: Processes requests before sending
- `ResponseInterceptor`: Processes responses after receiving
- `ErrorInterceptor`: Handles errors and token refresh

**Flow:**
```
Request → RequestInterceptor → Fetch → ResponseInterceptor → Result
                                 ↓
                            Error → ErrorInterceptor → Token Refresh → Retry
```

### 3. Token Refresh Mechanism

**Purpose:** Maintain the automatic token refresh functionality that prevents users from being logged out.

**Key Features:**
- Detect 401 Unauthorized responses
- Automatically attempt token refresh using refresh token cookie
- Retry original request with new token
- Prevent duplicate refresh attempts
- Handle refresh failures gracefully

**Implementation Strategy:**
```typescript
private async handleUnauthorized(originalRequest: RequestInfo, originalOptions: RequestInit): Promise<Response> {
    if (this.isRefreshing) {
        // Wait for ongoing refresh
        await this.refreshPromise;
        return this.retryRequest(originalRequest, originalOptions);
    }

    this.isRefreshing = true;
    this.refreshPromise = this.refreshToken();
    
    try {
        const success = await this.refreshPromise;
        if (success) {
            return this.retryRequest(originalRequest, originalOptions);
        } else {
            throw new Error('Token refresh failed');
        }
    } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
    }
}
```

### 4. Cookie Integration

**Purpose:** Ensure seamless integration with SvelteKit's cookie handling system.

**Server-Side Considerations:**
- Forward cookies from incoming requests to API calls
- Handle cookie updates from API responses
- Maintain cookie security settings (httpOnly, secure, sameSite)

**Client-Side Considerations:**
- Cookies are automatically included in fetch requests to same origin
- Handle cross-origin cookie requirements if needed

### 5. Error Handling System

**Purpose:** Maintain consistent error handling across all API calls.

**Error Types:**
- Network errors (connection failures)
- HTTP errors (4xx, 5xx status codes)
- Authentication errors (401, 403)
- Validation errors (400 with field details)
- Server errors (500, 502, 503, etc.)

**Error Transformation:**
```typescript
interface ApiError {
    message: string;
    status: number;
    code?: string;
    details?: Record<string, string[]>;
}

private transformError(response: Response, data?: any): ApiError {
    return {
        message: data?.message || response.statusText || 'An error occurred',
        status: response.status,
        code: data?.code,
        details: data?.errors
    };
}
```

## Data Models

### RequestOptions Interface

```typescript
interface RequestOptions {
    headers?: Record<string, string>;
    cookies?: Cookies; // For server-side requests
    timeout?: number;
    retries?: number;
    signal?: AbortSignal;
}
```

### FetchResponse Interface

```typescript
interface FetchResponse<T> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
}
```

## Error Handling

### Error Hierarchy

```
ApiError (base)
├── NetworkError (connection issues)
├── HttpError (HTTP status errors)
│   ├── AuthenticationError (401)
│   ├── AuthorizationError (403)
│   ├── ValidationError (400)
│   └── ServerError (5xx)
└── TimeoutError (request timeout)
```

### Error Recovery Strategies

1. **Authentication Errors (401):**
   - Attempt automatic token refresh
   - Retry original request if refresh succeeds
   - Redirect to login if refresh fails

2. **Network Errors:**
   - Implement exponential backoff retry
   - Maximum retry attempts: 3
   - Timeout handling

3. **Server Errors (5xx):**
   - Log error details for debugging
   - Show user-friendly error message
   - Optional retry for transient errors

4. **Validation Errors (400):**
   - Extract field-specific error messages
   - Display validation errors to user
   - No automatic retry

## Testing Strategy

### Unit Tests
- Test FetchClient methods individually
- Mock fetch responses for different scenarios
- Test error handling paths
- Test token refresh mechanism

### Integration Tests
- Test complete API call flows
- Test authentication scenarios
- Test error recovery mechanisms
- Test cookie handling

### Migration Tests
- Compare axios vs fetch responses
- Ensure identical behavior
- Performance benchmarking
- Bundle size verification

### Test Scenarios

1. **Successful API Calls:**
   - GET, POST, PUT, DELETE requests
   - With and without authentication
   - Server-side and client-side contexts

2. **Authentication Flows:**
   - Login with token storage
   - Automatic token refresh
   - Logout with cookie cleanup
   - Expired token handling

3. **Error Scenarios:**
   - Network failures
   - Server errors
   - Authentication failures
   - Validation errors
   - Timeout scenarios

4. **Edge Cases:**
   - Concurrent requests during token refresh
   - Multiple 401 responses simultaneously
   - Refresh token expiration
   - Network connectivity issues

## Migration Plan

### Phase 1: Create Fetch Client
- Implement `FetchClient` class
- Add request/response interceptors
- Implement token refresh mechanism
- Add comprehensive error handling

### Phase 2: Parallel Implementation
- Create fetch-based versions of API modules
- Maintain axios versions for comparison
- Add feature flags to switch between implementations
- Comprehensive testing of both implementations

### Phase 3: Gradual Migration
- Migrate API modules one by one
- Start with less critical modules
- Monitor for issues and performance
- Rollback capability if needed

### Phase 4: Complete Migration
- Remove axios dependency
- Clean up old code
- Update documentation
- Performance verification

## Performance Considerations

### Bundle Size Reduction
- Axios bundle size: ~13KB gzipped
- Native fetch: 0KB (built into browsers)
- Expected reduction: ~13KB

### Runtime Performance
- Native fetch is generally faster than axios
- Reduced memory footprint
- Fewer function calls in request path

### Caching Strategy
- Implement request deduplication
- Cache frequently accessed data
- Optimize cookie handling

## Security Considerations

### Cookie Security
- Maintain httpOnly flag for auth cookies
- Ensure secure flag in production
- Proper sameSite configuration
- Cookie expiration handling

### Token Security
- Secure token storage in httpOnly cookies
- Automatic token refresh without exposing tokens to client-side JavaScript
- Proper token cleanup on logout

### Request Security
- CSRF protection through sameSite cookies
- Proper CORS handling
- Request timeout to prevent hanging requests

## Monitoring and Debugging

### Logging Strategy
- Request/response logging in development
- Error logging with context
- Performance metrics collection
- Token refresh event logging

### Debug Tools
- Network tab compatibility
- Request/response inspection
- Error stack traces
- Performance profiling

### Metrics to Track
- Request success/failure rates
- Token refresh frequency
- Response times
- Error rates by type
- Bundle size impact
