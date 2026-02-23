/**
 * FlowVid API - Background Provisioning Worker
 * Periodically checks for:
 * 1. Subscriptions needing provisioning (PAID_PENDING_PROVISION)
 * 2. Users awaiting email confirmation (PROVISIONED_PENDING_CONFIRM)
 * 3. Subscriptions needing revocation (CANCELED/EXPIRED with active TorBox)
 */

import { getDb } from "../../database/index.js";
import {
  SubscriptionStatus,
  TorBoxUserStatus,
  type TorBoxUserRow,
} from "../billing/types.js";
import { getSubscriptionsByStatus } from "../billing/service.js";
import { provisionUser, pollEmailConfirmation, revokeUser } from "./service.js";

const POLL_INTERVAL_MS = 60_000; // 1 minute
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Start the background provisioning worker
 */
export function startProvisioningWorker(): void {
  if (intervalHandle) {
    console.warn("[Worker] Provisioning worker already running");
    return;
  }

  console.log(
    `[Worker] Starting provisioning worker (interval: ${POLL_INTERVAL_MS / 1000}s)`,
  );

  // Run immediately, then on interval
  runProvisioningCycle().catch((err) =>
    console.error("[Worker] Initial cycle error:", err),
  );

  intervalHandle = setInterval(() => {
    runProvisioningCycle().catch((err) =>
      console.error("[Worker] Cycle error:", err),
    );
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the background provisioning worker
 */
export function stopProvisioningWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[Worker] Provisioning worker stopped");
  }
}

/**
 * Run one cycle of provisioning checks
 */
async function runProvisioningCycle(): Promise<void> {
  const db = getDb();

  // 1. Process PAID_PENDING_PROVISION subscriptions
  const needsProvisioning = getSubscriptionsByStatus(
    SubscriptionStatus.PAID_PENDING_PROVISION,
  );

  for (const sub of needsProvisioning) {
    try {
      // Get user email
      const user = db
        .prepare("SELECT email FROM users WHERE id = ?")
        .get(sub.user_id) as { email: string } | undefined;

      if (!user) {
        console.error(
          `[Worker] User ${sub.user_id} not found for subscription ${sub.id}`,
        );
        continue;
      }

      await provisionUser(sub.user_id, user.email, sub.id);
    } catch (error) {
      console.error(
        `[Worker] Error provisioning subscription ${sub.id}:`,
        error,
      );
    }
  }

  // 2. Poll email confirmations for PROVISIONED_PENDING_CONFIRM
  const pendingConfirm = getSubscriptionsByStatus(
    SubscriptionStatus.PROVISIONED_PENDING_CONFIRM,
  );

  for (const sub of pendingConfirm) {
    try {
      await pollEmailConfirmation(sub.user_id);
    } catch (error) {
      console.error(
        `[Worker] Error polling confirmation for ${sub.user_id}:`,
        error,
      );
    }
  }

  // 3. Revoke TorBox users for CANCELED/EXPIRED subscriptions
  const needsRevocation = [
    ...getSubscriptionsByStatus(SubscriptionStatus.CANCELED),
    ...getSubscriptionsByStatus(SubscriptionStatus.EXPIRED),
  ];

  for (const sub of needsRevocation) {
    try {
      // Only revoke if TorBox user is still active
      const torboxUser = db
        .prepare("SELECT * FROM torbox_users WHERE user_id = ? AND status != ?")
        .get(sub.user_id, TorBoxUserStatus.REVOKED) as
        | TorBoxUserRow
        | undefined;

      if (torboxUser) {
        await revokeUser(sub.user_id);
      }
    } catch (error) {
      console.error(
        `[Worker] Error revoking user for subscription ${sub.id}:`,
        error,
      );
    }
  }

  // Log summary if there was work to do
  const totalWork =
    needsProvisioning.length + pendingConfirm.length + needsRevocation.length;

  if (totalWork > 0) {
    console.log(
      `[Worker] Cycle complete: ${needsProvisioning.length} provisions, ` +
        `${pendingConfirm.length} confirmations, ${needsRevocation.length} revocations`,
    );
  }
}
