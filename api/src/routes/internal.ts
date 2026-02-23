/**
 * FlowVid API - Internal/Operator Routes
 * Health checks, reconciliation, capacity monitoring, manual overrides
 *
 * Protected by a simple bearer token (INTERNAL_API_KEY env var)
 * These are NOT for end users — they're for you (the operator).
 */

import { Router, Request, Response, NextFunction } from "express";
import { getDb } from "../database/index.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import config from "../config/index.js";
import {
  transitionSubscription,
  getSubscription,
  auditLog,
} from "../services/billing/service.js";
import { reconcile, revokeUser } from "../services/provisioning/service.js";
import {
  SubscriptionStatus,
  BillingEvent,
  AuditEventType,
  type TorBoxUserRow,
} from "../services/billing/types.js";
import { UnauthorizedError, NotFoundError } from "../utils/errors.js";

const router = Router();

// ============================================================================
// OPERATOR AUTH MIDDLEWARE
// ============================================================================

function operatorAuth(req: Request, _res: Response, next: NextFunction): void {
  const key = config.internal.apiKey;

  // In development, allow unauthenticated access if no key is set
  if (!key && config.server.isDevelopment) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token || token !== key) {
    throw new UnauthorizedError("Invalid operator API key");
  }

  next();
}

router.use(operatorAuth);

// ============================================================================
// HEALTH & STATUS
// ============================================================================

/**
 * GET /internal/health
 * Extended health check with billing system status
 */
router.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    const db = getDb();

    const counts = {
      totalUsers: (
        db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }
      ).c,
      subscriptions: {
        active: (
          db
            .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = ?")
            .get(SubscriptionStatus.ACTIVE) as { c: number }
        ).c,
        pendingProvision: (
          db
            .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = ?")
            .get(SubscriptionStatus.PAID_PENDING_PROVISION) as { c: number }
        ).c,
        pendingConfirm: (
          db
            .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = ?")
            .get(SubscriptionStatus.PROVISIONED_PENDING_CONFIRM) as {
            c: number;
          }
        ).c,
        pastDue: (
          db
            .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = ?")
            .get(SubscriptionStatus.PAST_DUE) as { c: number }
        ).c,
        canceled: (
          db
            .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = ?")
            .get(SubscriptionStatus.CANCELED) as { c: number }
        ).c,
      },
      recentAuditEvents: (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM audit_log WHERE created_at > datetime('now', '-1 hour')",
          )
          .get() as { c: number }
      ).c,
    };

    // Latest capacity snapshot
    const capacity = db
      .prepare(
        "SELECT * FROM vendor_capacity ORDER BY recorded_at DESC LIMIT 1",
      )
      .get() as { users_allowed: number; current_users: number } | undefined;

    res.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        counts,
        vendorCapacity: capacity
          ? {
              allowed: capacity.users_allowed,
              current: capacity.current_users,
              available: capacity.users_allowed - capacity.current_users,
            }
          : null,
      },
    });
  }),
);

// ============================================================================
// RECONCILIATION
// ============================================================================

/**
 * POST /internal/reconcile
 * Run reconciliation between local DB and TorBox vendor API
 */
router.post(
  "/reconcile",
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await reconcile();

    res.json({
      success: true,
      data: result,
    });
  }),
);

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * GET /internal/subscriptions
 * List all subscriptions with optional status filter
 */
router.get(
  "/subscriptions",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { status } = req.query;

    let subs;
    if (status && typeof status === "string") {
      subs = db
        .prepare("SELECT * FROM subscriptions WHERE status = ?")
        .all(status);
    } else {
      subs = db.prepare("SELECT * FROM subscriptions").all();
    }

    res.json({ success: true, data: subs });
  }),
);

/**
 * GET /internal/subscriptions/:userId
 * Get detailed subscription info for a specific user
 */
router.get(
  "/subscriptions/:userId",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const db = getDb();

    const sub = getSubscription(userId);
    const torboxUser = db
      .prepare("SELECT * FROM torbox_users WHERE user_id = ?")
      .get(userId) as TorBoxUserRow | undefined;

    const recentAudit = db
      .prepare(
        "SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
      )
      .all(userId);

    if (!sub) {
      throw new NotFoundError("No subscription found for this user");
    }

    res.json({
      success: true,
      data: {
        subscription: sub,
        torboxUser: torboxUser
          ? { ...torboxUser, torbox_api_token_encrypted: "[REDACTED]" }
          : null,
        recentAuditLog: recentAudit,
      },
    });
  }),
);

/**
 * POST /internal/subscriptions/:userId/activate
 * Manually activate a subscription (operator override)
 */
router.post(
  "/subscriptions/:userId/activate",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const sub = getSubscription(userId);

    if (!sub) {
      throw new NotFoundError("No subscription found for this user");
    }

    const updated = transitionSubscription(
      sub.id,
      BillingEvent.MANUAL_ACTIVATE,
      {
        operator: true,
      },
    );

    auditLog(userId, AuditEventType.STATE_TRANSITION, {
      action: "manual_activate",
      operator: true,
    });

    res.json({ success: true, data: updated });
  }),
);

/**
 * POST /internal/subscriptions/:userId/revoke
 * Manually revoke a subscription and TorBox access
 */
router.post(
  "/subscriptions/:userId/revoke",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const sub = getSubscription(userId);

    if (!sub) {
      throw new NotFoundError("No subscription found for this user");
    }

    // Revoke TorBox access
    await revokeUser(userId);

    // Transition subscription
    try {
      transitionSubscription(sub.id, BillingEvent.MANUAL_REVOKE, {
        operator: true,
      });
    } catch {
      // May already be in a terminal state
    }

    auditLog(userId, AuditEventType.STATE_TRANSITION, {
      action: "manual_revoke",
      operator: true,
    });

    const updated = getSubscription(userId);
    res.json({ success: true, data: updated });
  }),
);

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * GET /internal/audit
 * Query audit log with optional filters
 */
router.get(
  "/audit",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const userId = req.query.userId as string | undefined;
    const eventType = req.query.eventType as string | undefined;
    const limitStr = req.query.limit as string | undefined;
    const limit = Math.min(parseInt(limitStr ?? "50") || 50, 500);

    let query = "SELECT * FROM audit_log WHERE 1=1";
    const params: unknown[] = [];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    if (eventType) {
      query += " AND event_type = ?";
      params.push(eventType);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const logs = db.prepare(query).all(...params);

    res.json({ success: true, data: logs });
  }),
);

export default router;
