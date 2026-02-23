/**
 * FlowVid API - TorBox Vendor API Types
 * Types for the TorBox Vendors API (https://api.torbox.app/v1/api/vendors)
 */

// ============================================================================
// VENDOR ACCOUNT
// ============================================================================

export interface VendorAccount {
  id: number;
  email: string;
  auth_id: string;
  plan: number;
  users_allowed: number;
  current_users: number;
  status: string; // "Testing", "Active", etc.
  paid_until: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// VENDOR USER
// ============================================================================

export interface VendorUser {
  id: number;
  auth_id: string;
  email: string;
  plan: number;
  status: string;
  premium_expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface VendorUserDetail extends VendorUser {
  api_token?: string; // Only available after email confirmation
  settings?: Record<string, unknown>;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface TorBoxApiResponse<T = unknown> {
  success: boolean;
  detail?: string;
  error?: string;
  data: T;
}

export interface RegisterUserResult {
  auth_id: string;
  email: string;
  detail?: string;
}

// ============================================================================
// CLIENT OPTIONS
// ============================================================================

export interface TorBoxVendorClientOptions {
  apiKey: string;
  baseUrl?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}
