/**
 * FlowVid API - Billing & Subscription Types
 * State machine types for the paid access → TorBox vendor provisioning system
 */

// ============================================================================
// SUBSCRIPTION STATE MACHINE
// ============================================================================

/**
 * Subscription states - the complete lifecycle
 *
 * Flow:
 *   NOT_SUBSCRIBED
 *     → PAID_PENDING_PROVISION       (Stripe payment succeeds)
 *     → PROVISIONED_PENDING_CONFIRM  (TorBox user created, awaiting email confirm)
 *     → ACTIVE                        (TorBox API token acquired)
 *     → PAST_DUE                      (Stripe payment fails)
 *     → CANCELED                      (User cancels / payment timeout)
 *     → EXPIRED                       (Period ends without renewal)
 */
export enum SubscriptionStatus {
  NOT_SUBSCRIBED = "not_subscribed",
  PAID_PENDING_PROVISION = "paid_pending_provision",
  PROVISIONED_PENDING_CONFIRM = "provisioned_pending_confirm",
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  EXPIRED = "expired",
}

/**
 * TorBox vendor user provisioning states
 */
export enum TorBoxUserStatus {
  PENDING_PROVISION = "pending_provision",
  PENDING_EMAIL_CONFIRM = "pending_email_confirm",
  ACTIVE = "active",
  REVOKED = "revoked",
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  plan: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

export interface TorBoxUserRow {
  id: string;
  user_id: string;
  subscription_id: string | null;
  vendor_user_auth_id: string | null;
  torbox_email: string;
  torbox_api_token_encrypted: string | null;
  status: TorBoxUserStatus;
  provision_attempts: number;
  last_provision_attempt: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export interface AuditLogRow {
  id: number;
  user_id: string | null;
  event_type: string;
  event_data: string | null;
  correlation_id: string | null;
  created_at: string;
}

export interface WebhookEventRow {
  event_id: string;
  event_type: string;
  processed_at: string;
  result: string | null;
}

export interface VendorCapacityRow {
  id: number;
  users_allowed: number;
  current_users: number;
  vendor_status: string;
  recorded_at: string;
}

// ============================================================================
// STATE TRANSITION EVENTS
// ============================================================================

export enum BillingEvent {
  PAYMENT_SUCCESS = "payment_success",
  PAYMENT_FAILED = "payment_failed",
  TORBOX_USER_CREATED = "torbox_user_created",
  TORBOX_EMAIL_CONFIRMED = "torbox_email_confirmed",
  TORBOX_TOKEN_ACQUIRED = "torbox_token_acquired",
  SUBSCRIPTION_CANCELED = "subscription_canceled",
  PERIOD_EXPIRED = "period_expired",
  PAYMENT_RECOVERED = "payment_recovered",
  TORBOX_USER_REVOKED = "torbox_user_revoked",
  MANUAL_ACTIVATE = "manual_activate",
  MANUAL_REVOKE = "manual_revoke",
}

// ============================================================================
// AUDIT EVENT TYPES
// ============================================================================

export enum AuditEventType {
  // Payment events
  PAYMENT_SUCCESS = "payment_success",
  PAYMENT_FAILED = "payment_failed",
  CHECKOUT_STARTED = "checkout_started",
  SUBSCRIPTION_CREATED = "subscription_created",
  SUBSCRIPTION_CANCELED = "subscription_canceled",

  // Provisioning events
  PROVISION_STARTED = "provision_started",
  PROVISION_COMPLETED = "provision_completed",
  PROVISION_FAILED = "provision_failed",
  EMAIL_CONFIRM_PENDING = "email_confirm_pending",
  TOKEN_ACQUIRED = "token_acquired",

  // Revocation events
  REVOCATION_STARTED = "revocation_started",
  REVOCATION_COMPLETED = "revocation_completed",
  REVOCATION_FAILED = "revocation_failed",

  // Reconciliation events
  RECONCILIATION_RUN = "reconciliation_run",
  RECONCILIATION_DRIFT = "reconciliation_drift",

  // Webhook events
  WEBHOOK_RECEIVED = "webhook_received",
  WEBHOOK_PROCESSED = "webhook_processed",

  // State transitions
  STATE_TRANSITION = "state_transition",
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface SubscriptionStatusResponse {
  status: SubscriptionStatus;
  tier: "free" | "FlowVid_plus";
  plan: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  torbox: {
    status: TorBoxUserStatus | null;
    email: string | null;
    needsEmailConfirmation: boolean;
  };
}

export interface CheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

export interface PortalResponse {
  portalUrl: string;
}
