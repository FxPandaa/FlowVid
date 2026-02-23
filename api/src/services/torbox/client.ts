/**
 * FlowVid API - TorBox Vendor API Client
 * Typed HTTP client for TorBox Vendors API with retry logic
 *
 * API Base: https://api.torbox.app/v1/api/vendors
 * Auth: Bearer token (vendor API key)
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  TorBoxVendorClientOptions,
  TorBoxApiResponse,
  VendorAccount,
  VendorUser,
  VendorUserDetail,
  RegisterUserResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.torbox.app/v1/api/vendors";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

export class TorBoxVendorClient {
  private client: AxiosInstance;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: TorBoxVendorClientOptions) {
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    this.client = axios.create({
      baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  // ==========================================================================
  // VENDOR ACCOUNT
  // ==========================================================================

  /**
   * Get the vendor account details (your FlowVid vendor account)
   * GET /getaccount
   */
  async getAccount(): Promise<VendorAccount> {
    const response = await this.requestWithRetry<VendorAccount>(
      "GET",
      "/getaccount",
    );
    return response.data;
  }

  // ==========================================================================
  // VENDOR USER MANAGEMENT
  // ==========================================================================

  /**
   * List all vendor users
   * GET /getaccounts
   */
  async getAccounts(): Promise<VendorUser[]> {
    const response = await this.requestWithRetry<VendorUser[]>(
      "GET",
      "/getaccounts",
    );
    return response.data ?? [];
  }

  /**
   * Get a single vendor user by auth_id
   * GET /getsingleaccount?id={auth_id}
   */
  async getSingleAccount(authId: string): Promise<VendorUserDetail> {
    const response = await this.requestWithRetry<VendorUserDetail>(
      "GET",
      `/getsingleaccount`,
      { params: { id: authId } },
    );
    return response.data;
  }

  /**
   * Register a new vendor user with their email
   * POST /registeruser
   *
   * The user will receive a confirmation email from TorBox.
   * Until they confirm, their API token won't be available.
   */
  async registerUser(email: string): Promise<RegisterUserResult> {
    const response = await this.requestWithRetry<RegisterUserResult>(
      "POST",
      "/registeruser",
      { data: { email } },
    );
    return response.data;
  }

  /**
   * Remove a vendor user by auth_id
   * POST /removeuser
   *
   * This revokes their access immediately.
   */
  async removeUser(authId: string): Promise<void> {
    await this.requestWithRetry("POST", "/removeuser", {
      data: { id: authId },
    });
  }

  /**
   * Refresh all vendor accounts (force sync with TorBox)
   * POST /refresh
   */
  async refreshAccounts(): Promise<void> {
    await this.requestWithRetry("POST", "/refresh");
  }

  // ==========================================================================
  // CAPACITY CHECK
  // ==========================================================================

  /**
   * Check if there's capacity to add a new user
   */
  async hasCapacity(): Promise<boolean> {
    const account = await this.getAccount();
    return account.current_users < account.users_allowed;
  }

  /**
   * Get current capacity info
   */
  async getCapacity(): Promise<{
    allowed: number;
    current: number;
    available: number;
  }> {
    const account = await this.getAccount();
    return {
      allowed: account.users_allowed,
      current: account.current_users,
      available: account.users_allowed - account.current_users,
    };
  }

  // ==========================================================================
  // HTTP LAYER WITH RETRIES
  // ==========================================================================

  private async requestWithRetry<T>(
    method: "GET" | "POST",
    path: string,
    options?: { data?: unknown; params?: Record<string, string> },
  ): Promise<TorBoxApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.request<TorBoxApiResponse<T>>({
          method,
          url: path,
          data: options?.data,
          params: options?.params,
        });

        if (!response.data.success) {
          throw new TorBoxApiError(
            response.data.detail ??
              response.data.error ??
              "Unknown TorBox error",
            response.status,
            path,
          );
        }

        return response.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on 4xx client errors (except 429 rate limit)
        if (error instanceof AxiosError && error.response) {
          const status = error.response.status;
          if (status >= 400 && status < 500 && status !== 429) {
            throw new TorBoxApiError(
              error.response.data?.detail ??
                error.response.data?.error ??
                error.message,
              status,
              path,
            );
          }
        }

        // Don't retry TorBox-level errors
        if (error instanceof TorBoxApiError) {
          throw error;
        }

        // Retry with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          console.warn(
            `[TorBox] Request to ${path} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), ` +
              `retrying in ${delay}ms...`,
          );
          await sleep(delay);
        }
      }
    }

    throw (
      lastError ?? new Error(`TorBox request to ${path} failed after retries`)
    );
  }
}

/**
 * Custom error class for TorBox API errors
 */
export class TorBoxApiError extends Error {
  public readonly statusCode: number;
  public readonly endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string) {
    super(`TorBox API error (${statusCode}) at ${endpoint}: ${message}`);
    this.name = "TorBoxApiError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
