'use client';
import { isVideoOutput, studioExportExtension } from '@vululu/contracts';
import type { StudioDeliveryProps } from '../lib/studioComponentTypes';
import { StudioCompare } from './StudioCompare';

const stamp = (value: string) => new Date(value).toLocaleString('fr-FR');
const shortSha = (value: string) => value.slice(0, 16) + '…';

/**
 * Livraison d'une composition : rendu serveur, approbation exacte (version + checksum),
 * export du master approuvé, historique des révisions et comparaison visuelle.
 * Aucune écriture locale n'est simulée : chaque action appelle les routes existantes.
 * Approuver ou exporter ne publie rien et ne transfère rien vers un réseau social.
 */
export function StudioDelivery({
  base,
  view,
  versions,
  expectedVersion,
  dirty,
  busy,
  renderState,
  onAction,
  onRender,
  onApprove,
  onRestore,
  onView,
  onCancel,
  onNotice
}: StudioDeliveryProps) {
  const manifest = view.manifest;
  const checksum = manifest ? (manifest.approvalSha256 ?? manifest.master.sha256) : null;
  const approved = !!view.approvedAt;
  const latest = view.version === expectedVersion;
  const kind = view.spec.delivery?.kind;
  const extension = studioExportExtension(kind);
  const hero = view.spec.scenes[0];
  // Sans delivery explicite (format « Vidéo multiscène »), le serveur assemble quand même un master MP4.
  const video = !view.spec.delivery || isVideoOutput(kind);
  const carousel = kind === 'carousel';
  // P09B : contenus réels de la révision pour les exports audio et SRT (aucun fichier supposé).
  const audioTracks = view.spec.audio?.tracks.length ?? 0;
  const subtitleCues = view.spec.audio?.subtitles?.cues.length ?? 0;
  const state = renderState?.state;
  const rendering = state === 'queued' || state === 'running';
  const failed = state === 'failed' || state === 'offline';
  const cancelled = state === 'cancelled';
  // Progression uniquement issue du serveur : aucune estimation locale, aucun pourcentage inventé.
  const progress = Math.max(0, Math.min(100, Math.round(renderState?.progress ?? 0)));
  const locked = busy || dirty;
  const renderLabel = failed || cancelled ? 'Relancer le rendu v' + view.version : 'Rendre le master v' + view.version;

  return (
    <section className="studio-delivery" aria-labelledby="creative-deliver">
      <h3 id="creative-deliver" tabIndex={-1}>
        Livraison · composition v{view.version}
      </h3>
      {!latest && (
        <p className="hint" role="status">
          Révision affichée : v{view.version}. La révision courante est v{expectedVersion} : un rendu ou une
          approbation de v{view.version} ne vaut pas pour v{expectedVersion}.
        </p>
      )}

      {manifest ? (
        <>
          <figure className="studio-delivery-preview">
            {video ? (
              <video
                controls
                preload="metadata"
                src={base + '/' + view.version + '/master'}
                aria-label={'Master vidéo v' + view.version}
                style={{ display: 'block', maxWidth: '100%', maxHeight: 440 }}
              />
            ) : (
              <img
                src={base + '/' + view.version + '/scenes/' + hero.key}
                alt={'Export rendu · master image v' + view.version + ' · ' + hero.key}
                style={{ display: 'block', maxWidth: '100%', maxHeight: 440, objectFit: 'contain' }}
              />
            )}
            <figcaption>
              Master serveur immuable · v{view.version}
              {kind ? ' · ' + kind : ''} · {view.spec.width} × {view.spec.height}
            </figcaption>
          </figure>

          {carousel && (
            <nav className="studio-delivery-scenes" aria-label="Vignettes du carrousel rendu">
              {view.spec.scenes.map((scene) => (
                <a
                  key={scene.key}
                  href={base + '/' + view.version + '/scenes/' + scene.key}
                  target="_blank"
                  rel="noreferrer"
                >
                  {scene.key}
                </a>
              ))}
            </nav>
          )}

          {/* Export scène par scène d'une révision rendue : fichier déjà scellé côté serveur,
              aucun rendu supplémentaire et aucune publication. */}
          {view.spec.scenes.length > 0 && (
            <div className="actions" aria-label="Export des scènes rendues">
              {view.spec.scenes.map((scene) => (
                <a
                  key={scene.key}
                  className="btn btn-secondary"
                  href={base + '/' + view.version + '/scenes/' + scene.key}
                  download={'v' + view.version + '-' + scene.key + '.png'}
                  onClick={() =>
                    onNotice(
                      'Export de la scène ' + scene.key + ' · v' + view.version + ' : fichier rendu, aucune publication.'
                    )
                  }
                >
                  Exporter la scène {scene.key}
                </a>
              ))}
            </div>
          )}

          {checksum && (
            <p className="hint">
              Checksum SHA-256 exact · <code title={checksum}>{shortSha(checksum)}</code>
            </p>
          )}

          {approved ? (
            <div className="studio-delivery-actions">
              <button type="button" className="btn btn-primary" disabled>
                Version approuvée
              </button>
              <p className="hint" role="status">
                Approbation exacte enregistrée pour v{view.version} · checksum {checksum ? shortSha(checksum) : 'inconnu'}
                {view.approvedAt ? ' · ' + stamp(view.approvedAt) : ''}.
                {latest
                  ? ' Cette approbation ne couvre que cette version et ce checksum : une nouvelle révision enregistrée crée une version non approuvée.'
                  : ' Cette approbation concerne v' + view.version + ', pas la révision courante v' + expectedVersion + '.'}
              </p>
              <a
                className="btn btn-secondary"
                href={base + '/' + view.version + '/export'}
                download={'v' + view.version + '.' + extension}
                onClick={() =>
                  onNotice(
                    'Export du master v' + view.version + ' au format ' + extension.toUpperCase() + ' : aucune publication n’est déclenchée.'
                  )
                }
              >
                Exporter le master v{view.version} · {extension.toUpperCase()}
              </a>
              <p className="hint">
                Format réel du fichier approuvé : {extension.toUpperCase()}. Le lien télécharge le master
                approuvé et ne publie rien ; la vérification version + checksum reste faite par le serveur.
              </p>
            </div>
          ) : (
            <div className="studio-delivery-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={locked || !checksum}
                onClick={() => {
                  if (checksum) void onAction(async () => { await onApprove(checksum); });
                }}
              >
                Approuver cette version
              </button>
              <p className="hint">
                L’approbation ne porte que sur la révision v{view.version} et le checksum exact affiché ci-dessus.
                Une nouvelle révision enregistrée crée une version non approuvée : l’approbation précédente ne
                vaut pas pour elle.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="studio-delivery-render">
          {rendering ? (
            <div className="studio-render-progress" role="group" aria-label={'Progression du rendu v' + view.version}>
              <p role="status">
                {state === 'queued' ? 'Rendu en attente' : 'Rendu en cours'} · v{view.version} ·{' '}
                <span className="studio-render-progress-value">{progress} %</span>
              </p>
              <div
                className="studio-render-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={progress + ' %'}
                aria-label="Progression transmise par le serveur"
              >
                <span style={{ width: progress + '%' }} />
              </div>
              <p className="hint">
                Pourcentage transmis par le serveur : ce n’est pas une estimation locale. Le master n’est scellé
                qu’à la fin du rendu.
              </p>
              {onCancel ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    void onCancel();
                  }}
                >
                  Annuler le rendu
                </button>
              ) : null}
              {state === 'running' ? (
                <p className="hint">
                  L’annulation prend effet à la fin de la scène en cours ; le suivi continue jusqu’à l’état final.
                </p>
              ) : null}
            </div>
          ) : state === 'succeeded' ? (
            <p role="status">Rendu terminé · chargement du master v{view.version}…</p>
          ) : (
            <>
              {cancelled ? (
                <p role="status">
                  Rendu annulé · v{view.version}. Aucun master n’a été scellé pour cette révision.
                </p>
              ) : null}
              {renderState?.reason && !cancelled && (
                <p role={failed ? 'alert' : 'status'}>{renderState.reason}</p>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={locked}
                onClick={() => {
                  onNotice('Rendu demandé pour la révision v' + view.version + '.');
                  void onAction(async () => { await onRender(); });
                }}
              >
                {renderLabel}
              </button>
              <p className="hint">
                Le rendu est produit et scellé côté serveur. Relancer un rendu déjà scellé ne remplace jamais
                le master existant, et aucun rendu ne déclenche de publication.
              </p>
            </>
          )}
        </div>
      )}

      {video ? (
        <section className="studio-delivery-audio" aria-labelledby="studio-delivery-audio-heading">
          <div className="section-head">
            <h4 id="studio-delivery-audio-heading">Audio et sous-titres de la vidéo</h4>
          </div>
          {approved && manifest ? (
            <>
              <p className="hint">
                Fichiers dérivés du master approuvé v{view.version} : le téléchargement ne publie rien. La vérification
                version + checksum reste faite par le serveur.
              </p>
              <div className="actions">
                {audioTracks > 0 ? (
                  <a
                    className="btn btn-secondary"
                    href={base + '/' + view.version + '/audio'}
                    download={'v' + view.version + '.m4a'}
                    onClick={() =>
                      onNotice(
                        'Export M4A de la piste audio v' + view.version + ' : fichier dérivé du master approuvé, aucune publication.'
                      )
                    }
                  >
                    Exporter la piste audio (M4A)
                  </a>
                ) : (
                  <p className="hint">
                    Cette révision ne contient aucune piste audio : le master reste muet, aucun fichier M4A n’est
                    proposé.
                  </p>
                )}
                {subtitleCues > 0 ? (
                  <a
                    className="btn btn-secondary"
                    href={base + '/' + view.version + '/subtitles'}
                    download={'v' + view.version + '.srt'}
                    onClick={() =>
                      onNotice(
                        'Téléchargement des sous-titres v' + view.version + ' : fichier dérivé du master approuvé, aucune publication.'
                      )
                    }
                  >
                    Sous-titres (SRT)
                  </a>
                ) : (
                  <p className="hint">
                    Cette révision ne contient aucun sous-titre : aucun fichier SRT n’est proposé.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="hint">
              L’export de la piste audio (M4A) et le fichier de sous-titres (SRT) sont produits à partir du master
              approuvé : approuvez la révision affichée pour activer les téléchargements.
              {!manifest ? ' Le master doit d’abord être rendu.' : ''}
            </p>
          )}
        </section>
      ) : null}

      {!latest && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={locked}
          onClick={() => void onAction(async () => { await onRestore(view.version); })}
        >
          Restaurer comme nouvelle révision
        </button>
      )}

      <details className="studio-delivery-history">
        <summary>Historique des révisions ({versions.length})</summary>
        {versions.length ? (
          <ul className="studio-delivery-versions">
            {versions.map((item) => (
              <li key={item.version} aria-current={item.version === view.version ? 'true' : undefined}>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy || item.version === view.version}
                  onClick={() => void onAction(async () => { await onView(item.version); })}
                >
                  Afficher v{item.version}
                </button>
                {item.version === view.version && <span className="pill">affichée</span>}
                {item.version === expectedVersion && <span className="pill">courante</span>}
                <span className="hint">
                  {item.approvedAt ? 'approuvée le ' + stamp(item.approvedAt) : 'non approuvée'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Aucune révision enregistrée.</p>
        )}
      </details>

      <StudioCompare base={base} current={view} versions={versions} sceneKey={hero.key} />
    </section>
  );
}