/**
 * FlowVid API - Subscription State Machine
 * Defines valid transitions and enforces state integrity
 */

import { SubscriptionStatus, BillingEvent } from "./types.js";

/**
 * Valid state transitions map
 * Key: current status → Value: map of events → next status
 */
const TRANSITIONS: Record<
  SubscriptionStatus,
  Partial<Record<BillingEvent, SubscriptionStatus>>
> = {
  [SubscriptionStatus.NOT_SUBSCRIBED]: {
    [BillingEvent.PAYMENT_SUCCESS]: SubscriptionStatus.PAID_PENDING_PROVISION,
    [BillingEvent.MANUAL_ACTIVATE]: SubscriptionStatus.PAID_PENDING_PROVISION,
  },

  [SubscriptionStatus.PAID_PENDING_PROVISION]: {
    [BillingEvent.TORBOX_USER_CREATED]:
      SubscriptionStatus.PROVISIONED_PENDING_CONFIRM,
    [BillingEvent.TORBOX_TOKEN_ACQUIRED]: SubscriptionStatus.ACTIVE,
    [BillingEvent.PAYMENT_FAILED]: SubscriptionStatus.PAST_DUE,
    [BillingEvent.SUBSCRIPTION_CANCELED]: SubscriptionStatus.CANCELED,
    [BillingEvent.MANUAL_ACTIVATE]: SubscriptionStatus.ACTIVE,
  },

  [SubscriptionStatus.PROVISIONED_PENDING_CONFIRM]: {
    [BillingEvent.TORBOX_EMAIL_CONFIRMED]: SubscriptionStatus.ACTIVE,
    [BillingEvent.TORBOX_TOKEN_ACQUIRED]: SubscriptionStatus.ACTIVE,
    [BillingEvent.PAYMENT_FAILED]: SubscriptionStatus.PAST_DUE,
    [BillingEvent.SUBSCRIPTION_CANCELED]: SubscriptionStatus.CANCELED,
    [BillingEvent.MANUAL_ACTIVATE]: SubscriptionStatus.ACTIVE,
  },

  [SubscriptionStatus.ACTIVE]: {
    [BillingEvent.PAYMENT_FAILED]: SubscriptionStatus.PAST_DUE,
    [BillingEvent.SUBSCRIPTION_CANCELED]: SubscriptionStatus.CANCELED,
    [BillingEvent.PERIOD_EXPIRED]: SubscriptionStatus.EXPIRED,
    [BillingEvent.MANUAL_REVOKE]: SubscriptionStatus.CANCELED,
  },

  [SubscriptionStatus.PAST_DUE]: {
    [BillingEvent.PAYMENT_RECOVERED]: SubscriptionStatus.ACTIVE,
    [BillingEvent.PAYMENT_SUCCESS]: SubscriptionStatus.ACTIVE,
    [BillingEvent.SUBSCRIPTION_CANCELED]: SubscriptionStatus.CANCELED,
    [BillingEvent.PERIOD_EXPIRED]: SubscriptionStatus.EXPIRED,
  },

  [SubscriptionStatus.CANCELED]: {
    [BillingEvent.TORBOX_USER_REVOKED]: SubscriptionStatus.NOT_SUBSCRIBED,
    [BillingEvent.PERIOD_EXPIRED]: SubscriptionStatus.EXPIRED,
    [BillingEvent.PAYMENT_SUCCESS]: SubscriptionStatus.PAID_PENDING_PROVISION,
    [BillingEvent.MANUAL_ACTIVATE]: SubscriptionStatus.PAID_PENDING_PROVISION,
  },

  [SubscriptionStatus.EXPIRED]: {
    [BillingEvent.PAYMENT_SUCCESS]: SubscriptionStatus.PAID_PENDING_PROVISION,
    [BillingEvent.TORBOX_USER_REVOKED]: SubscriptionStatus.NOT_SUBSCRIBED,
    [BillingEvent.MANUAL_ACTIVATE]: SubscriptionStatus.PAID_PENDING_PROVISION,
  },
};

/**
 * Attempt a state transition. Returns the new status if valid, null if not.
 */
export function tryTransition(
  currentStatus: SubscriptionStatus,
  event: BillingEvent,
): SubscriptionStatus | null {
  const stateTransitions = TRANSITIONS[currentStatus];
  if (!stateTransitions) return null;

  return stateTransitions[event] ?? null;
}

/**
 * Check if a transition is valid without performing it
 */
export function canTransition(
  currentStatus: SubscriptionStatus,
  event: BillingEvent,
): boolean {
  return tryTransition(currentStatus, event) !== null;
}

/**
 * Perform a state transition. Throws if the transition is invalid.
 */
export function transition(
  currentStatus: SubscriptionStatus,
  event: BillingEvent,
): SubscriptionStatus {
  const nextStatus = tryTransition(currentStatus, event);
  if (nextStatus === null) {
    throw new Error(
      `Invalid state transition: ${currentStatus} + ${event}. ` +
        `No valid transition defined.`,
    );
  }
  return nextStatus;
}

/**
 * Get all valid events for a given status
 */
export function validEvents(status: SubscriptionStatus): BillingEvent[] {
  const stateTransitions = TRANSITIONS[status];
  if (!stateTransitions) return [];
  return Object.keys(stateTransitions) as BillingEvent[];
}

/**
 * Check if a status requires TorBox provisioning action
 */
export function needsProvisioning(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.PAID_PENDING_PROVISION;
}

/**
 * Check if a status means the user should have active TorBox access
 */
export function hasActiveAccess(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.ACTIVE;
}

/**
 * Check if a status means TorBox user should be revoked
 */
export function needsRevocation(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.CANCELED ||
    status === SubscriptionStatus.EXPIRED
  );
}
