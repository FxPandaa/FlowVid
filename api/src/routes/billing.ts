/**
 * FlowVid API - Billing Routes
 * Handles subscription checkout, status, portal, and Stripe webhooks
 */

import { Router, Request, Response } from "express";
import express from "express";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  transitionSubscription,
  updateStripeFields,
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
 * Start a Stripe Checkout session for a new subscription
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
 * POST /billing/portal
 * Create a Stripe Customer Portal session for managing subscription
 */
router.post(
  "/portal",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const result = await createPortalSession(userId);

    res.json({
      success: true,
      data: { portalUrl: result.portalUrl },
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
 * Simulates successful Stripe payment in development
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

    updateStripeFields(sub_id, {
      stripeCustomerId: `mock_cus_${Date.now()}`,
      stripeSubscriptionId: `mock_sub_${Date.now()}`,
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
// STRIPE WEBHOOK
// ============================================================================

/**
 * POST /billing/webhook
 * Stripe webhook endpoint - receives payment events
 *
 * IMPORTANT: This route must use raw body parsing for signature verification.
 * Mount this BEFORE the JSON body parser in index.ts, or use express.raw().
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(async (req: Request, res: Response) => {
    // In development without Stripe, just acknowledge
    if (
      !config.stripe.secretKey ||
      config.stripe.secretKey === "sk_test_placeholder"
    ) {
      console.log("[Webhook] Stripe not configured, ignoring webhook");
      res.json({ received: true });
      return;
    }

    const sig = req.headers["stripe-signature"] as string;
    if (!sig) {
      throw new BadRequestError("Missing stripe-signature header");
    }

    let event: any;
    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(config.stripe.secretKey);
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        config.stripe.webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Webhook] Signature verification failed: ${message}`);
      res.status(400).json({ error: `Webhook Error: ${message}` });
      return;
    }

    // Idempotency check
    if (isWebhookProcessed(event.id)) {
      console.log(`[Webhook] Event ${event.id} already processed, skipping`);
      res.json({ received: true });
      return;
    }

    auditLog(null, AuditEventType.WEBHOOK_RECEIVED, {
      eventId: event.id,
      type: event.type,
    });

    // Handle the event
    try {
      await handleStripeEvent(event);
      markWebhookProcessed(event.id, event.type, { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Webhook] Error handling ${event.type}:`, message);
      markWebhookProcessed(event.id, event.type, { error: message });
    }

    res.json({ received: true });
  }),
);

// ============================================================================
// STRIPE EVENT HANDLERS
// ============================================================================

async function handleStripeEvent(event: any): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const subscriptionId = session.metadata?.subscriptionId;

      if (!userId || !subscriptionId) {
        console.warn("[Webhook] checkout.session.completed missing metadata");
        return;
      }

      // Update Stripe fields
      updateStripeFields(subscriptionId, {
        stripeCustomerId:
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id,
        stripeSubscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id,
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

    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const stripeSubId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;

      if (!stripeSubId) return;

      const { getSubscriptionByStripeId } =
        await import("../services/billing/service.js");
      const sub = getSubscriptionByStripeId(stripeSubId);

      if (sub) {
        // Update period dates
        updateStripeFields(sub.id, {
          currentPeriodStart: new Date(
            invoice.period_start * 1000,
          ).toISOString(),
          currentPeriodEnd: new Date(invoice.period_end * 1000).toISOString(),
        });

        // If past due, recover
        if (sub.status === SubscriptionStatus.PAST_DUE) {
          transitionSubscription(sub.id, BillingEvent.PAYMENT_RECOVERED);
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const stripeSubId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;

      if (!stripeSubId) return;

      const { getSubscriptionByStripeId } =
        await import("../services/billing/service.js");
      const sub = getSubscriptionByStripeId(stripeSubId);

      if (sub) {
        try {
          transitionSubscription(sub.id, BillingEvent.PAYMENT_FAILED);
        } catch {
          // Transition might not be valid from current state
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const stripeSubId = subscription.id;

      const { getSubscriptionByStripeId } =
        await import("../services/billing/service.js");
      const sub = getSubscriptionByStripeId(stripeSubId);

      if (sub) {
        try {
          transitionSubscription(sub.id, BillingEvent.SUBSCRIPTION_CANCELED);
        } catch {
          // Already canceled
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const stripeSubId = subscription.id;

      const { getSubscriptionByStripeId } =
        await import("../services/billing/service.js");
      const sub = getSubscriptionByStripeId(stripeSubId);

      if (sub) {
        updateStripeFields(sub.id, {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: new Date(
            subscription.current_period_end * 1000,
          ).toISOString(),
        });
      }
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }
}

export default router;
