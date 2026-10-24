import { describe, expect, it } from 'vitest';
import {
  ProductionStateError,
  assertJobRunTransition,
  assertStepRunTransition,
  canTransitionJobRun,
  canTransitionStepRun,
  isTerminalJobRunState
} from '../../packages/domain/src/index';

describe('V1-01-D machine a etats metier', () => {
  it('autorise le chemin nominal et les etats terminaux', () => {
    expect(assertJobRunTransition('queued', 'running').changed).toBe(true);
    expect(assertJobRunTransition('running', 'waiting_approval').changed).toBe(true);
    expect(assertJobRunTransition('waiting_approval', 'succeeded').changed).toBe(true);
    expect(assertStepRunTransition('pending', 'running').changed).toBe(true);
    expect(assertStepRunTransition('running', 'succeeded').changed).toBe(true);
    expect(isTerminalJobRunState('succeeded')).toBe(true);
    expect(isTerminalJobRunState('failed')).toBe(true);
  });

  it('rend les repetitions idempotentes sans evenement metier', () => {
    expect(assertJobRunTransition('running', 'running')).toEqual({
      from: 'running',
      to: 'running',
      changed: false
    });
    expect(assertStepRunTransition('running', 'running').changed).toBe(false);
  });

  it('refuse les transitions interdites', () => {
    expect(() => assertJobRunTransition('queued', 'succeeded')).toThrow(ProductionStateError);
    expect(() => assertJobRunTransition('succeeded', 'running')).toThrow(ProductionStateError);
    expect(() => assertStepRunTransition('succeeded', 'pending')).toThrow(ProductionStateError);
    expect(canTransitionJobRun('failed', 'running')).toBe(false);
    expect(canTransitionStepRun('cancelled', 'running')).toBe(false);
  });

  it('distingue recovery_pending sans autoriser un retour depuis terminal', () => {
    expect(assertJobRunTransition('running', 'recovery_pending').changed).toBe(true);
    expect(assertJobRunTransition('recovery_pending', 'running').changed).toBe(true);
    expect(canTransitionJobRun('timed_out', 'recovery_pending')).toBe(false);
  });
});