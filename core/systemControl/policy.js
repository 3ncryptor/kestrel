// Tiered safety for kill/renice (BUILD_PLAN §8.6). Enforced in the core, so a UI bug can never
// skip a confirmation: every destructive action must present a token matching the target's tier.

/** @typedef {'blocked'|'managed'|'own'|'system'} Tier */
/** @typedef {{ tier: Tier, reason: string }} Classification */
/** @typedef {{ tier: Tier, typedName?: string }} Confirmation */

const PROTECTED_MAX_PID = 1;

class PolicyError extends Error {
    /** @param {string} message @param {'EBLOCKED'|'ECONFIRM'} code */
    constructor(message, code) {
        super(message);
        this.name = 'PolicyError';
        this.code = code;
    }
}

/**
 * @param {{ pid: number, target: { name: string, user: string, managedId: string|null } | null,
 *           selfPid: number, parentPid: number, currentUser: string }} input
 * @returns {Classification}
 */
function classifyTarget({ pid, target, selfPid, parentPid, currentUser }) {
    if (pid <= PROTECTED_MAX_PID) {
        const name = target ? ` (${target.name})` : '';
        return { tier: 'blocked', reason: `pid ${pid}${name} is protected` };
    }
    if (pid === selfPid) return { tier: 'blocked', reason: "That's Kestrel itself — quit with q instead" };
    if (pid === parentPid) return { tier: 'blocked', reason: 'That is the shell running Kestrel' };
    if (!target) return { tier: 'blocked', reason: `Process ${pid} is no longer running` };
    if (target.managedId) {
        return { tier: 'managed', reason: `${target.managedId} is managed by Kestrel; killing it triggers auto-restart` };
    }
    if (target.user === currentUser) return { tier: 'own', reason: '' };
    return { tier: 'system', reason: `${target.name} belongs to ${target.user}` };
}

/**
 * Throws unless `confirmation` satisfies the tier.
 * @param {Classification} classification
 * @param {Confirmation|undefined} confirmation
 * @param {{ name: string }} target
 */
function verifyConfirmation(classification, confirmation, target) {
    const { tier, reason } = classification;
    if (tier === 'blocked') throw new PolicyError(reason, 'EBLOCKED');
    if (!confirmation || confirmation.tier !== tier) {
        throw new PolicyError('This action needs confirmation first', 'ECONFIRM');
    }
    if (tier === 'system' && confirmation.typedName !== target.name) {
        throw new PolicyError(`To confirm, type the process name exactly: ${target.name}`, 'ECONFIRM');
    }
}

module.exports = { classifyTarget, verifyConfirmation, PolicyError };
