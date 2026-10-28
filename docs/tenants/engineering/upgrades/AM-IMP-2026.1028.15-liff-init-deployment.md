# Contract signing LIFF initialization deployment

PR #505 was deployed to the Engineering runtime on 2026-10-28. Production health returned commit `1e2d6f6d68df63971fd3d3d125d47736c0988686`, and the live signing page returned the changed initialization sequence. Signing page, signing workflow, runtime, security gate and package tests passed locally.

The affected Android user reported the original invitation still displayed an incomplete-link error after deployment. The tested change is live, but the incident is not resolved. Further diagnosis must avoid exposing signing tokens or submitting a real signature.
