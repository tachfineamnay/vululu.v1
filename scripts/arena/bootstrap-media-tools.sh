#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vululu — provisionnement des binaires média (FFmpeg + FFprobe) en sandbox Linux
#
# Pourquoi ce script existe :
#   apt-get est inutilisable dans les sandboxes Arena (Debian/Ubuntu en HTTP
#   seulement, et binaries.prisma.sh / objects.githubusercontent.com sont hors
#   liste d'autorisation). PyPI et registry.npmjs.org sont en revanche
#   joignables : on y récupère des binaires statiques réels.
#
# Résultat :
#   $HOME/.local/bin/ffmpeg  (libx264 + AAC, --enable-gpl)
#   $HOME/.local/bin/ffprobe
#
# Idempotent : ne retélécharge rien si les binaires sont déjà exécutables.
# Aucun fichier n'est écrit dans le dépôt.
# ---------------------------------------------------------------------------
set -euo pipefail

BIN_DIR="${HOME}/.local/bin"
WORK_DIR="${HOME}/.local/vululu-toolchain"
mkdir -p "${BIN_DIR}" "${WORK_DIR}"

log() { printf '[tools] %s\n' "$*"; }

have_ffmpeg() {
  [ -x "${BIN_DIR}/ffmpeg" ] && "${BIN_DIR}/ffmpeg" -hide_banner -version >/dev/null 2>&1
}
have_ffprobe() {
  [ -x "${BIN_DIR}/ffprobe" ] && "${BIN_DIR}/ffprobe" -hide_banner -version >/dev/null 2>&1
}

# --- FFmpeg : wheel PyPI imageio-ffmpeg (binaire statique, libx264 + AAC) ---
if have_ffmpeg; then
  log "ffmpeg déjà présent : ${BIN_DIR}/ffmpeg"
else
  log "récupération de FFmpeg via PyPI (imageio-ffmpeg)"
  python3 -m pip download --no-deps --dest "${WORK_DIR}" imageio-ffmpeg >/dev/null
  wheel=$(ls -1t "${WORK_DIR}"/imageio_ffmpeg-*.whl | head -n 1)
  rm -rf "${WORK_DIR}/imageio" && mkdir -p "${WORK_DIR}/imageio"
  python3 - "${wheel}" "${WORK_DIR}/imageio" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY
  candidate=$(find "${WORK_DIR}/imageio" -type f -name 'ffmpeg-linux-*' | head -n 1)
  [ -n "${candidate}" ] || { log "ERREUR: binaire ffmpeg introuvable dans la wheel"; exit 1; }
  install -m 0755 "${candidate}" "${BIN_DIR}/ffmpeg"
  log "ffmpeg installé : ${BIN_DIR}/ffmpeg"
fi

# --- FFprobe : paquet npm @ffprobe-installer/linux-x64 (binaire dans le tgz) --
if have_ffprobe; then
  log "ffprobe déjà présent : ${BIN_DIR}/ffprobe"
else
  log "récupération de ffprobe via npm (registry.npmjs.org)"
  npm pack @ffprobe-installer/linux-x64 --pack-destination "${WORK_DIR}" >/dev/null 2>&1
  tgz=$(ls -1t "${WORK_DIR}"/ffprobe-installer-linux-x64-*.tgz | head -n 1)
  [ -n "${tgz}" ] || { log "ERREUR: paquet ffprobe introuvable"; exit 1; }
  rm -rf "${WORK_DIR}/ffprobe" && mkdir -p "${WORK_DIR}/ffprobe"
  tar xzf "${tgz}" -C "${WORK_DIR}/ffprobe"
  candidate=$(find "${WORK_DIR}/ffprobe" -type f -name ffprobe | head -n 1)
  [ -n "${candidate}" ] || { log "ERREUR: binaire ffprobe introuvable"; exit 1; }
  install -m 0755 "${candidate}" "${BIN_DIR}/ffprobe"
  log "ffprobe installé : ${BIN_DIR}/ffprobe"
fi

# --- Vérification fonctionnelle réelle (pas seulement la présence) ----------
log "vérification : encodage h264 + aac"
smoke="$(mktemp -d)"
trap 'rm -rf "${smoke}"' EXIT
"${BIN_DIR}/ffmpeg" -hide_banner -loglevel error -y \
  -f lavfi -i color=c=navy:s=320x240:d=1 \
  -f lavfi -i anullsrc=r=44100:cl=stereo \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -t 1 "${smoke}/smoke.mp4"
probe="$("${BIN_DIR}/ffprobe" -v error -show_entries stream=codec_name -of csv=p=0 "${smoke}/smoke.mp4" | tr '\n' ',')"
case "${probe}" in
  *h264*aac*) log "OK — codecs détectés : ${probe}" ;;
  *) log "ERREUR: codecs inattendus : ${probe}"; exit 1 ;;
esac

log "terminé. Ajouter au PATH :  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
log "puis :  export FFMPEG_PATH=\"\${HOME}/.local/bin/ffmpeg\"  FFPROBE_PATH=\"\${HOME}/.local/bin/ffprobe\""
