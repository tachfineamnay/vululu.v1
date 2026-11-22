/**
 * P12-05 — règles pures de sélection d'une direction artistique.
 *
 * Aucune I/O, aucun import runtime : ces règles sont la seule autorité sur « quand un choix est
 * acceptable ». Le repository les applique sous verrou de projet et les traduit en `HttpError`.
 *
 * Ordre volontaire : conflit de concurrence, puis rejet, puis exploitabilité, puis péremption.
 * Un client qui n'a pas l'état courant doit recharger avant tout autre diagnostic.
 */

export type DirectionDecisionValue = 'retained' | 'rejected';

export type SelectionInput = {
  version: number;
  /** Sélection observée par le client (null = aucune). */
  expectedSelection: number | null;
  /** Sélection réellement stockée au moment de la transaction. */
  currentSelection: number | null;
  /** Décision courante sur cette révision (la plus récente fait foi). */
  decision: DirectionDecisionValue | null;
  /** La révision appartient au projet, est une direction et ses sources sont toujours exploitables. */
  usable: boolean;
  /** Empreinte de la décision de ressources au moment où la direction a été créée. */
  directionDigest: string | null;
  /** Empreinte courante de la décision de ressources du projet. */
  currentDigest: string | null;
};

export type SelectionCheck =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function checkDirectionSelection(input: SelectionInput): SelectionCheck {
  if (input.expectedSelection !== input.currentSelection)
    return {
      ok: false,
      code: 'direction_selection_conflict',
      message: 'La direction sélectionnée a changé : rechargez avant de choisir.'
    };
  if (input.decision === 'rejected')
    return {
      ok: false,
      code: 'direction_rejected',
      message: 'Cette direction a été rejetée : retirez le rejet ou choisissez une autre direction.'
    };
  if (!input.usable)
    return {
      ok: false,
      code: 'direction_not_usable',
      message: 'Cette révision n’est pas une direction exploitable de ce projet.'
    };
  if (input.directionDigest && input.currentDigest && input.directionDigest !== input.currentDigest)
    return {
      ok: false,
      code: 'direction_stale',
      message: 'Les ressources confirmées ont changé depuis cette direction : régénérez-la avant de la retenir.'
    };
  return { ok: true };
}
