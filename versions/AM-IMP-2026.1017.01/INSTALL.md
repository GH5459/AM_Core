# Install

Apply core/group-invite-policy.js plus leaf-groups.js and leaf-groups-store.js to the AM Platform root service serving this OA, using the reviewed GitHub main process. No schema or secret changes are required: policy fields stay in existing groupDispatch JSON. Do not install OA-specific credentials or data into HOZO_AM/SevenAM; other services remain separate.

The existing five-second scheduler performs quiet cleanup; the transactional button handler also rejects at the deadline even when cleanup has not run. New cards state the policy. No historical message replay or new event creation is needed.
