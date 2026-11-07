import type { BrandContext } from '../lib/api';

export type ContextDraft = Omit<BrandContext, 'id'>;

/** Champs du contrat existant ; les contraintes restent du texte dans la description. */
export default function ContextFields({ value, onChange, disabled = false }: {
  value: ContextDraft; onChange: (field: keyof ContextDraft, value: string) => void; disabled?: boolean;
}) {
  return <>
    <fieldset className="context-fieldset stack" disabled={disabled}>
      <legend>Identité</legend>
      <label className="label" htmlFor="context-name">Nom du contexte</label>
      <p className="hint" id="context-name-help">Obligatoire · marque, activité ou univers créatif</p>
      <input id="context-name" aria-describedby="context-name-help" className="input" data-testid="context-name" value={value.name} minLength={2} maxLength={160} required onChange={(e) => onChange('name', e.target.value)} autoComplete="organization" />
    </fieldset>
    <fieldset className="context-fieldset stack" disabled={disabled}>
      <legend>Activité, offre ou sujet</legend>
      <label className="label" htmlFor="context-description">Description</label>
      <p className="hint" id="context-description-help">Que souhaitez-vous faire connaître ou créer ? Ajoutez aussi vos contraintes, si vous en avez. Obligatoire · 5 caractères minimum.</p>
      <textarea id="context-description" aria-describedby="context-description-help" className="input textarea" data-testid="context-description" value={value.description} minLength={5} maxLength={8000} required onChange={(e) => onChange('description', e.target.value)} />
      <details><summary>Préciser le public et le ton (facultatif)</summary><div className="stack">
        <label className="label" htmlFor="context-audience">Audience du contexte</label>
        <textarea id="context-audience" className="input" data-testid="context-audience" value={value.audience ?? ''} maxLength={2000} onChange={(e) => onChange('audience', e.target.value)} />
        <label className="label" htmlFor="context-tone">Ton du contexte</label>
        <input id="context-tone" className="input" data-testid="context-tone" value={value.tone ?? ''} maxLength={1000} onChange={(e) => onChange('tone', e.target.value)} />
      </div></details>
    </fieldset>
    <details className="context-section"><summary>Références et couleurs (facultatif)</summary><fieldset className="context-fieldset stack" disabled={disabled}>
      <legend className="sr-only">Références et couleurs</legend>
      <label className="label" htmlFor="context-website">Site déclaré (non consulté)</label>
      <input id="context-website" className="input" data-testid="context-website" value={value.website ?? ''} maxLength={2048} aria-describedby="context-website-help" onChange={(e) => onChange('website', e.target.value)} />
      <p id="context-website-help" className="hint">Cette adresse est enregistrée comme référence. Aucun contenu n’est analysé. Les fichiers s’ajoutent après la création du contexte.</p>
      <div className="two-col">
        <label className="label">Couleur principale ({value.colorPrimary})<input className="input context-color" data-testid="context-color-primary" type="color" value={value.colorPrimary} onChange={(e) => onChange('colorPrimary', e.target.value)} /></label>
        <label className="label">Couleur secondaire ({value.colorSecondary})<input className="input context-color" data-testid="context-color-secondary" type="color" value={value.colorSecondary} onChange={(e) => onChange('colorSecondary', e.target.value)} /></label>
      </div>
      <p className="hint">Couleurs utilisées dans les créations. Les valeurs proposées restent modifiables et ne constituent pas une identité confirmée.</p>
    </fieldset></details>
    <details className="context-section"><summary>Contraintes et consignes</summary><p className="hint">Précisez les mots à éviter, obligations ou limites dans la description ci-dessus. Cette version ne possède pas de champ de contraintes séparé. Les droits de chaque fichier sont déclarés lors de son import.</p></details>
  </>;
}
