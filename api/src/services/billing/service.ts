/**
 * FlowVid API - Billing Service
 * Handles Stripe checkout, subscription management, and state transitions
 */

import { v4 as uuidv4 } from "uuid";
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
 * Get subscription by Stripe subscription ID
 */
export function getSubscriptionByStripeId(
  stripeSubscriptionId: string,
): SubscriptionRow | null {
  const db = getDb();
  const sub = db
    .prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?")
    .get(stripeSubscriptionId) as SubscriptionRow | undefined;
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
 * Update Stripe fields on a subscription
 */
export function updateStripeFields(
  subscriptionId: string,
  fields: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  },
): void {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (fields.stripeCustomerId !== undefined) {
    updates.push("stripe_customer_id = ?");
    values.push(fields.stripeCustomerId);
  }
  if (fields.stripeSubscriptionId !== undefined) {
    updates.push("stripe_subscription_id = ?");
    values.push(fields.stripeSubscriptionId);
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
// STRIPE CHECKOUT
// ============================================================================

/**
 * Create a Stripe Checkout Session for a new subscription.
 * Returns the checkout URL for the user to complete payment.
 *
 * NOTE: Stripe SDK will be initialized lazily when needed.
 * In development/testing, this returns a mock checkout URL.
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

  // In development or if Stripe isn't configured, return a mock
  if (
    !config.stripe.secretKey ||
    config.stripe.secretKey === "sk_test_placeholder"
  ) {
    console.log("[Billing] Stripe not configured, returning mock checkout");

    // Simulate immediate payment success for development
    const mockSessionId = `mock_session_${uuidv4()}`;

    return {
      checkoutUrl: `http://localhost:${config.server.port}/billing/mock-success?session_id=${mockSessionId}&sub_id=${sub.id}`,
      sessionId: mockSessionId,
    };
  }

  // Real Stripe integration
  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: userEmail,
    line_items: [
      {
        price: config.stripe.priceId,
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      subscriptionId: sub.id,
    },
    success_url: config.stripe.successUrl + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: config.stripe.cancelUrl,
  });

  // Store the Stripe customer reference
  if (session.customer) {
    updateStripeFields(sub.id, {
      stripeCustomerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer.id,
    });
  }

  return {
    checkoutUrl: session.url!,
    sessionId: session.id,
  };
}

/**
 * Create a Stripe Customer Portal session for subscription management
 */
export async function createPortalSession(
  userId: string,
): Promise<{ portalUrl: string }> {
  const sub = getSubscription(userId);
  if (!sub?.stripe_customer_id) {
    throw new Error("No Stripe customer found for this user");
  }

  if (
    !config.stripe.secretKey ||
    config.stripe.secretKey === "sk_test_placeholder"
  ) {
    return { portalUrl: "#mock-portal" };
  }

  const stripe = await getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: config.stripe.cancelUrl, // Return to app
  });

  return { portalUrl: session.url };
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

// ============================================================================
// STRIPE LAZY INIT
// ============================================================================

let stripeInstance: any = null;

async function getStripe() {
  if (!stripeInstance) {
    // Dynamic import so we don't blow up if stripe isn't installed yet
    const { default: Stripe } = await import("stripe");
    stripeInstance = new Stripe(config.stripe.secretKey);
  }
  return stripeInstance;
}
