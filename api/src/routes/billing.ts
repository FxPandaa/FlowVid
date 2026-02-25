/**
 * FlowVid API - Billing Routes
 * Handles subscription checkout, status, and Dodo Payments webhooks
 */

import { Router, Request, Response } from "express";
import express from "express";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  createCheckoutSession,
  getSubscriptionStatus,
  getSubscriptionByDodoId,
  transitionSubscription,
  updateDodoFields,
  verifyDodoWebhookSignature,
  isWebhookProcessed,
  markWebhookProcessed,
  auditLog,
} from "../services/billing/service.js";
import {
  BillingEvent,
  AuditEventType,
  SubscriptionStatus,
} from "../services/billing/types.js";
import { provisionUser } from "../services/provisioning/service.js";
import config from "../config/index.js";
import { BadRequestError, ForbiddenError } from "../utils/errors.js";

const router = Router();

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

/**
 * GET /billing/status
 * Get the current user's subscription status
 */
router.get(
  "/status",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const status = getSubscriptionStatus(userId);

    res.json({ success: true, data: status });
  }),
);

/**
 * POST /billing/checkout
 * Start a Dodo Payments checkout session for a new subscription
 */
router.post(
  "/checkout",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const userEmail = req.userEmail!;

    const result = await createCheckoutSession(userId, userEmail);

    res.json({
      success: true,
      data: {
        checkoutUrl: result.checkoutUrl,
        sessionId: result.sessionId,
      },
    });
  }),
);

/**
 * POST /billing/refresh-torbox
 * Manually trigger a re-check of TorBox email confirmation status
 */
router.post(
  "/refresh-torbox",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { pollEmailConfirmation } =
      await import("../services/provisioning/service.js");

    const confirmed = await pollEmailConfirmation(userId);

    const status = getSubscriptionStatus(userId);

    res.json({
      success: true,
      data: {
        confirmed,
        subscription: status,
      },
    });
  }),
);

// ============================================================================
// MOCK SUCCESS (Development only)
// ============================================================================

/**
 * GET /billing/mock-success
 * Simulates successful payment in development
 */
router.get(
  "/mock-success",
  asyncHandler(async (req: Request, res: Response) => {
    if (config.server.isProduction) {
      throw new ForbiddenError("Not available in production");
    }

    const { sub_id } = req.query;
    if (!sub_id || typeof sub_id !== "string") {
      throw new BadRequestError("Missing sub_id query parameter");
    }

    // Simulate payment success: transition to PAID_PENDING_PROVISION
    const sub = transitionSubscription(sub_id, BillingEvent.PAYMENT_SUCCESS, {
      mock: true,
    });

    updateDodoFields(sub_id, {
      dodoCustomerId: `mock_cus_${Date.now()}`,
      dodoSubscriptionId: `mock_sub_${Date.now()}`,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    // If TorBox vendor API is configured, start provisioning immediately
    if (config.torbox.vendorApiKey) {
      const user = (await import("../database/index.js"))
        .getDb()
        .prepare("SELECT email FROM users WHERE id = ?")
        .get(sub.user_id) as { email: string } | undefined;

      if (user) {
        // Fire-and-forget provisioning
        provisionUser(sub.user_id, user.email, sub_id).catch((err) =>
          console.error("[Mock] Provisioning error:", err),
        );
      }
    }

    res.json({
      success: true,
      message:
        "Mock payment successful. Subscription is now PAID_PENDING_PROVISION.",
      data: { subscriptionId: sub_id, status: sub.status },
    });
  }),
);

// ============================================================================
// DODO PAYMENTS WEBHOOK
// ============================================================================

/**
 * POST /billing/webhook
 * Dodo Payments webhook endpoint - receives payment & subscription events
 *
 * Uses raw body parsing for HMAC signature verification.
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(async (req: Request, res: Response) => {
    // In development without Dodo, just acknowledge
    if (!config.dodo.apiKey || config.dodo.apiKey === "placeholder") {
      console.log("[Webhook] Dodo Payments not configured, ignoring webhook");
      res.json({ received: true });
      return;
    }

    const sig = req.headers["webhook-signature"] as string;
    if (!sig) {
      throw new BadRequestError("Missing webhook-signature header");
    }

    const rawBody =
      typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : JSON.stringify(req.body);

    const isValid = verifyDodoWebhookSignature(
      rawBody,
      sig,
      config.dodo.webhookSecret,
    );

    if (!isValid) {
      console.error("[Webhook] Dodo signature verification failed");
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    const event = JSON.parse(rawBody);
    const eventId = event.event_id || event.payment_id || `dodo_${Date.now()}`;
    const eventType = event.type || event.event_type || "unknown";

    // Idempotency check
    if (isWebhookProcessed(eventId)) {
      console.log(`[Webhook] Event ${eventId} already processed, skipping`);
      res.json({ received: true });
      return;
    }

    auditLog(null, AuditEventType.WEBHOOK_RECEIVED, {
      eventId,
      type: eventType,
    });

    // Handle the event
    try {
      await handleDodoEvent(event);
      markWebhookProcessed(eventId, eventType, { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Webhook] Error handling ${eventType}:`, message);
      markWebhookProcessed(eventId, eventType, { error: message });
    }

    res.json({ received: true });
  }),
);

// ============================================================================
// DODO EVENT HANDLERS
// ============================================================================

async function handleDodoEvent(event: any): Promise<void> {
  const eventType = event.type || event.event_type;

  switch (eventType) {
    // ── Subscription activated / payment succeeded ──────────────────────
    case "subscription.active":
    case "payment.succeeded": {
      const data = event.data || event;
      const userId = data.metadata?.user_id;
      const subscriptionId = data.metadata?.subscription_id;
      const dodoSubscriptionId = data.subscription_id || data.id;
      const dodoCustomerId = data.customer?.customer_id || data.customer_id;

      if (!userId || !subscriptionId) {
        console.warn(`[Webhook] ${eventType} missing user metadata`);
        return;
      }

      // Update Dodo fields
      updateDodoFields(subscriptionId, {
        dodoCustomerId,
        dodoSubscriptionId,
        currentPeriodStart:
          data.current_period_start || new Date().toISOString(),
        currentPeriodEnd: data.current_period_end || data.next_billing_date,
      });

      // Transition to PAID_PENDING_PROVISION
      transitionSubscription(subscriptionId, BillingEvent.PAYMENT_SUCCESS);

      // Get user email and start provisioning
      const { getDb } = await import("../database/index.js");
      const user = getDb()
        .prepare("SELECT email FROM users WHERE id = ?")
        .get(userId) as { email: string } | undefined;

      if (user) {
        provisionUser(userId, user.email, subscriptionId).catch((err) =>
          console.error("[Webhook] Provisioning error:", err),
        );
      }
      break;
    }

    // ── Subscription renewal payment succeeded ──────────────────────────
    case "subscription.renewed":
    case "payment.refunded": {
      if (eventType === "payment.refunded") {
        // Handle refund as cancellation
        const data = event.data || event;
        const dodoSubId = data.subscription_id;
        if (!dodoSubId) return;

        const sub = getSubscriptionByDodoId(dodoSubId);
        if (sub) {
          try {
            transitionSubscription(sub.id, BillingEvent.SUBSCRIPTION_CANCELED);
          } catch {
            // Already canceled
          }
        }
        break;
      }

      // Renewal
      const data = event.data || event;
      const dodoSubId = data.subscription_id || data.id;
      if (!dodoSubId) return;

      const sub = getSubscriptionByDodoId(dodoSubId);
      if (sub) {
        updateDodoFields(sub.id, {
          currentPeriodStart:
            data.current_period_start || new Date().toISOString(),
          currentPeriodEnd: data.current_period_end || data.next_billing_date,
        });

        // If past due, recover
        if (sub.status === SubscriptionStatus.PAST_DUE) {
          transitionSubscription(sub.id, BillingEvent.PAYMENT_RECOVERED);
        }
      }
      break;
    }

    // ── Payment failed ──────────────────────────────────────────────────
    case "payment.failed": {
      const data = event.data || event;
      const dodoSubId = data.subscription_id;
      if (!dodoSubId) return;

      const sub = getSubscriptionByDodoId(dodoSubId);
      if (sub) {
        try {
          transitionSubscription(sub.id, BillingEvent.PAYMENT_FAILED);
        } catch {
          // Transition might not be valid from current state
        }
      }
      break;
    }

    // ── Subscription cancelled / expired ────────────────────────────────
    case "subscription.cancelled":
    case "subscription.expired":
    case "subscription.on_hold": {
      const data = event.data || event;
      const dodoSubId = data.subscription_id || data.id;
      if (!dodoSubId) return;

      const sub = getSubscriptionByDodoId(dodoSubId);
      if (sub) {
        try {
          transitionSubscription(sub.id, BillingEvent.SUBSCRIPTION_CANCELED);
        } catch {
          // Already canceled
        }
      }
      break;
    }

    // ── Subscription updated (e.g. cancel scheduled) ────────────────────
    case "subscription.updated": {
      const data = event.data || event;
      const dodoSubId = data.subscription_id || data.id;
      if (!dodoSubId) return;

      const sub = getSubscriptionByDodoId(dodoSubId);
      if (sub) {
        updateDodoFields(sub.id, {
          cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
          currentPeriodEnd: data.current_period_end || data.next_billing_date,
        });
      }
      break;
    }

    default:
      console.log(`[Webhook] Unhandled Dodo event type: ${eventType}`);
  }
}

export default router;
