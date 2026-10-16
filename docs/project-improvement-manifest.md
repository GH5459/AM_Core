# Root OA runtime improvements

| Package | Target | Status | Verification |
| --- | --- | --- | --- |
| AM-IMP-2026.1012.01 | Root Leaf OA only | Deployed | 67 isolated checks; PR285 CI passed; production 6566e18, both all-oa-groups scopes and six fixed AI checks verified |
| AM-IMP-2026.1013.01 | Root Leaf OA only | Deployed | PR288 CI passed; production e2773df and enabled entry marker verified; 82 tests and three webhook simulations passed |
| AM-IMP-2026.1013.02 | Root Leaf OA only | Installed | UOF setup external browser URI; production verification pending |

This record does not install changes into SevenAM or other OA credentials. Their existing manifests and permissions are unchanged.

| AM-IMP-2026.1013.03 | Root Leaf OA only | Deployed | PR290 CI passed; live 699d76d on both origins; enabled organizer-confirmation-per-person; LINE card validation 200; original task issued/notified with requester, recipient and evidence linked; meeting card remains unconfirmed |

| AM-IMP-2026.1013.04 | Root Leaf OA calendar and configured DailyLog | Installed | 33 root calendar/group checks; 15 DailyLog source/full-worker/sharing checks; production pending |

| AM-IMP-2026.1016.01 | Root Leaf OA / authorized photo pilot only | Deployed | PR293 full CI passed; live 06f8811 on both origins; DailyLog819d95d5 complete24 modules and original Assets/bindings/cron verified; exact original group pilot enabled and other group disabled; human new mention/photo selection pending natural acceptance |
