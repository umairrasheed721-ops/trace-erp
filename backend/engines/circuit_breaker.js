/**
 * 🔌 Circuit Breaker Fault-Tolerance Engine
 * Implements the standard Circuit Breaker design pattern:
 * - CLOSED    : Requests pass through normally. Failure counts increment on error.
 * - OPEN      : Requests are blocked/fail-fast immediately. Cooldown timer controls exit.
 * - HALF-OPEN : Allows trial requests. A single success resets to CLOSED, failure returns to OPEN.
 */

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5; // Trip after 5 consecutive failures
    this.cooldownPeriod = options.cooldownPeriod || 60000;  // 1 minute cooldown
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF-OPEN
    this.failureCount = 0;
    this.lastStateChange = Date.now();
  }

  async execute(action) {
    this.checkState();

    if (this.state === 'OPEN') {
      throw new Error(`Circuit Breaker [${this.name}] is OPEN. Blocked call to external API to prevent cascade failure.`);
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  checkState() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastStateChange > this.cooldownPeriod) {
        this.state = 'HALF-OPEN';
        this.lastStateChange = now;
        console.log(`🔌 [CircuitBreaker] [${this.name}] Cooldown expired. Switching to HALF-OPEN state.`);
      }
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF-OPEN' || this.state === 'OPEN') {
      this.state = 'CLOSED';
      this.lastStateChange = Date.now();
      console.log(`🔌 [CircuitBreaker] [${this.name}] Request succeeded in trial. Resetting to CLOSED.`);
    }
  }

  onFailure(err) {
    // Only count network or server-side failure errors, not client auth or formatting errors
    const isClientError = err.message && (
      err.message.includes('Token missing') || 
      err.message.includes('API Key missing') ||
      err.message.includes('400') ||
      err.message.includes('401') ||
      err.message.includes('403')
    );
    if (isClientError) {
      return; // Bypassing circuit breaker increment for client/auth issues
    }

    this.failureCount++;
    console.warn(`🔌 [CircuitBreaker] [${this.name}] Failure #${this.failureCount}: ${err.message}`);

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      console.error(`🔌 [CircuitBreaker] [${this.name}] Tripped! State is now OPEN. Cooldown: ${this.cooldownPeriod / 1000}s`);
      try {
        const { logSystemError } = require('../db');
        logSystemError('WARN', `Circuit Breaker [${this.name}] tripped to OPEN state.`, 'circuit_breaker');
      } catch (_) {}
    } else if (this.state === 'HALF-OPEN') {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      console.error(`🔌 [CircuitBreaker] [${this.name}] Test request failed in HALF-OPEN. Back to OPEN state.`);
    }
  }
}

const postexBreaker = new CircuitBreaker('PostEx', { failureThreshold: 5, cooldownPeriod: 60000 });
const instaworldBreaker = new CircuitBreaker('InstaWorld', { failureThreshold: 5, cooldownPeriod: 60000 });

module.exports = { CircuitBreaker, postexBreaker, instaworldBreaker };
