/**
 * FlowVid API - Billing Service
 * Handles Dodo Payments checkout, subscription management, and state transitions
 */

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDb } from "../../database/index.js";
import config from "../../config/index.js";
import {
  SubscriptionStatus,
  BillingEvent,
  AuditEventType,
  type SubscriptionRow,
  type SubscriptionStatusResponse,
} from "./types.js";
import { transition } from "./stateMachine.js";

// ============================================================================
// DODO PAYMENTS API CLIENT
// ============================================================================

const DODO_API_BASE = "https://api.dodopayments.com";

async function dodoRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${DODO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.dodo.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dodo API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ============================================================================
// SUBSCRIPTION QUERIES
// ============================================================================

/**
 * Get or create a subscription record for a user
 */
export function getOrCreateSubscription(userId: string): SubscriptionRow {
  const db = getDb();

  let sub = db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
    .get(userId) as SubscriptionRow | undefined;

  if (!sub) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, status, plan)
       VALUES (?, ?, ?, ?)`,
    ).run(id, userId, SubscriptionStatus.NOT_SUBSCRIBED, "standard");

    sub = db
      .prepare("SELECT * FROM subscriptions WHERE id = ?")
      .get(id) as SubscriptionRow;
  }

  return sub;
}

/**
 * Get subscription by user ID (null if none)
 */
export function getSubscription(userId: string): SubscriptionRow | null {
  const db = getDb();
  const sub = db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
    .get(userId) as SubscriptionRow | undefined;
  return sub ?? null;
}

/**
 * Get subscription by Dodo subscription ID
 */
export function getSubscriptionByDodoId(
  dodoSubscriptionId: string,
): SubscriptionRow | null {
  const db = getDb();
  const sub = db
    .prepare("SELECT * FROM subscriptions WHERE dodo_subscription_id = ?")
    .get(dodoSubscriptionId) as SubscriptionRow | undefined;
  return sub ?? null;
}

/**
 * Get all subscriptions in a given status
 */
export function getSubscriptionsByStatus(
  status: SubscriptionStatus,
): SubscriptionRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM subscriptions WHERE status = ?")
    .all(status) as SubscriptionRow[];
}

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

/**
 * Transition a subscription to a new state via a billing event.
 * This is the ONLY way to change subscription status.
 * Returns the updated subscription.
 */
export function transitionSubscription(
  subscriptionId: string,
  event: BillingEvent,
  metadata?: Record<string, unknown>,
): SubscriptionRow {
  const db = getDb();

  const sub = db
    .prepare("SELECT * FROM subscriptions WHERE id = ?")
    .get(subscriptionId) as SubscriptionRow | undefined;

  if (!sub) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }

  const currentStatus = sub.status as SubscriptionStatus;
  const newStatus = transition(currentStatus, event);

  // Update the subscription
  db.prepare(
    `UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(newStatus, subscriptionId);

  // Audit log the transition
  auditLog(sub.user_id, AuditEventType.STATE_TRANSITION, {
    subscriptionId,
    from: currentStatus,
    to: newStatus,
    event,
    ...metadata,
  });

  console.log(
    `[Billing] Subscription ${subscriptionId}: ${currentStatus} → ${newStatus} (via ${event})`,
  );

  return db
    .prepare("SELECT * FROM subscriptions WHERE id = ?")
    .get(subscriptionId) as SubscriptionRow;
}

/**
 * Update Dodo payment fields on a subscription
 */
export function updateDodoFields(
  subscriptionId: string,
  fields: {
    dodoCustomerId?: string;
    dodoSubscriptionId?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  },
): void {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (fields.dodoCustomerId !== undefined) {
    updates.push("dodo_customer_id = ?");
    values.push(fields.dodoCustomerId);
  }
  if (fields.dodoSubscriptionId !== undefined) {
    updates.push("dodo_subscription_id = ?");
    values.push(fields.dodoSubscriptionId);
  }
  if (fields.currentPeriodStart !== undefined) {
    updates.push("current_period_start = ?");
    values.push(fields.currentPeriodStart);
  }
  if (fields.currentPeriodEnd !== undefined) {
    updates.push("current_period_end = ?");
    values.push(fields.currentPeriodEnd);
  }
  if (fields.cancelAtPeriodEnd !== undefined) {
    updates.push("cancel_at_period_end = ?");
    values.push(fields.cancelAtPeriodEnd ? 1 : 0);
  }

  if (updates.length === 0) return;

  updates.push("updated_at = datetime('now')");
  values.push(subscriptionId);

  db.prepare(`UPDATE subscriptions SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values,
  );
}

// ============================================================================
// DODO PAYMENTS CHECKOUT
// ============================================================================

/**
 * Create a Dodo Payments checkout session for a new subscription.
 * Returns the checkout URL for the user to complete payment.
 *
 * In development/testing without API key, returns a mock checkout URL.
 */
export async function createCheckoutSession(
  userId: string,
  userEmail: string,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const sub = getOrCreateSubscription(userId);

  // Don't allow checkout if already active
  if (sub.status === SubscriptionStatus.ACTIVE) {
    throw new Error("Already have an active subscription");
  }

  auditLog(userId, AuditEventType.CHECKOUT_STARTED, { subscriptionId: sub.id });

  // In development or if Dodo isn't configured, return a mock
  if (!config.dodo.apiKey || config.dodo.apiKey === "placeholder") {
    console.log(
      "[Billing] Dodo Payments not configured, returning mock checkout",
    );

    const mockSessionId = `mock_session_${uuidv4()}`;

    return {
      checkoutUrl: `http://localhost:${config.server.port}/billing/mock-success?session_id=${mockSessionId}&sub_id=${sub.id}`,
      sessionId: mockSessionId,
    };
  }

  // Real Dodo Payments integration
  const session = await dodoRequest<{
    payment_link: string;
    payment_id: string;
    customer: { customer_id: string };
  }>("POST", "/payments", {
    billing: { currency: "EUR" },
    product_cart: [
      {
        product_id: config.dodo.productId,
        quantity: 1,
      },
    ],
    customer: {
      email: userEmail,
    },
    payment_link: true,
    return_url: config.dodo.successUrl,
    metadata: {
      user_id: userId,
      subscription_id: sub.id,
    },
  });

  // Store the Dodo customer reference
  if (session.customer?.customer_id) {
    updateDodoFields(sub.id, {
      dodoCustomerId: session.customer.customer_id,
    });
  }

  return {
    checkoutUrl: session.payment_link,
    sessionId: session.payment_id,
  };
}

// ============================================================================
// STATUS API
// ============================================================================

/**
 * Get the full subscription status for the API response
 */
export function getSubscriptionStatus(
  userId: string,
): SubscriptionStatusResponse {
  const db = getDb();
  const sub = getSubscription(userId);
  const torboxUser = db
    .prepare("SELECT * FROM torbox_users WHERE user_id = ?")
    .get(userId) as
    | {
        status: string;
        torbox_email: string;
      }
    | undefined;

  const status =
    (sub?.status as SubscriptionStatus) ?? SubscriptionStatus.NOT_SUBSCRIBED;

  const tier = status === SubscriptionStatus.ACTIVE ? "FlowVid_plus" : "free";

  return {
    status,
    tier,
    plan: sub?.plan ?? "none",
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === 1,
    torbox: {
      status: (torboxUser?.status as any) ?? null,
      email: torboxUser?.torbox_email ?? null,
      needsEmailConfirmation:
        status === SubscriptionStatus.PROVISIONED_PENDING_CONFIRM,
    },
  };
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify Dodo Payments webhook signature (HMAC-SHA256).
 * Dodo sends: webhook-signature: v1,<base64-signature>
 */
export function verifyDodoWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    // Parse "v1,<base64-signature>" format
    const parts = signatureHeader.split(",");
    if (parts.length < 2 || parts[0] !== "v1") return false;
    const receivedSig = parts[1];

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(receivedSig, "base64"),
      Buffer.from(expected, "base64"),
    );
  } catch {
    return false;
  }
}

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * Write an entry to the audit log
 */
export function auditLog(
  userId: string | null,
  eventType: AuditEventType | string,
  eventData?: Record<string, unknown>,
  correlationId?: string,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (user_id, event_type, event_data, correlation_id)
     VALUES (?, ?, ?, ?)`,
  ).run(
    userId,
    eventType,
    eventData ? JSON.stringify(eventData) : null,
    correlationId ?? null,
  );
}

// ============================================================================
// WEBHOOK IDEMPOTENCY
// ============================================================================

/**
 * Check if a webhook event has already been processed
 */
export function isWebhookProcessed(eventId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT event_id FROM webhook_events WHERE event_id = ?")
    .get(eventId);
  return !!row;
}

/**
 * Mark a webhook event as processed
 */
export function markWebhookProcessed(
  eventId: string,
  eventType: string,
  result?: unknown,
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO webhook_events (event_id, event_type, result)
     VALUES (?, ?, ?)`,
  ).run(eventId, eventType, result ? JSON.stringify(result) : null);
}
