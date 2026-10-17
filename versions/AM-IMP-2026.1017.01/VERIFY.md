# Verify

Run node --experimental-vm-modules --test tools/test-leaf-groups.mjs and the existing leaf-calendar tests. Verify no writes before confirmation; silence after ten minutes, at the exact boundary, across restart, and when old buttons are clicked. Verify the original deadline survives edits and uncertain delivery. Verify the locked store rejects a late confirmation even before background cleanup. Verify timely confirmed fanout can resume after ten minutes; ordinary task waiting is unaffected.

Check package completeness, diff and alignment audit. Do not call global alignment complete if unrelated legacy gaps remain. After production rollout verify both original health origins: lineGroupMentions.confirmationTimeoutSeconds=600 and confirmationTimeoutPolicy=group-invite-silent-timeout-10m-v1. Real group behavior acceptance remains separate from isolated synthetic tests.
