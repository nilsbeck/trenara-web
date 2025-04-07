export enum TokenType {
    AccessToken = "access-token",
    RefreshToken = "refresh-token"
}

export interface AuthError {
    status: number;
    message: string;
    errors?: Record<string, string[]>;
}

export interface AuthState {
    isAuthenticated: boolean;
    user: string | null;
    error: AuthError | null;
} 
