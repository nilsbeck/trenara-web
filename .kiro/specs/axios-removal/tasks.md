# Implementation Plan: Remove Axios Client

## Task Overview

Convert the feature design into a series of implementation tasks for replacing axios with native fetch API while preserving all functionality, especially automatic token refresh.

## Implementation Tasks

- [x] 1. Create core fetch client infrastructure

  - Implement base FetchClient class with singleton pattern
  - Create request/response interceptor system
  - Add comprehensive error handling and transformation
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 6.1, 6.2_

- [x] 1.1 Implement FetchClient base class

  - Create `src/lib/server/api/fetchClient.ts` with singleton pattern
  - Implement base request method with fetch wrapper
  - Add HTTP method convenience functions (get, post, put, delete)
  - Configure base URL and default headers
  - _Requirements: 1.1, 6.1_

- [x] 1.2 Create request/response interceptor system

  - Implement request preprocessing (headers, authentication)
  - Create response processing pipeline
  - Add error transformation and standardization
  - Ensure interceptor chain execution order
  - _Requirements: 5.1, 5.2, 5.3, 6.2_

- [x] 1.3 Implement comprehensive error handling

  - Create error type hierarchy (NetworkError, HttpError, etc.)
  - Transform fetch errors to consistent ApiError format
  - Add timeout handling and request cancellation
  - Implement retry logic for transient failures
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 1.4 Add TypeScript interfaces and types

  - Define RequestOptions, FetchResponse interfaces
  - Create error type definitions
  - Add generic type support for request/response data
  - Ensure type compatibility with existing API modules
  - _Requirements: 6.1, 6.2, 9.3_

- [x] 2. Implement automatic token refresh mechanism

  - Create token refresh detection and handling
  - Implement concurrent request management during refresh
  - Add refresh token failure handling
  - Ensure seamless user experience without logouts
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2.1 Create 401 response detection and handling

  - Detect 401 Unauthorized responses in response interceptor
  - Implement automatic token refresh trigger
  - Add original request retry after successful refresh
  - Handle refresh failures with appropriate user feedback
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2.2 Implement concurrent request management

  - Prevent duplicate token refresh attempts
  - Queue concurrent requests during refresh process
  - Retry all queued requests after successful refresh
  - Handle refresh failure for all queued requests
  - _Requirements: 2.4, 2.5_

- [x] 2.3 Add refresh token expiration handling

  - Detect refresh token expiration scenarios
  - Implement graceful logout when refresh fails
  - Clear authentication cookies on refresh failure
  - Redirect to login page when session expires
  - _Requirements: 2.6, 3.3_

- [x] 2.4 Create token refresh service integration

  - Integrate with existing TokenManager class
  - Use refresh token from HTTP-only cookies
  - Update access token after successful refresh
  - Maintain cookie security settings
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 3. Implement cookie-based authentication support

  - Add automatic cookie inclusion in requests
  - Handle server-side cookie forwarding
  - Implement secure cookie management
  - Ensure compatibility with SvelteKit cookie handling
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.1, 7.2_

- [x] 3.1 Create automatic cookie handling

  - Ensure cookies are automatically included in same-origin requests
  - Add manual cookie forwarding for server-side requests
  - Handle cross-origin cookie requirements if needed
  - Maintain cookie security attributes
  - _Requirements: 3.1, 7.1_

- [x] 3.2 Implement server-side cookie forwarding

  - Forward cookies from incoming requests to API calls
  - Handle cookie updates from API responses
  - Integrate with SvelteKit's Cookies interface
  - Ensure proper cookie scope and security
  - _Requirements: 7.1, 7.2, 3.2_

- [x] 3.3 Add secure cookie management

  - Maintain httpOnly flag for authentication cookies
  - Ensure secure flag in production environment
  - Configure proper sameSite settings
  - Implement cookie cleanup on logout
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 4. Create parallel API module implementations

  - Implement fetch-based versions of all API modules
  - Maintain identical interfaces and behavior
  - Add feature flags for switching between implementations
  - Create comprehensive test coverage
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 4.1 Implement fetch-based auth API module

  - Create `src/lib/server/api/auth-fetch.ts` with identical interface
  - Implement login, logout, refresh token methods
  - Add proper error handling for authentication flows
  - Test against existing auth API behavior
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 4.2 Implement fetch-based user API module

  - Create `src/lib/server/api/user-fetch.ts` with identical interface
  - Implement getCurrentUser, updateProfile, updatePreferences methods
  - Add Bearer token authentication headers
  - Test user data retrieval and updates
  - _Requirements: 6.1, 6.2, 5.3_

- [x] 4.3 Implement fetch-based training API module

  - Create `src/lib/server/api/training-fetch.ts` with identical interface
  - Implement all training-related API methods
  - Add proper authentication and error handling
  - Test training data operations
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 4.4 Implement fetch-based messages API module

  - Create `src/lib/server/api/messages-fetch.ts` with identical interface
  - Implement thread and message operations
  - Add authentication and error handling
  - Test messaging functionality
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 5. Add comprehensive testing suite

  - Create unit tests for FetchClient functionality
  - Add integration tests for API modules
  - Test token refresh scenarios thoroughly
  - Compare axios vs fetch behavior
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 5.1 Create FetchClient unit tests

  - Test all HTTP methods (GET, POST, PUT, DELETE)
  - Test error handling for different scenarios
  - Test request/response interceptor functionality
  - Mock fetch responses for consistent testing
  - _Requirements: 9.1, 9.2_

- [x] 5.2 Add token refresh mechanism tests

  - Test 401 response handling and token refresh
  - Test concurrent request management during refresh
  - Test refresh token expiration scenarios
  - Test error handling when refresh fails
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 5.3 Create API module integration tests

  - Test complete API call flows with authentication
  - Test server-side and client-side request contexts
  - Test cookie handling and forwarding
  - Compare responses between axios and fetch implementations
  - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2_

- [x] 5.4 Add performance and compatibility tests

  - Benchmark request performance vs axios
  - Test bundle size reduction
  - Test browser compatibility
  - Test network error scenarios
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Implement gradual migration strategy

  - Add feature flags for switching implementations
  - Create migration utilities and helpers
  - Plan rollback strategy if issues arise
  - Monitor performance and error rates
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 6.1 Create feature flag system

  - Add environment variable for fetch/axios selection
  - Create runtime switching mechanism
  - Implement gradual rollout capability
  - Add monitoring for both implementations
  - _Requirements: 10.1, 10.2_

- [x] 6.2 Implement migration utilities

  - Create helper functions for API module switching
  - Add compatibility layer if needed
  - Implement rollback mechanisms
  - Create migration verification tools
  - _Requirements: 10.3, 10.4_

- [x] 6.3 Add monitoring and logging

  - Implement request/response logging
  - Add error tracking and reporting
  - Monitor token refresh frequency
  - Track performance metrics
  - _Requirements: 8.1, 8.2, 9.1, 9.2_

- [x] 7. Execute complete migration

  - Switch all API modules to fetch implementation
  - Remove axios dependency and old code
  - Update documentation and examples
  - Verify functionality and performance
  - _Requirements: 1.3, 8.1, 8.2, 10.1_

- [x] 7.1 Switch API modules to fetch implementation

  - Update all imports to use fetch-based modules
  - Remove axios-based implementations
  - Test all functionality thoroughly
  - Monitor for any regressions
  - _Requirements: 1.3, 10.1, 10.2_

- [x] 7.2 Remove axios dependency

  - Remove axios from package.json dependencies
  - Delete axios-related configuration files
  - Clean up unused imports and code
  - Verify bundle size reduction
  - _Requirements: 1.3, 8.1_

- [x] 7.3 Update documentation and examples

  - Update API documentation to reflect fetch usage
  - Update code examples and tutorials
  - Add migration guide for future reference
  - Update development setup instructions
  - _Requirements: 9.3, 9.4_

- [x] 7.4 Final verification and optimization
  - Run complete test suite
  - Verify all functionality works correctly
  - Check performance improvements
  - Optimize any remaining issues
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 10.4_

## Success Criteria

- All API functionality works identically to axios implementation
- Automatic token refresh prevents user logouts
- Bundle size is reduced by ~13KB
- No breaking changes to existing API interfaces
- All tests pass with fetch implementation
- Performance is equal to or better than axios
- Cookie-based authentication works seamlessly
- Server-side requests work correctly with SvelteKit
