# Contract signing LIFF initialization deployment

PR #505 was deployed to the Engineering runtime on 2026-10-28. Production health returned commit `1e2d6f6d68df63971fd3d3d125d47736c0988686`, and the live signing page returned the changed initialization sequence. Signing page, signing workflow, runtime, security gate and package tests passed locally.

The affected Android user initially reported the original invitation still displayed an incomplete-link error after deployment. A follow-up diagnostic change was deployed at `fc09f891c1742e9b2174f2c5029902a9365f1e99`; the user then reported entering the party B contract page using the original invitation. The cause of the earlier failure remains unconfirmed. No signatures were submitted during verification.
