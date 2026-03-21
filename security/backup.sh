#!/bin/bash
# F1 Karvaan — Firestore backup script
#
# Usage:
#   ./security/backup.sh                   # Manual backup
#   ./security/backup.sh "pre-rules-v2"    # Labelled backup
#
# Requirements:
#   - firebase CLI logged in: firebase login
#   - gsutil / gcloud available
#   - Project storage bucket exists

set -euo pipefail

PROJECT_ID="f1-predictions-league"
BUCKET="gs://${PROJECT_ID}.appspot.com"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LABEL=${1:-"manual"}
BACKUP_PATH="${BUCKET}/backups/${TIMESTAMP}_${LABEL}"
HISTORY_FILE="$(dirname "$0")/backup-history.log"

echo "╔══════════════════════════════════════════╗"
echo "║   F1 Karvaan — Firestore Backup           ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Project : ${PROJECT_ID}"
echo "  Label   : ${LABEL}"
echo "  Target  : ${BACKUP_PATH}"
echo "  Time    : ${TIMESTAMP}"
echo ""

# ── Preflight checks ────────────────────────────────────────────────────────

if ! command -v firebase &> /dev/null; then
  echo "❌  Firebase CLI not found. Install: npm install -g firebase-tools"
  exit 1
fi

if ! command -v gsutil &> /dev/null; then
  echo "❌  gsutil not found. Install Google Cloud SDK."
  exit 1
fi

echo "⏳  Starting Firestore export..."
firebase firestore:export "${BACKUP_PATH}" --project "${PROJECT_ID}"

echo ""
echo "🔍  Verifying backup exists..."
if gsutil ls "${BACKUP_PATH}" > /dev/null 2>&1; then
  echo "✅  Backup verified at: ${BACKUP_PATH}"
else
  echo "❌  Backup verification failed — check GCS bucket."
  exit 1
fi

# ── Count documents (integrity snapshot) ────────────────────────────────────

echo ""
echo "📊  Snapshot counts (save these before each deployment):"
echo "    Run: node security/integrity-check.js >> security/snapshots/${TIMESTAMP}.json"

# ── Log to history ───────────────────────────────────────────────────────────

mkdir -p "$(dirname "$HISTORY_FILE")"
echo "${TIMESTAMP} | ${BACKUP_PATH} | ${LABEL}" >> "${HISTORY_FILE}"
echo ""
echo "📝  Logged to ${HISTORY_FILE}"

# ── Restore instructions ─────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  To RESTORE this backup (DESTRUCTIVE):"
echo ""
echo "  firebase firestore:import \\"
echo "    ${BACKUP_PATH} \\"
echo "    --project ${PROJECT_ID}"
echo ""
echo "  ⚠️  This overwrites ALL current Firestore data."
echo "  ⚠️  Only run in a declared incident. See INCIDENT_RESPONSE.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
