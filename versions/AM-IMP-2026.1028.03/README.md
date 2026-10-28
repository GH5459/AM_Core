# Contract workspace readiness guidance

Status: Deployed. Engineering workspace automatically displays the server's issuance blockers, the next action, and a carry-forward revision button. Missing legal fields in the revision have navigation buttons and visible outlines. Issuance stays disabled while checking, blocked or unavailable; the server readiness check runs again before an issue request.

No contract terms, frozen versions, signer assignments, permissions or LINE messages are changed by the guidance.

Production verification: PR #488 merged at 114295570fa70bed6b671ae82bc0adfd1fdb4f53. Full CI run 40621272931 passed. Render deploy dep-dbglurflk1mc738tqb40 reached Live; public health matched the exact commit. Existing incomplete frozen contract displayed its three blockers automatically, issuance was disabled, revision action carried content forward, and field navigation focused the corresponding date input. No contract terms were saved and no LINE message was sent. Original user editing tab preserved.
