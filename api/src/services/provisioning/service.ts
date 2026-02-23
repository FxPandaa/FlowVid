/**
 * FlowVid API - TorBox Provisioning Service
 * Orchestrates TorBox vendor user creation, email confirmation polling,
 * token acquisition, and revocation
 */

import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../database/index.js";
import config from "../../config/index.js";
import { TorBoxVendorClient } from "../torbox/client.js";
import { encrypt } from "../../utils/crypto.js";
import {
  SubscriptionStatus,
  BillingEvent,
  AuditEventType,
  TorBoxUserStatus,
  type TorBoxUserRow,
} from "../billing/types.js";
import { transitionSubscription, auditLog } from "../billing/service.js";

const MAX_PROVISION_ATTEMPTS = 5;

// Lazy-initialized client
let vendorClient: TorBoxVendorClient | null = null;

function getVendorClient(): TorBoxVendorClient {
  if (!vendorClient) {
    if (!config.torbox.vendorApiKey) {
      throw new Error("TorBox vendor API key not configured");
    }
    vendorClient = new TorBoxVendorClient({
      apiKey: config.torbox.vendorApiKey,
    });
  }
  return vendorClient;
}

// ============================================================================
// PROVISION A NEW USER
// ============================================================================

/**
 * Provision a TorBox vendor user for a subscription.
 * Called after payment success.
 *
 * Flow:
 * 1. Check vendor capacity
 * 2. Register user with their email via TorBox Vendor API
 * 3. Store the vendor_user_auth_id
 * 4. Transition subscription to PROVISIONED_PENDING_CONFIRM
 * 5. User must confirm their email on TorBox's side
 */
export async function provisionUser(
  userId: string,
  email: string,
  subscriptionId: string,
): Promise<void> {
  const db = getDb();
  const client = getVendorClient();
  const correlationId = uuidv4();

  auditLog(userId, AuditEventType.PROVISION_STARTED, {
    email,
    subscriptionId,
    correlationId,
  });

  try {
    // Check capacity first
    const hasCapacity = await client.hasCapacity();
    if (!hasCapacity) {
      auditLog(userId, AuditEventType.PROVISION_FAILED, {
        reason: "no_capacity",
        correlationId,
      });
      console.error(
        `[Provisioning] No vendor capacity available for user ${userId}`,
      );
      // Don't throw — leave in PAID_PENDING_PROVISION for retry
      return;
    }

    // Check if user already has a TorBox record
    let torboxUser = db
      .prepare("SELECT * FROM torbox_users WHERE user_id = ?")
      .get(userId) as TorBoxUserRow | undefined;

    if (torboxUser && torboxUser.status === TorBoxUserStatus.ACTIVE) {
      console.log(
        `[Provisioning] User ${userId} already has active TorBox account`,
      );
      // Ensure subscription is ACTIVE
      transitionSubscription(
        subscriptionId,
        BillingEvent.TORBOX_TOKEN_ACQUIRED,
      );
      return;
    }

    if (
      torboxUser &&
      torboxUser.status === TorBoxUserStatus.PENDING_EMAIL_CONFIRM
    ) {
      console.log(
        `[Provisioning] User ${userId} already pending email confirm, skipping registration`,
      );
      return;
    }

    // Register with TorBox
    const result = await client.registerUser(email);

    if (torboxUser) {
      // Update existing record
      db.prepare(
        `UPDATE torbox_users SET
          vendor_user_auth_id = ?,
          torbox_email = ?,
          status = ?,
          subscription_id = ?,
          provision_attempts = provision_attempts + 1,
          last_provision_attempt = datetime('now'),
          updated_at = datetime('now'),
          revoked_at = NULL
        WHERE user_id = ?`,
      ).run(
        result.auth_id,
        email,
        TorBoxUserStatus.PENDING_EMAIL_CONFIRM,
        subscriptionId,
        userId,
      );
    } else {
      // Create new record
      db.prepare(
        `INSERT INTO torbox_users
          (id, user_id, subscription_id, vendor_user_auth_id, torbox_email, status, provision_attempts, last_provision_attempt)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      ).run(
        uuidv4(),
        userId,
        subscriptionId,
        result.auth_id,
        email,
        TorBoxUserStatus.PENDING_EMAIL_CONFIRM,
      );
    }

    // Transition subscription
    transitionSubscription(subscriptionId, BillingEvent.TORBOX_USER_CREATED, {
      correlationId,
    });

    auditLog(userId, AuditEventType.EMAIL_CONFIRM_PENDING, {
      vendorUserAuthId: result.auth_id,
      email,
      correlationId,
    });

    console.log(
      `[Provisioning] User ${userId} registered with TorBox (auth_id: ${result.auth_id}), awaiting email confirmation`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Increment attempt counter
    db.prepare(
      `UPDATE torbox_users SET
        provision_attempts = provision_attempts + 1,
        last_provision_attempt = datetime('now'),
        updated_at = datetime('now')
      WHERE user_id = ?`,
    ).run(userId);

    auditLog(userId, AuditEventType.PROVISION_FAILED, {
      error: message,
      correlationId,
    });

    console.error(
      `[Provisioning] Failed to provision user ${userId}:`,
      message,
    );

    // Check if we've exceeded max attempts
    const torboxUser = db
      .prepare("SELECT provision_attempts FROM torbox_users WHERE user_id = ?")
      .get(userId) as { provision_attempts: number } | undefined;

    if (torboxUser && torboxUser.provision_attempts >= MAX_PROVISION_ATTEMPTS) {
      console.error(
        `[Provisioning] User ${userId} exceeded max provision attempts (${MAX_PROVISION_ATTEMPTS})`,
      );
      // TODO: Alert operator, maybe email notification
    }
  }
}

// ============================================================================
// POLL FOR EMAIL CONFIRMATION
// ============================================================================

/**
 * Check if a TorBox vendor user has confirmed their email.
 * If confirmed, acquire their API token and encrypt it.
 *
 * Returns true if the user is now fully active.
 */
export async function pollEmailConfirmation(userId: string): Promise<boolean> {
  const db = getDb();
  const client = getVendorClient();

  const torboxUser = db
    .prepare("SELECT * FROM torbox_users WHERE user_id = ?")
    .get(userId) as TorBoxUserRow | undefined;

  if (!torboxUser || !torboxUser.vendor_user_auth_id) {
    console.warn(`[Provisioning] No TorBox user record for ${userId}`);
    return false;
  }

  if (torboxUser.status === TorBoxUserStatus.ACTIVE) {
    return true; // Already done
  }

  try {
    const account = await client.getSingleAccount(
      torboxUser.vendor_user_auth_id,
    );

    // Check if api_token is available (indicates email confirmed)
    if (account.api_token) {
      // Encrypt and store the token
      const encryptedToken = encrypt(account.api_token);

      db.prepare(
        `UPDATE torbox_users SET
          torbox_api_token_encrypted = ?,
          status = ?,
          updated_at = datetime('now')
        WHERE user_id = ?`,
      ).run(encryptedToken, TorBoxUserStatus.ACTIVE, userId);

      // Transition subscription to ACTIVE
      const sub = db
        .prepare(
          "SELECT id FROM subscriptions WHERE user_id = ? AND status IN (?, ?)",
        )
        .get(
          userId,
          SubscriptionStatus.PROVISIONED_PENDING_CONFIRM,
          SubscriptionStatus.PAID_PENDING_PROVISION,
        ) as { id: string } | undefined;

      if (sub) {
        transitionSubscription(sub.id, BillingEvent.TORBOX_TOKEN_ACQUIRED);
      }

      auditLog(userId, AuditEventType.TOKEN_ACQUIRED, {
        vendorUserAuthId: torboxUser.vendor_user_auth_id,
      });

      console.log(
        `[Provisioning] User ${userId} email confirmed, token acquired and encrypted`,
      );
      return true;
    }

    return false; // Still waiting for confirmation
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Provisioning] Error polling email confirmation for ${userId}:`,
      message,
    );
    return false;
  }
}

// ============================================================================
// REVOKE A USER
// ============================================================================

/**
 * Revoke a TorBox vendor user (remove their access)
 * Called when subscription is canceled/expired.
 */
export async function revokeUser(userId: string): Promise<void> {
  const db = getDb();
  const client = getVendorClient();

  const torboxUser = db
    .prepare("SELECT * FROM torbox_users WHERE user_id = ?")
    .get(userId) as TorBoxUserRow | undefined;

  if (!torboxUser || !torboxUser.vendor_user_auth_id) {
    console.warn(`[Provisioning] No TorBox user to revoke for ${userId}`);
    return;
  }

  if (torboxUser.status === TorBoxUserStatus.REVOKED) {
    console.log(`[Provisioning] User ${userId} already revoked`);
    return;
  }

  auditLog(userId, AuditEventType.REVOCATION_STARTED, {
    vendorUserAuthId: torboxUser.vendor_user_auth_id,
  });

  try {
    await client.removeUser(torboxUser.vendor_user_auth_id);

    db.prepare(
      `UPDATE torbox_users SET
        status = ?,
        torbox_api_token_encrypted = NULL,
        revoked_at = datetime('now'),
        updated_at = datetime('now')
      WHERE user_id = ?`,
    ).run(TorBoxUserStatus.REVOKED, userId);

    // Transition subscription
    const sub = db
      .prepare(
        "SELECT id FROM subscriptions WHERE user_id = ? AND status IN (?, ?)",
      )
      .get(userId, SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED) as
      | { id: string }
      | undefined;

    if (sub) {
      transitionSubscription(sub.id, BillingEvent.TORBOX_USER_REVOKED);
    }

    auditLog(userId, AuditEventType.REVOCATION_COMPLETED, {
      vendorUserAuthId: torboxUser.vendor_user_auth_id,
    });

    console.log(`[Provisioning] User ${userId} revoked from TorBox`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditLog(userId, AuditEventType.REVOCATION_FAILED, {
      error: message,
      vendorUserAuthId: torboxUser.vendor_user_auth_id,
    });
    console.error(`[Provisioning] Failed to revoke user ${userId}:`, message);
  }
}

// ============================================================================
// RECONCILIATION
// ============================================================================

/**
 * Reconcile local DB state with TorBox vendor API.
 * Compares our records against the actual vendor user list.
 */
export async function reconcile(): Promise<{
  checked: number;
  drifts: string[];
}> {
  const db = getDb();
  const client = getVendorClient();

  const drifts: string[] = [];

  try {
    // Get all users from TorBox
    const torboxAccounts = await client.getAccounts();
    const torboxByAuthId = new Map(torboxAccounts.map((a) => [a.auth_id, a]));

    // Get all local TorBox user records that aren't revoked
    const localUsers = db
      .prepare("SELECT * FROM torbox_users WHERE status != ?")
      .all(TorBoxUserStatus.REVOKED) as TorBoxUserRow[];

    for (const local of localUsers) {
      if (!local.vendor_user_auth_id) continue;

      const remote = torboxByAuthId.get(local.vendor_user_auth_id);

      if (!remote) {
        // User exists locally but not on TorBox
        drifts.push(
          `User ${local.user_id}: exists locally (${local.status}) but not on TorBox`,
        );
      }
    }

    // Check for TorBox users not in our DB
    for (const [authId, remote] of torboxByAuthId) {
      const local = localUsers.find((l) => l.vendor_user_auth_id === authId);
      if (!local) {
        drifts.push(
          `TorBox user ${authId} (${remote.email}): exists on TorBox but not in local DB`,
        );
      }
    }

    // Record capacity snapshot
    const capacity = await client.getCapacity();
    db.prepare(
      `INSERT INTO vendor_capacity (users_allowed, current_users, vendor_status)
       VALUES (?, ?, ?)`,
    ).run(capacity.allowed, capacity.current, "recorded");

    auditLog(null, AuditEventType.RECONCILIATION_RUN, {
      checked: localUsers.length,
      torboxUsers: torboxAccounts.length,
      drifts: drifts.length,
    });

    if (drifts.length > 0) {
      auditLog(null, AuditEventType.RECONCILIATION_DRIFT, { drifts });
      console.warn(`[Reconciliation] Found ${drifts.length} drifts:`, drifts);
    }

    return { checked: localUsers.length, drifts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Reconciliation] Failed:`, message);
    throw error;
  }
}
