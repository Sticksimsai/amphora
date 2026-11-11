#!/usr/bin/env bash
set -euo pipefail
: "${FACTORY:?}" "${VAULT:?}" "${RPC:?}" "${OPS_KEY:?}" "${METADATA_BASE:?}"

# ── S1-01 · The Gift of Fortune · edition 300 @ 0.35 HYPE
cast send $FACTORY \
  "createEdition(string,string,uint256,uint256,string,string)" \
  "The Gift of Fortune" "S1-01" 300 350000000000000000 \
  "Amphora Editions, Series I" "${METADATA_BASE}S1-01.json" \
  --rpc-url $RPC --private-key $OPS_KEY
# then set NAV = mark (artworkId is in the EditionCreated event; 90-day expiry per vault policy):
# cast send $VAULT "updateNav(uint256,uint128,uint40)" <artworkId> 350000000000000000 $(( $(date +%s) + 7776000 )) --rpc-url $RPC --private-key $OPS_KEY   # NAV = mark, expires in 90d

