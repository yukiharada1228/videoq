/**
 * Billing API Client Service
 * 
 * Provides API client methods for Stripe billing functionality.
 * Follows the same pattern as frontend/src/lib/api.ts
 * 
 * Feature: Stripe Billing with Usage-Based Limits
 * Spec: /specs/001-stripe-billing/
 * API Contract: /specs/001-stripe-billing/contracts/billing-api.yaml
 */

import {
    SubscriptionPlan,
    UserSubscription,
    UsageRecord,
    PaymentTransaction,
    CheckoutSessionResponse,
    CheckoutSessionRequest,
    UsageCheckRequest,
    UsageCheckResponse,
    BillingHistoryResponse,
    SubscriptionCancelRequest,
} from '../types/billing';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * BillingService class
 * 
 * Handles all billing-related API requests.
 * Uses HttpOnly Cookie-based authentication (credentials: 'include')
 * following the pattern of the main ApiClient.
 */
class BillingService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = API_URL;
    }

    /**
     * Build full URL from endpoint
     */
    private buildUrl(endpoint: string): string {
        return `${this.baseUrl}${endpoint}`;
    }

    /**
     * Get JSON headers for requests
     */
    private getJsonHeaders(): Record<string, string> {
        return { 'Content-Type': 'application/json' };
    }

    /**
     * Build headers with optional additional headers
     */
    private buildHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
        return {
            ...this.getJsonHeaders(),
            ...(additionalHeaders as Record<string, string>),
        };
    }

    /**
     * Handle API errors
     */
    private async handleError(response: Response): Promise<never> {
        const errorData = (await response.json().catch(() => ({
            detail: response.statusText,
        }))) as unknown;

        if (errorData && typeof errorData === 'object') {
            // Handle unified error format: { error: { code, message, fields } }
            const maybeError = (errorData as { error?: unknown }).error;
            if (maybeError && typeof maybeError === 'object') {
                const errorObj = maybeError as { code?: string; message?: string; fields?: Record<string, string[]> };
                if (typeof errorObj.message === 'string') {
                    throw new Error(errorObj.message);
                }
            }
        }

        throw new Error(`HTTP error! status: ${response.status}`);
    }

    /**
     * Parse JSON response safely
     */
    private async parseJsonResponse<T>(response: Response): Promise<T> {
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        const contentLength = response.headers.get('content-length');
        if (contentLength === '0' || (!isJson && !contentLength)) {
            return {} as T;
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
            return {} as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            return {} as T;
        }
    }

    /**
     * Log errors to console
     */
    private logError(message: string, error: unknown): void {
        console.error(message, error);
    }

    /**
     * Execute API request
     */
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = this.buildUrl(endpoint);
        const headers = this.buildHeaders(options.headers);

        const config: RequestInit = {
            ...options,
            headers,
            credentials: 'include', // HttpOnly Cookie-based authentication
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                await this.handleError(response);
            }

            return await this.parseJsonResponse<T>(response);
        } catch (error) {
            this.logError(`Billing API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    /**
     * GET /billing/plans
     * List all active subscription plans
     * Public endpoint (no auth required)
     */
    async getPlans(): Promise<SubscriptionPlan[]> {
        return this.request<SubscriptionPlan[]>('/billing/plans');
    }

    /**
     * GET /billing/subscription
     * Get current user's subscription
     * Requires authentication
     */
    async getSubscription(): Promise<UserSubscription> {
        return this.request<UserSubscription>('/billing/subscription');
    }

    /**
     * POST /billing/subscription/checkout
     * Create Stripe Checkout session for upgrade
     * Requires authentication
     */
    async createCheckoutSession(data: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
        return this.request<CheckoutSessionResponse>('/billing/subscription/checkout', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * POST /billing/subscription/cancel
     * Cancel subscription at period end
     * Requires authentication
     */
    async cancelSubscription(data?: SubscriptionCancelRequest): Promise<UserSubscription> {
        return this.request<UserSubscription>('/billing/subscription/cancel', {
            method: 'POST',
            body: JSON.stringify(data || {}),
        });
    }

    /**
     * POST /billing/subscription/reactivate
     * Reactivate cancelled subscription
     * Requires authentication
     */
    async reactivateSubscription(): Promise<UserSubscription> {
        return this.request<UserSubscription>('/billing/subscription/reactivate', {
            method: 'POST',
            body: JSON.stringify({}),
        });
    }

    /**
     * GET /billing/usage
     * Get current billing period usage
     * Requires authentication
     */
    async getUsage(): Promise<UsageRecord> {
        return this.request<UsageRecord>('/billing/usage');
    }

    /**
     * POST /billing/usage/check
     * Check if action is allowed under current limits
     * Pre-flight check for video upload or transcription
     * Requires authentication
     */
    async checkUsageLimit(data: UsageCheckRequest): Promise<UsageCheckResponse> {
        try {
            const response = await fetch(this.buildUrl('/billing/usage/check'), {
                method: 'POST',
                headers: this.buildHeaders(),
                credentials: 'include',
                body: JSON.stringify(data),
            });

            // For this endpoint, 403 returns a valid response with allowed=false
            // So we don't throw an error for 403
            if (response.ok || response.status === 403) {
                return await this.parseJsonResponse<UsageCheckResponse>(response);
            }

            // For other error status codes, handle normally
            await this.handleError(response);
        } catch (error) {
            this.logError('Usage check failed:', error);
            throw error;
        }
    }

    /**
     * GET /billing/history
     * Get billing and payment history
     * Requires authentication
     */
    async getBillingHistory(params?: { limit?: number; offset?: number }): Promise<BillingHistoryResponse> {
        const queryParams: Record<string, string> = {};
        if (params?.limit !== undefined) queryParams.limit = params.limit.toString();
        if (params?.offset !== undefined) queryParams.offset = params.offset.toString();

        const query = Object.keys(queryParams).length
            ? `?${new URLSearchParams(queryParams).toString()}`
            : '';

        return this.request<BillingHistoryResponse>(`/billing/history${query}`);
    }

    /**
     * Helper method to format price for display
     * @param priceCents Price in cents
     * @param currency Currency code (default: USD)
     */
    formatPrice(priceCents: number, currency: string = 'USD'): string {
        const amount = priceCents / 100;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
        }).format(amount);
    }

    /**
     * Helper method to calculate usage percentage
     * @param current Current usage
     * @param limit Usage limit (null = unlimited)
     */
    calculateUsagePercentage(current: number, limit: number | null): number {
        if (limit === null || limit === 0) return 0;
        return Math.min((current / limit) * 100, 100);
    }

    /**
     * Helper method to check if usage has reached a warning threshold
     * @param usagePercentage Current usage percentage (0-100)
     * @param threshold Warning threshold (80, 90, or 100)
     */
    hasReachedThreshold(usagePercentage: number, threshold: 80 | 90 | 100): boolean {
        return usagePercentage >= threshold;
    }
}

/**
 * Singleton instance of BillingService
 * Export this instance to use throughout the application
 */
export const billingService = new BillingService();
