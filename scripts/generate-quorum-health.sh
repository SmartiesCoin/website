#!/usr/bin/env bash
#
# generate-quorum-health.sh
#
# Run on a VPS with a synced smartiecoind. Produces quorum-health.json.
#
# Usage:
#   CLI=/usr/local/bin/smartiecoin-cli ./generate-quorum-health.sh > quorum-health.json
#
# Recommended cron (hourly):
#   5 * * * * cd /var/www/smartiecoin && ./generate-quorum-health.sh > assets/quorum-health.json.tmp && mv assets/quorum-health.json.tmp assets/quorum-health.json

set -euo pipefail

CLI="${CLI:-smartiecoin-cli}"
# Network-growth target shown on the dashboard. Set to ~400 for full LLMQ_400_60
# (ChainLocks at scale) and LLMQ_400_85 (MNHF) — those are what we actually want
# to grow toward, not Platform (LLMQ_100_67).
TARGET_NODES="${TARGET_NODES:-400}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 1
fi

fetched_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

mn_count_json="$("$CLI" masternode count)"
total_nodes="$(echo "$mn_count_json"      | jq -r '.total // .enabled // 0')"
enabled_nodes="$(echo "$mn_count_json"    | jq -r '.enabled // 0')"
evo_nodes="$(echo "$mn_count_json"        | jq -r '.detailed.evo.total   // .evo.total   // 0')"
regular_nodes="$(echo "$mn_count_json"    | jq -r '.detailed.regular.total // .regular.total // 0')"

if [ "$evo_nodes" = "0" ] && [ "$regular_nodes" = "0" ]; then
  mn_list_json="$("$CLI" masternodelist json 2>/dev/null || echo '{}')"
  evo_nodes="$(echo "$mn_list_json"     | jq '[.[] | select(.type == "Evo" or .type == "HighPerformance")] | length')"
  regular_nodes="$(echo "$mn_list_json" | jq '[.[] | select(.type == "Regular" or .type == null)] | length')"
fi

quorum_list_json="$("$CLI" quorum list 2>/dev/null || echo '{}')"

dkgstatus_json="$("$CLI" quorum dkgstatus 2>/dev/null || echo '{}')"

quorums_summary="$(echo "$quorum_list_json" | jq '
  to_entries
  | map({
      type: .key,
      active_count: (.value | length),
      latest: (.value | first)
    })
')"

dkg_sessions="$(echo "$dkgstatus_json" | jq '
  (.session // [])
  | map({
      llmqType: .llmqType,
      quorumIndex: .quorumIndex,
      phase: (.status.phase // 0),
      badMembers: (.status.badMembers // 0),
      receivedContributions: (.status.receivedContributions // 0),
      receivedComplaints: (.status.receivedComplaints // 0),
      receivedPrematureCommitments: (.status.receivedPrematureCommitments // 0),
      aborted: (.status.aborted // false)
    })
')"

dkg_bad_members_max="$(echo "$dkg_sessions" | jq '[.[].badMembers] | max // 0')"
dkg_commits_total="$(echo "$dkg_sessions"   | jq '[.[].receivedPrematureCommitments] | add // 0')"
dkg_sessions_count="$(echo "$dkg_sessions"  | jq 'length')"

jq -n \
  --arg fetched_at "$fetched_at" \
  --argjson target "$TARGET_NODES" \
  --argjson total "$total_nodes" \
  --argjson enabled "$enabled_nodes" \
  --argjson evo "$evo_nodes" \
  --argjson regular "$regular_nodes" \
  --argjson quorums "$quorums_summary" \
  --argjson dkg_sessions "$dkg_sessions" \
  --argjson dkg_bad_members_max "$dkg_bad_members_max" \
  --argjson dkg_commits_total "$dkg_commits_total" \
  --argjson dkg_sessions_count "$dkg_sessions_count" \
  '{
    fetched_at: $fetched_at,
    nodes: {
      total: $total,
      enabled: $enabled,
      evo: $evo,
      regular: $regular,
      target_for_chainlocks: $target,
      progress_pct: (if $target > 0 then (($enabled / $target) * 100 | floor) else 0 end)
    },
    quorums: $quorums,
    dkg: {
      sessions_count: $dkg_sessions_count,
      worst_bad_members: $dkg_bad_members_max,
      total_premature_commits: $dkg_commits_total,
      sessions: $dkg_sessions
    }
  }'
