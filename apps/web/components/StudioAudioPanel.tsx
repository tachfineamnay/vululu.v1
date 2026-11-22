'use client';

import { useEffect, useRef, useState } from 'react';
import {
  audioLanguage,
  audioTrackKind,
  type AudioLanguage,
  type AudioTrack,
  type AudioTrackKind
} from '@vululu/contracts';
import { api, apiResponse, postJson } from '../lib/api';
import type { StudioAudioPanelProps } from '../lib/studioComponentTypes';
import type {
  StudioAudioCapabilities,
  StudioAudioCapability,
  StudioAudioJob,
  StudioExecutionView,
  StudioRevision,
  StudioSource
} from '../lib/studioTypes';

/**
 * P09B — panneau audio de l'atelier vidéo : pistes de la composition, forme d'onde réelle,
 * voix off fournisseur (préparation, autorisation, exécution, application) et transcription
 * en sous-titres. Aucun état, coût ou résultat n'est inventé : tout vient du serveur.
 */

const MAX_TRACKS = 4;
const MAX_TTS_TEXT = 1200;
const MAX_START = 179.5;
const ACTIVE_STATES = new Set(['QUEUED', 'CLAIMED', 'POLLING']);
const STATE_LABELS: Record<string, string> = {
  PROPOSED: 'À autoriser',
  QUEUED: 'En file',
  CLAIMED: 'En cours',
  POLLING: 'En cours',
  SUCCEEDED: 'Réussi',
  FAILED: 'Échec',
  CANCELLED: 'Annulé',
  UNKNOWN: 'Issue incertaine',
  RESOLVED: 'Résolu'
};
const TRACK_KIND_LABELS: Record<AudioTrackKind, string> = {
  voiceover: 'Voix off',
  music: 'Musique',
  sfx: 'Effet sonore'
};
const LANGUAGE_LABELS: Record<string, string> = {
  'fr-FR': 'Français (fr-FR)',
  'en-US': 'Anglais (en-US)',
  'es-ES': 'Espagnol (es-ES)',
  'de-DE': 'Allemand (de-DE)',
  'ar-MA': 'Arabe (ar-MA)',
  'pt-BR': 'Portugais (pt-BR)'
};
const AUDIO_ERROR_LABELS: Record<string, string> = {
  audio_transcription_disabled: 'La transcription n’est pas activée sur ce serveur.',
  audio_tts_disabled: 'La synthèse vocale n’est pas activée sur ce serveur.',
  audio_provider_missing_credential: 'Le fournisseur audio n’est pas configuré sur ce serveur.',
  audio_source_not_found: 'Piste audio introuvable dans cette marque.',
  audio_source_unsupported: 'Format audio non pris en charge (WAV ou MP3).',
  audio_source_rights: 'Droits de la piste audio non confirmés : le serveur refuse le traitement.',
  audio_source_too_large: 'Piste audio au-delà de la limite interne du serveur.',
  audio_voice_unsupported: 'Voix absente du catalogue fournisseur.',
  audio_track_limit: 'Quatre pistes audio au maximum.',
  audio_result_missing: 'Résultat audio introuvable ou non appliquable.',
  audio_video_required: 'Cette opération nécessite une composition vidéo.',
  audio_params_invalid: 'Paramètres audio refusés par le serveur.',
  assets_required: 'Confirmez d’abord les ressources de la marque.',
  budget_exhausted: 'Budget d’exécution insuffisant pour autoriser cette opération.',
  tool_disabled: 'Cet outil n’est pas autorisé pour ce compte.',
  content_approval_required: 'Une approbation de contenu est requise avant cette opération.',
  key_payload_conflict: 'Une opération identique existe déjà avec des paramètres différents.',
  creative_conflict: 'La composition a changé : rechargez la dernière révision avant d’appliquer.',
  approval_mismatch: 'L’empreinte de l’opération a changé : actualisez avant d’autoriser.',
  project_not_found: 'Projet introuvable.'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatSeconds = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');
const formatDate = (value: string) => new Date(value).toLocaleString('fr-FR');
const shortDigest = (digest: string) => (digest.length > 16 ? digest.slice(0, 16) + '…' : digest);
const shortText = (value: string, size = 140) => {
  const single = value.replace(/\s+/g, ' ').trim();
  return single.length > size ? single.slice(0, size) + '…' : single;
};
const errorLabel = (failure: unknown) => {
  if (failure instanceof Error && failure.message) return AUDIO_ERROR_LABELS[failure.message] ?? failure.message;
  return 'Action impossible.';
};
const clampNumber = (raw: string, min: number, max: number, step = 0.1) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return min;
  return Math.round(clamp(parsed, min, max) / step) * step;
};

function languageLabel(value: string) {
  return LANGUAGE_LABELS[value] ?? value;
}

function availabilityLabel(capability: StudioAudioCapability) {
  if (capability.availability === 'configured') return 'configuré (disponibilité non testée)';
  return capability.availability === 'missing_credential' ? 'identifiant fournisseur manquant' : 'désactivé sur ce serveur';
}

function capabilityLanguages(capability: StudioAudioCapability | null): AudioLanguage[] {
  const declared = capability?.languages ?? [];
  const valid = declared.filter((value): value is AudioLanguage => audioLanguage.options.includes(value as AudioLanguage));
  return valid.length ? valid : [...audioLanguage.options];
}

function pickLanguage(languages: AudioLanguage[], current: AudioLanguage): AudioLanguage {
  return languages.includes(current) ? current : (languages[0] ?? 'fr-FR');
}

function costLabel(operation: { reportedCents: number | null; costState: string; maxCents: number }) {
  if (operation.reportedCents !== null) return operation.reportedCents + ' centime(s) USD comptabilisés';
  if (operation.costState === 'UNKNOWN') return 'coût incertain, réservation conservée pour rapprochement';
  return 'plafond ' + operation.maxCents + ' centime(s) USD · ' + operation.costState;
}

function sourceLabel(source: StudioSource | undefined, versionId: string) {
  return source ? source.name : 'version ' + versionId.slice(0, 8) + '… (hors bibliothèque chargée)';
}

function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const styles = getComputedStyle(canvas);
  const accent = styles.getPropertyValue('--v-color-action').trim() || styles.color;
  const background = styles.getPropertyValue('--v-color-background').trim();
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  const samples = buffer.getChannelData(0);
  const span = Math.max(1, Math.floor(samples.length / width));
  context.strokeStyle = accent;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const start = x * span;
    const end = Math.min(samples.length, start + span);
    if (end <= start) continue;
    let min = 1;
    let max = -1;
    for (let index = start; index < end; index += 1) {
      const value = samples[index];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const middle = height / 2;
    context.moveTo(x + 0.5, middle + min * (height / 2));
    context.lineTo(x + 0.5, middle + max * (height / 2));
  }
  context.stroke();
}

/** Forme d'onde réelle uniquement : contenu décodé par AudioContext, sinon métadonnées seules. */
function TrackWaveform({ source }: { source: StudioSource | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'unavailable' | 'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const assetId = source?.assetId;
    const versionId = source?.id;
    if (!assetId || !versionId) {
      setState('unavailable');
      return;
    }
    let cancelled = false;
    setState('loading');
    setMessage('');
    void (async () => {
      try {
        const response = await apiResponse(
          '/api/assets/' + encodeURIComponent(assetId) + '/versions/' + encodeURIComponent(versionId) + '/content'
        );
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        const AudioContextConstructor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) {
          setState('error');
          setMessage('Décodage audio non pris en charge par ce navigateur : métadonnées réelles uniquement.');
          return;
        }
        const context = new AudioContextConstructor();
        try {
          const buffer = await context.decodeAudioData(bytes);
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) {
            setState('error');
            setMessage('Canvas indisponible : métadonnées réelles uniquement.');
            return;
          }
          drawWaveform(canvas, buffer);
          setState('ready');
        } finally {
          await context.close();
        }
      } catch {
        if (!cancelled) {
          setState('error');
          setMessage('Le navigateur n’a pas pu décoder ce fichier : métadonnées réelles uniquement.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source?.assetId, source?.id]);

  if (!source) {
    return <p className="hint">Ressource absente de la bibliothèque chargée : aucune forme d’onde n’est affichée.</p>;
  }
  return (
    <div className="studio-audio-source">
      <p className="hint">
        {source.name} · {source.mimeType ?? 'type inconnu'}
        {source.metadata?.duration !== undefined ? ' · ' + formatSeconds(source.metadata.duration) + ' s' : ''}
        {' · licence ' + (source.license ?? 'non fournie')}
      </p>
      {source.assetId ? (
        <>
          <canvas
            ref={canvasRef}
            className="studio-audio-waveform"
            width={320}
            height={56}
            role="img"
            aria-label={'Forme d’onde réelle de ' + source.name}
            aria-busy={state === 'loading'}
          />
          {state === 'loading' ? (
            <p className="hint" role="status">
              Décodage de la forme d’onde…
            </p>
          ) : null}
          {state === 'error' ? <p className="hint">{message}</p> : null}
        </>
      ) : (
        <p className="hint">
          Aucune forme d’onde : cette version n’expose pas d’identifiant d’actif pour lire le fichier. Seules les
          métadonnées réelles sont affichées.
        </p>
      )}
    </div>
  );
}

/**
 * P09B — audio de la composition vidéo. Les réglages de pistes et de sous-titres passent par
 * onSpec (révision locale puis enregistrement existant) ; les opérations fournisseur passent
 * par les routes audio du serveur, avec autorisation explicite du plafond.
 */
export function StudioAudioPanel({ spec, media, busy, operations, onSpec, onNotice }: StudioAudioPanelProps) {
  const { project, revision, ready, run, onApplied } = operations;
  const audio = spec.audio;
  const tracks = audio?.tracks ?? [];
  const totalSeconds = spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const availableAudio = media.filter((item) => (item.mimeType ?? '').startsWith('audio/'));

  const [selectedSource, setSelectedSource] = useState('');
  const [newKind, setNewKind] = useState<AudioTrackKind>('music');
  const [capabilities, setCapabilities] = useState<StudioAudioCapabilities | null>(null);
  const [capState, setCapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [jobs, setJobs] = useState<StudioAudioJob[]>([]);
  const [jobsState, setJobsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState('');
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const [ttsText, setTtsText] = useState('');
  const [ttsLanguage, setTtsLanguage] = useState<AudioLanguage>('fr-FR');
  const [ttsVoice, setTtsVoice] = useState('');
  const [ttsRights, setTtsRights] = useState(false);
  const [ttsStart, setTtsStart] = useState(0);
  const [ttsGain, setTtsGain] = useState(0.9);

  const [asrSource, setAsrSource] = useState('');
  const [asrLanguage, setAsrLanguage] = useState<AudioLanguage>('fr-FR');
  const [asrRights, setAsrRights] = useState(false);
  const [asrMode, setAsrMode] = useState<'replace' | 'append'>('replace');

  const [analyzeOperation, setAnalyzeOperation] = useState<StudioExecutionView | null>(null);
  const [analyzeError, setAnalyzeError] = useState('');

  const ttsCapability = capabilities?.tts ?? null;
  const asrCapability = capabilities?.transcription ?? null;
  const ttsLanguages = capabilityLanguages(ttsCapability);
  const asrLanguages = capabilityLanguages(asrCapability);
  const ttsVoices = ttsCapability?.voices ?? [];
  const ttsJobs = jobs.filter((job) => job.tool === 'audio.tts@1');
  const asrJobs = jobs.filter((job) => job.tool === 'audio.transcribe@1');
  const pending = jobs.some((job) => ACTIVE_STATES.has(job.state));
  const analyzeActive = analyzeOperation ? ACTIVE_STATES.has(analyzeOperation.state) : false;

  const trackVersionIds = new Set(tracks.map((track) => track.versionId));
  const asrOptions: { value: string; label: string; source: StudioSource | undefined }[] = [];
  const seenAsrValues = new Set<string>();
  tracks.forEach((track, index) => {
    if (seenAsrValues.has(track.versionId)) return;
    seenAsrValues.add(track.versionId);
    const source = media.find((item) => item.id === track.versionId);
    asrOptions.push({
      value: track.versionId,
      label: 'Piste ' + (index + 1) + ' · ' + TRACK_KIND_LABELS[track.kind] + ' · ' + sourceLabel(source, track.versionId),
      source
    });
  });
  availableAudio.forEach((source) => {
    if (seenAsrValues.has(source.id)) return;
    seenAsrValues.add(source.id);
    asrOptions.push({ value: source.id, label: source.name, source });
  });
  const asrSelection = asrOptions.find((option) => option.value === asrSource);
  const asrSupported = Boolean(
    asrSelection?.source &&
      ['audio/wav', 'audio/mpeg'].includes(asrSelection.source.mimeType ?? '') &&
      asrSelection.source.license !== 'unknown'
  );

  const canPrepareTts =
    ready &&
    ttsCapability?.availability === 'configured' &&
    !busy &&
    ttsRights &&
    ttsText.trim().length >= 1 &&
    ttsText.trim().length <= MAX_TTS_TEXT &&
    ttsVoice.length > 0;
  const canPrepareAsr = ready && asrCapability?.availability === 'configured' && !busy && asrRights && Boolean(asrSource) && asrSupported;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [capabilitiesResult, jobsResult] = await Promise.allSettled([
        api<StudioAudioCapabilities>('/api/audio/capabilities'),
        api<{ items: StudioAudioJob[] }>('/api/projects/' + encodeURIComponent(project) + '/audio/jobs')
      ]);
      if (!alive) return;
      if (capabilitiesResult.status === 'fulfilled') {
        const loaded = capabilitiesResult.value;
        setCapabilities(loaded);
        setCapState('ready');
        setTtsVoice((current) => (current && loaded.tts.voices.includes(current) ? current : (loaded.tts.voices[0] ?? '')));
        setTtsLanguage((current) => pickLanguage(capabilityLanguages(loaded.tts), current));
        setAsrLanguage((current) => pickLanguage(capabilityLanguages(loaded.transcription), current));
      } else {
        setCapState('error');
      }
      if (jobsResult.status === 'fulfilled') {
        setJobs(jobsResult.value.items);
        setJobsState('ready');
      } else {
        setJobsState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [project, refreshToken]);

  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const history = await api<{ items: StudioAudioJob[] }>(
            '/api/projects/' + encodeURIComponent(project) + '/audio/jobs'
          );
          if (alive) {
            setJobs(history.items);
            setJobsState('ready');
          }
        } catch {
          // Le suivi réessaiera : aucun état n'est inventé.
        }
      })();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project, pending]);

  useEffect(() => {
    if (!analyzeActive) return;
    let alive = true;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const data = await api<{ items: StudioExecutionView[] }>(
            '/api/projects/' + encodeURIComponent(project) + '/execution'
          );
          if (!alive) return;
          const latest = data.items.find((item) => item.tool === 'audio.analyze@1');
          if (latest) setAnalyzeOperation(latest);
        } catch {
          // Le suivi réessaiera : aucun résultat n'est supposé.
        }
      })();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project, analyzeActive]);

  function writeTracks(nextTracks: AudioTrack[]) {
    onSpec({
      ...spec,
      audio: {
        tracks: nextTracks,
        ...(spec.audio?.subtitles ? { subtitles: spec.audio.subtitles } : {})
      }
    });
  }

  function updateTrack(id: string, patch: Partial<AudioTrack>) {
    writeTracks(tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }

  function changeStart(id: string, raw: string) {
    const track = tracks.find((item) => item.id === id);
    if (!track) return;
    updateTrack(id, { start: clampNumber(raw, 0, MAX_START, 0.1) });
  }

  function changeFade(id: string, key: 'fadeIn' | 'fadeOut', raw: string) {
    updateTrack(id, { [key]: clampNumber(raw, 0, 3, 0.1) } as Partial<AudioTrack>);
  }

  function addTrack() {
    if (!selectedSource || selectedSource === '' || tracks.length >= MAX_TRACKS) return;
    const track: AudioTrack = {
      id: crypto.randomUUID(),
      kind: newKind,
      versionId: selectedSource,
      start: 0,
      gain: 0.8,
      fadeIn: 0,
      fadeOut: 0
    };
    writeTracks([...tracks, track]);
    setSelectedSource('');
    onNotice('Piste ' + TRACK_KIND_LABELS[newKind].toLowerCase() + ' ajoutée à la composition : enregistrez la révision pour la conserver.');
  }

  function removeTrack(id: string) {
    writeTracks(tracks.filter((track) => track.id !== id));
  }

  function prepareTts() {
    if (!canPrepareTts) return;
    void run(async () => {
      setError('');
      try {
        await postJson('/api/projects/' + encodeURIComponent(project) + '/audio/voiceovers', {
          requestId: crypto.randomUUID(),
          revision,
          text: ttsText.trim(),
          language: ttsLanguage,
          voice: ttsVoice,
          rightsConfirmed: true
        });
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      setRefreshToken((value) => value + 1);
      onNotice('Voix off préparée sans dépense : elle doit être autorisée avant tout appel fournisseur.');
    });
  }

  function prepareTranscription() {
    if (!canPrepareAsr) return;
    void run(async () => {
      setError('');
      try {
        await postJson('/api/projects/' + encodeURIComponent(project) + '/audio/transcriptions', {
          requestId: crypto.randomUUID(),
          revision,
          sourceVersionId: asrSource,
          language: asrLanguage,
          rightsConfirmed: true
        });
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      setRefreshToken((value) => value + 1);
      onNotice('Transcription préparée sans dépense : elle doit être autorisée avant tout appel fournisseur.');
    });
  }

  function approveJob(job: StudioAudioJob) {
    void run(async () => {
      setError('');
      try {
        await postJson('/api/execution/' + encodeURIComponent(job.id) + '/approve', { digest: job.digest });
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      setRefreshToken((value) => value + 1);
      onNotice('Autorisation du plafond ' + job.maxCents + ' centime(s) USD enregistrée ; le suivi affiche l’état réel du serveur.');
    });
  }

  function applyTts(job: StudioAudioJob) {
    if (!ready || !job.result?.assetVersionId) return;
    void run(async () => {
      setError('');
      let next: StudioRevision | null = null;
      try {
        next = await postJson<StudioRevision>(
          '/api/projects/' + encodeURIComponent(project) + '/audio/jobs/' + encodeURIComponent(job.id) + '/apply',
          {
            expectedRevision: revision,
            start: clampNumber(String(ttsStart), 0, MAX_START, 0.1),
            gain: clampNumber(String(ttsGain), 0, 1, 0.01)
          }
        );
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      if (!next) return;
      try {
        await onApplied(next);
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      setAppliedIds((ids) => [...ids, job.id]);
      onNotice('Voix off ajoutée comme piste de la révision v' + next.version + '.');
    });
  }

  function applyTranscription(job: StudioAudioJob) {
    if (!ready) return;
    void run(async () => {
      setError('');
      let next: StudioRevision | null = null;
      try {
        next = await postJson<StudioRevision>(
          '/api/projects/' + encodeURIComponent(project) + '/audio/jobs/' + encodeURIComponent(job.id) + '/apply',
          { expectedRevision: revision, mode: asrMode }
        );
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      if (!next) return;
      try {
        await onApplied(next);
      } catch (failure) {
        setError(errorLabel(failure));
        return;
      }
      setAppliedIds((ids) => [...ids, job.id]);
      onNotice(
        'Sous-titres appliqués (' + (asrMode === 'replace' ? 'remplacement' : 'ajout') + ') dans la révision v' + next.version + '.'
      );
    });
  }

  function analyze() {
    if (!ready) return;
    void run(async () => {
      setAnalyzeError('');
      try {
        const operation = await postJson<StudioExecutionView>(
          '/api/projects/' + encodeURIComponent(project) + '/execution',
          { key: crypto.randomUUID(), tool: 'audio.analyze@1', revision }
        );
        setAnalyzeOperation(operation);
        onNotice('Analyse audio demandée : l’état réel est affiché ci-dessous ; aucun résultat n’est inventé.');
      } catch (failure) {
        setAnalyzeError(errorLabel(failure));
      }
    });
  }

  function ttsJobView(job: StudioAudioJob) {
    const derivedApplied = job.result?.assetVersionId
      ? tracks.some((track) => track.versionId === job.result?.assetVersionId)
      : false;
    const applied = appliedIds.includes(job.id) || derivedApplied;
    const succeededWithFile = job.state === 'SUCCEEDED' && Boolean(job.result?.assetVersionId);
    return (
      <article key={job.id} className="studio-audio-job">
        <div className="studio-audio-job-head">
          <strong>
            Voix off · {job.params?.voice ?? 'voix non transmise'} · {languageLabel(job.params?.language ?? '—')}
          </strong>
          <span className={'pill execution-state state-' + job.state.toLowerCase()}>
            {STATE_LABELS[job.state] ?? job.state}
          </span>
        </div>
        <p className="hint">
          Demandée le {formatDate(job.createdAt)} · composition source v{job.params?.revision ?? '—'} · coût :{' '}
          {costLabel(job)} · empreinte <code title={job.digest}>{shortDigest(job.digest)}</code>
        </p>
        {job.params?.text ? <p className="hint">Texte : {shortText(job.params.text)}</p> : null}
        {job.state === 'PROPOSED' ? (
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => approveJob(job)}>
            Autoriser jusqu’à {job.maxCents} centime(s) USD
          </button>
        ) : null}
        {succeededWithFile ? (
          <>
            <p className="hint">
              Fichier réel produit :{' '}
              {job.result?.durationSeconds !== undefined ? formatSeconds(job.result.durationSeconds) + ' s · ' : ''}
              {job.result?.mimeType ?? 'audio'} · voix {job.result?.voice ?? job.params?.voice ?? '—'} ·{' '}
              {job.result?.provider ?? 'fournisseur'} {job.result?.model ?? ''}
            </p>
            <div className="studio-audio-job-actions">
              <label className="label">
                Début de la piste (s)
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={MAX_START}
                  step={0.1}
                  value={ttsStart}
                  disabled={busy}
                  onChange={(event) => setTtsStart(clampNumber(event.target.value, 0, MAX_START, 0.1))}
                />
              </label>
              <label className="label">
                Volume (0 à 1)
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ttsGain}
                  disabled={busy}
                  onChange={(event) => setTtsGain(clampNumber(event.target.value, 0, 1, 0.01))}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={busy || !ready || applied}
              onClick={() => applyTts(job)}
            >
              {applied ? 'Piste déjà ajoutée' : 'Ajouter comme piste de voix off'}
            </button>
            <p className="hint">L’application crée une nouvelle révision de composition ; elle n’écrase jamais la révision courante.</p>
          </>
        ) : job.state === 'SUCCEEDED' ? (
          <p className="hint">Opération réussie sans fichier exploitable : aucune voix off n’est annoncée.</p>
        ) : null}
        {ACTIVE_STATES.has(job.state) ? (
          <p className="hint">En file : le suivi interroge le serveur toutes les 5 s ; aucun résultat n’est supposé.</p>
        ) : null}
        {job.state === 'FAILED' || job.state === 'UNKNOWN' ? (
          <p className="hint" role="alert">
            {job.state === 'FAILED'
              ? 'Opération en échec : aucune voix off n’a été produite.'
              : 'Issue incertaine : vérifiez le coût avant de relancer.'}
          </p>
        ) : null}
      </article>
    );
  }

  function asrJobView(job: StudioAudioJob) {
    const segmentCount = job.result?.segmentCount ?? job.result?.segments?.length ?? 0;
    const applied = appliedIds.includes(job.id);
    const source = media.find((item) => item.id === job.params?.sourceVersionId);
    return (
      <article key={job.id} className="studio-audio-job">
        <div className="studio-audio-job-head">
          <strong>Transcription · {languageLabel(job.params?.language ?? '—')}</strong>
          <span className={'pill execution-state state-' + job.state.toLowerCase()}>
            {STATE_LABELS[job.state] ?? job.state}
          </span>
        </div>
        <p className="hint">
          Demandée le {formatDate(job.createdAt)} · source {sourceLabel(source, job.params?.sourceVersionId ?? '?')} ·
          composition source v{job.params?.revision ?? '—'} · coût : {costLabel(job)} · empreinte{' '}
          <code title={job.digest}>{shortDigest(job.digest)}</code>
        </p>
        {job.state === 'PROPOSED' ? (
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => approveJob(job)}>
            Autoriser jusqu’à {job.maxCents} centime(s) USD
          </button>
        ) : null}
        {job.state === 'SUCCEEDED' ? (
          segmentCount > 0 ? (
            <>
              <p className="hint">
                {segmentCount} segment(s) horodaté(s) · langue {languageLabel(job.result?.language ?? job.params?.language ?? '—')}{' '}
                · {job.result?.provider ?? 'fournisseur'} {job.result?.model ?? ''}
              </p>
              <label className="label">
                Application aux sous-titres
                <select
                  className="input"
                  value={asrMode}
                  disabled={busy}
                  onChange={(event) => setAsrMode(event.target.value as 'replace' | 'append')}
                >
                  <option value="replace">Remplacer les sous-titres existants</option>
                  <option value="append">Ajouter aux sous-titres existants</option>
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={busy || !ready || applied}
                onClick={() => applyTranscription(job)}
              >
                {applied ? 'Sous-titres déjà appliqués' : 'Appliquer les sous-titres'}
              </button>
              <p className="hint">
                L’application crée une nouvelle révision ; elle n’écrase jamais la révision courante et reste limitée à
                200 sous-titres.
              </p>
            </>
          ) : (
            <p className="hint">Opération réussie sans segment exploitable : aucun sous-titre n’est annoncé.</p>
          )
        ) : null}
        {ACTIVE_STATES.has(job.state) ? (
          <p className="hint">En file : le suivi interroge le serveur toutes les 5 s ; aucun segment n’est supposé.</p>
        ) : null}
        {job.state === 'FAILED' || job.state === 'UNKNOWN' ? (
          <p className="hint" role="alert">
            {job.state === 'FAILED'
              ? 'Transcription en échec : aucun sous-titre n’a été produit.'
              : 'Issue incertaine : vérifiez le coût avant de relancer.'}
          </p>
        ) : null}
      </article>
    );
  }

  return (
    <section
      className="studio-inspector-section stack studio-audio-panel"
      aria-labelledby="inspector-audio-heading"
      aria-busy={busy}
    >
      <div className="section-head">
        <h3 id="inspector-audio-heading">Audio</h3>
        <span className="hint">
          {tracks.length} / {MAX_TRACKS} piste(s)
        </span>
      </div>
      <p className="hint">
        Composition vidéo : {formatSeconds(totalSeconds)} s au total. Les pistes, fondus et sous-titres sont enregistrés
        avec la révision ; le mixage, l’export M4A et les sous-titres sont produits par le serveur.
      </p>
      {error ? (
        <p className="studio-audio-error" role="alert">
          {error}
        </p>
      ) : null}

      {tracks.length === 0 ? (
        <p className="hint">Aucune piste audio : le rendu vidéo reste muet tant qu’aucune piste n’est ajoutée.</p>
      ) : (
        <ol className="studio-audio-tracks" aria-label="Pistes audio de la composition">
          {tracks.map((track, index) => {
            const source = media.find((item) => item.id === track.versionId);
            const startsAfterEnd = track.start >= totalSeconds - 1e-6;
            return (
              <li key={track.id} className="studio-audio-track">
                <div className="studio-audio-track-head">
                  <strong>
                    Piste {index + 1} · {TRACK_KIND_LABELS[track.kind]}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    disabled={busy}
                    onClick={() => removeTrack(track.id)}
                  >
                    Retirer la piste
                  </button>
                </div>
                <TrackWaveform source={source} />
                {startsAfterEnd ? (
                  <p className="studio-audio-error" role="alert">
                    Cette piste commence après la fin de la vidéo ({formatSeconds(totalSeconds)} s) : la sauvegarde de la
                    révision sera refusée.
                  </p>
                ) : null}
                <div className="studio-audio-track-controls">
                  <label className="label">
                    Début (s, 0 à 179,5)
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={MAX_START}
                      step={0.1}
                      value={track.start}
                      disabled={busy}
                      onChange={(event) => changeStart(track.id, event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Volume ({Math.round(track.gain * 100)} %)
                    <input
                      className="input"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={track.gain}
                      disabled={busy}
                      aria-label={'Volume de la piste ' + (index + 1) + ' en pourcentage'}
                      onChange={(event) => updateTrack(track.id, { gain: Number(event.target.value) })}
                    />
                  </label>
                  <label className="label">
                    Fondu d’entrée (s, 0 à 3)
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={3}
                      step={0.1}
                      value={track.fadeIn}
                      disabled={busy}
                      onChange={(event) => changeFade(track.id, 'fadeIn', event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Fondu de sortie (s, 0 à 3)
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={3}
                      step={0.1}
                      value={track.fadeOut}
                      disabled={busy}
                      onChange={(event) => changeFade(track.id, 'fadeOut', event.target.value)}
                    />
                  </label>
                </div>
                {track.kind !== 'voiceover' ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(track.ducking)}
                      disabled={busy}
                      onChange={(event) => updateTrack(track.id, { ducking: event.target.checked })}
                    />
                    <span>Atténuer automatiquement sous la voix off (ducking)</span>
                  </label>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="studio-audio-add" role="group" aria-labelledby="studio-audio-add-heading">
        <p className="label" id="studio-audio-add-heading">
          Ajouter une piste
        </p>
        {availableAudio.length === 0 ? (
          <p className="hint">
            Aucune ressource audio dans la marque : importez un fichier WAV ou MP3 dans la bibliothèque pour créer une
            piste.
          </p>
        ) : (
          <>
            <label className="label">
              Ressource audio
              <select
                className="input"
                value={selectedSource}
                disabled={busy || tracks.length >= MAX_TRACKS}
                onChange={(event) => setSelectedSource(event.target.value)}
              >
                <option value="">Choisir une ressource audio</option>
                {availableAudio.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} · {source.mimeType ?? 'type inconnu'}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Type de piste
              <select
                className="input"
                value={newKind}
                disabled={busy || tracks.length >= MAX_TRACKS}
                onChange={(event) => setNewKind(event.target.value as AudioTrackKind)}
              >
                {audioTrackKind.options.map((kind) => (
                  <option key={kind} value={kind}>
                    {TRACK_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={busy || !selectedSource || tracks.length >= MAX_TRACKS}
              onClick={addTrack}
            >
              Ajouter une piste
            </button>
            <p className="hint">
              Nouvelle piste par défaut : musique, début 0 s, volume 0,8. Quatre pistes audio au maximum par composition.
            </p>
          </>
        )}
      </div>

      <details className="studio-audio-details">
        <summary>Analyser la composition (outil audio.analyze@1)</summary>
        <div className="stack">
          <p className="hint">
            Analyse locale gratuite du service Python interne (lecture seule, aucun modèle génératif). Aucun résultat
            n’est affiché avant l’exécution réelle de l’opération.
          </p>
          {!ready ? (
            <p className="hint">Enregistrez la composition et affichez la révision courante pour lancer une analyse.</p>
          ) : null}
          <button type="button" className="btn btn-secondary btn-small" disabled={busy || !ready} onClick={analyze}>
            Analyser la composition
          </button>
          {analyzeError ? (
            <p className="studio-audio-error" role="alert">
              {analyzeError}
            </p>
          ) : null}
          {analyzeOperation ? (
            <article className="studio-audio-job">
              <div className="studio-audio-job-head">
                <strong>Analyse audio</strong>
                <span className={'pill execution-state state-' + analyzeOperation.state.toLowerCase()}>
                  {STATE_LABELS[analyzeOperation.state] ?? analyzeOperation.state}
                </span>
              </div>
              <p className="hint">
                Créée le {formatDate(analyzeOperation.createdAt)} · coût : {costLabel(analyzeOperation)}
              </p>
              {analyzeOperation.state === 'PROPOSED' ? (
                <p className="hint" role="status">
                  L’opération est proposée et attend son autorisation.
                </p>
              ) : ACTIVE_STATES.has(analyzeOperation.state) ? (
                <p className="hint" role="status">
                  En file : l’opération attend l’exécution du worker ; aucun résultat n’est affiché avant son exécution
                  réelle.
                </p>
              ) : null}
              {analyzeOperation.result ? (
                <details>
                  <summary>Résultat structuré</summary>
                  <pre className="execution-result">{JSON.stringify(analyzeOperation.result, null, 2).slice(0, 2000)}</pre>
                </details>
              ) : null}
              {!analyzeOperation.result && analyzeOperation.state === 'FAILED' ? (
                <p className="hint" role="alert">
                  Opération en échec : aucun résultat.
                </p>
              ) : null}
            </article>
          ) : null}
        </div>
      </details>

      <div className="studio-audio-block" role="group" aria-labelledby="studio-audio-tts-heading">
        <div className="section-head">
          <h4 id="studio-audio-tts-heading">Voix off · synthèse vocale</h4>
          <span className="hint">{ttsJobs.length} opération(s)</span>
        </div>
        {capState === 'loading' ? (
          <p role="status">Chargement des capacités audio…</p>
        ) : capState === 'error' ? (
          <div className="stack">
            <p role="alert">Capacités audio indisponibles : aucun état n’est supposé.</p>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              Réessayer
            </button>
          </div>
        ) : ttsCapability ? (
          <>
            <p className="hint">
              {ttsCapability.provider} · {ttsCapability.model} · {availabilityLabel(ttsCapability)} · plafond{' '}
              {ttsCapability.maxCents} centime(s) USD · estimation {ttsCapability.estimatedCents} centime(s) USD.
            </p>
            {ttsCapability.availability !== 'configured' ? (
              <p className="studio-audio-availability" role="status">
                {ttsCapability.reason ?? 'Synthèse vocale désactivée sur ce serveur.'}
              </p>
            ) : null}
            {!ttsCapability.providerCallVerified ? (
              <p className="hint">
                Disponibilité issue de la configuration serveur : aucun appel fournisseur n’a été vérifié à ce stade.
              </p>
            ) : null}
            <label className="label">
              Texte de la voix off (1 à 1200 caractères)
              <textarea
                className="input"
                rows={3}
                maxLength={MAX_TTS_TEXT}
                value={ttsText}
                disabled={busy}
                placeholder="Texte que la voix off prononcera."
                onChange={(event) => setTtsText(event.target.value)}
              />
            </label>
            <p className="hint" role="status">
              {ttsText.trim().length} / {MAX_TTS_TEXT} caractères après espaces de bord.
            </p>
            <div className="two-col">
              <label className="label">
                Langue de la voix
                <select
                  className="input"
                  value={ttsLanguage}
                  disabled={busy}
                  onChange={(event) => setTtsLanguage(event.target.value as AudioLanguage)}
                >
                  {ttsLanguages.map((language) => (
                    <option key={language} value={language}>
                      {languageLabel(language)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Voix du catalogue
                <select
                  className="input"
                  value={ttsVoice}
                  disabled={busy || ttsVoices.length === 0}
                  onChange={(event) => setTtsVoice(event.target.value)}
                >
                  {ttsVoices.length === 0 ? <option value="">Aucune voix fournie</option> : null}
                  {ttsVoices.map((voice) => (
                    <option key={voice} value={voice}>
                      {voice}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={ttsRights}
                disabled={busy}
                onChange={(event) => setTtsRights(event.target.checked)}
              />
              <span>J’ai les droits nécessaires et j’autorise l’envoi de ce texte au fournisseur.</span>
            </label>
            {!ready ? (
              <p className="hint">
                Enregistrez la composition et affichez la révision courante pour préparer une voix off.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={busy || !canPrepareTts}
              onClick={prepareTts}
            >
              Préparer sans facturer
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              Actualiser les opérations audio
            </button>
            {jobsState === 'error' ? (
              <p role="status">Historique des opérations audio indisponible ; nouvelle tentative possible.</p>
            ) : null}
            {ttsJobs.length ? (
              <div className="studio-audio-jobs" aria-label="Opérations de voix off">
                {ttsJobs.map(ttsJobView)}
              </div>
            ) : (
              <p className="hint">Aucune voix off préparée pour ce projet.</p>
            )}
          </>
        ) : null}
      </div>

      <div className="studio-audio-block" role="group" aria-labelledby="studio-audio-asr-heading">
        <div className="section-head">
          <h4 id="studio-audio-asr-heading">Transcription · sous-titres automatiques</h4>
          <span className="hint">{asrJobs.length} opération(s)</span>
        </div>
        {capState === 'loading' ? (
          <p role="status">Chargement des capacités audio…</p>
        ) : capState === 'error' ? (
          <p role="alert">Capacités audio indisponibles : aucun état n’est supposé.</p>
        ) : asrCapability ? (
          <>
            <p className="hint">
              {asrCapability.provider} · {asrCapability.model} · {availabilityLabel(asrCapability)} · plafond{' '}
              {asrCapability.maxCents} centime(s) USD · estimation {asrCapability.estimatedCents} centime(s) USD.
            </p>
            {asrCapability.availability !== 'configured' ? (
              <p className="studio-audio-availability" role="status">
                {asrCapability.reason ?? 'Transcription désactivée sur ce serveur.'}
              </p>
            ) : null}
            {asrOptions.length === 0 ? (
              <p className="hint">
                Aucune piste audio disponible : ajoutez une piste à la composition ou importez un fichier audio dans la
                marque.
              </p>
            ) : (
              <>
                <label className="label">
                  Piste à transcrire
                  <select
                    className="input"
                    value={asrSource}
                    disabled={busy}
                    onChange={(event) => setAsrSource(event.target.value)}
                  >
                    <option value="">Choisir une piste audio</option>
                    {asrOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="label">
                  Langue parlée
                  <select
                    className="input"
                    value={asrLanguage}
                    disabled={busy}
                    onChange={(event) => setAsrLanguage(event.target.value as AudioLanguage)}
                  >
                    {asrLanguages.map((language) => (
                      <option key={language} value={language}>
                        {languageLabel(language)}
                      </option>
                    ))}
                  </select>
                </label>
                {asrSelection ? (
                  <p className="hint">
                    Format : {asrSelection.source?.mimeType ?? 'non vérifiable ici'} · licence :{' '}
                    {asrSelection.source?.license ?? 'non vérifiable ici'} · durée :{' '}
                    {asrSelection.source?.metadata?.duration !== undefined
                      ? formatSeconds(asrSelection.source.metadata.duration) + ' s'
                      : 'non fournie'}
                    . Les formats WAV et MP3 avec droits confirmés sont acceptés par le serveur.
                  </p>
                ) : null}
                {!asrSupported ? (
                  <p className="hint" role="status">
                    Cette piste n’est pas proposable : format non pris en charge (WAV ou MP3), droits inconnus, ou
                    ressource absente de la bibliothèque chargée.
                  </p>
                ) : null}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={asrRights}
                    disabled={busy}
                    onChange={(event) => setAsrRights(event.target.checked)}
                  />
                  <span>J’ai les droits sur cette piste audio et j’autorise son analyse par le fournisseur.</span>
                </label>
                {!ready ? (
                  <p className="hint">
                    Enregistrez la composition et affichez la révision courante pour préparer une transcription.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={busy || !canPrepareAsr}
                  onClick={prepareTranscription}
                >
                  Préparer sans facturer
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              Actualiser les opérations audio
            </button>
            {jobsState === 'error' ? (
              <p role="status">Historique des opérations audio indisponible ; nouvelle tentative possible.</p>
            ) : null}
            {asrJobs.length ? (
              <div className="studio-audio-jobs" aria-label="Opérations de transcription">
                {asrJobs.map(asrJobView)}
              </div>
            ) : (
              <p className="hint">Aucune transcription préparée pour ce projet.</p>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
