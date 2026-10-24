import { DomainError } from './errors';

/**
 * Etats metier explicites d un JobRun et d un StepRun.
 *
 * L etat technique Hatchet ne doit jamais ecraser un etat metier terminal :
 * c est cette machine, et elle seule, qui autorise les transitions persistees.
 */
export const JOB_RUN_STATES = [
  'queued',
  'running',
  'waiting_approval',
  'recovery_pending',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
] as const;

export type JobRunState = (typeof JOB_RUN_STATES)[number];

export const STEP_RUN_STATES = [
  'pending',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
] as const;

export type StepRunState = (typeof STEP_RUN_STATES)[number];

const JOB_TRANSITIONS: Readonly<Record<JobRunState, readonly JobRunState[]>> = {
  queued: ['running', 'cancelled', 'failed'],
  running: ['waiting_approval', 'recovery_pending', 'succeeded', 'failed', 'cancelled', 'timed_out'],
  waiting_approval: ['succeeded', 'failed', 'cancelled', 'recovery_pending'],
  recovery_pending: ['running', 'failed', 'cancelled', 'timed_out'],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: []
};

const STEP_TRANSITIONS: Readonly<Record<StepRunState, readonly StepRunState[]>> = {
  pending: ['running', 'cancelled', 'failed'],
  running: ['waiting_approval', 'succeeded', 'failed', 'cancelled', 'timed_out'],
  waiting_approval: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: []
};

export class ProductionStateError extends DomainError {
  constructor(
    message: string,
    readonly from: string,
    readonly to: string
  ) {
    super('invalid_transition', message, { from, to });
    this.name = 'ProductionStateError';
  }
}

export function isJobRunState(value: string): value is JobRunState {
  return (JOB_RUN_STATES as readonly string[]).includes(value);
}

export function isStepRunState(value: string): value is StepRunState {
  return (STEP_RUN_STATES as readonly string[]).includes(value);
}

export function isTerminalJobRunState(value: string): boolean {
  return value === 'succeeded' || value === 'failed' || value === 'cancelled' || value === 'timed_out';
}

export function isTerminalStepRunState(value: string): boolean {
  return value === 'succeeded' || value === 'failed' || value === 'cancelled' || value === 'timed_out';
}

export function canTransitionJobRun(from: string, to: string): boolean {
  if (!isJobRunState(from) || !isJobRunState(to)) return false;
  if (from === to) return true;
  return JOB_TRANSITIONS[from].includes(to);
}

export function canTransitionStepRun(from: string, to: string): boolean {
  if (!isStepRunState(from) || !isStepRunState(to)) return false;
  if (from === to) return true;
  return STEP_TRANSITIONS[from].includes(to);
}

export type TransitionDecision = {
  from: string;
  to: string;
  changed: boolean;
};

function decide(
  kind: 'job' | 'step',
  from: string,
  to: string,
  transitions: (from: string, to: string) => boolean
): TransitionDecision {
  if (from === to) {
    return { from, to, changed: false };
  }
  if (!transitions(from, to)) {
    throw new ProductionStateError(
      'Transition ' + kind + ' interdite: ' + from + ' -> ' + to,
      from,
      to
    );
  }
  return { from, to, changed: true };
}

export function assertJobRunTransition(from: string, to: string): TransitionDecision {
  return decide('job', from, to, canTransitionJobRun);
}

export function assertStepRunTransition(from: string, to: string): TransitionDecision {
  return decide('step', from, to, canTransitionStepRun);
}

/** Une transition technique ignoree ne doit pas produire d evenement metier. */
export function shouldPersistTransition(from: string, to: string): boolean {
  return from !== to;
}
