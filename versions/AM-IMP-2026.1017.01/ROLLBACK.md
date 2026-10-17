# Rollback

Revert only the feature commit through reviewed main. Confirm no newer unrelated service changes are overwritten. No schema migration or source deletion occurs. Requests already cancelled by timeout must remain cancelled; do not bulk revive them or replay old LINE messages. Reverting removes the new deadline gate for still-active confirmations; pause/review those if necessary.
