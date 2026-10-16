# Root OA runtime improvements

| Package | Target | Status | Verification |
| --- | --- | --- | --- |
| AM-IMP-2026.1012.01 | Root Leaf OA only | Deployed | 67 isolated checks; PR285 CI passed; production 6566e18, both all-oa-groups scopes and six fixed AI checks verified |
| AM-IMP-2026.1013.01 | Root Leaf OA only | Deployed | PR288 CI passed; production e2773df and enabled entry marker verified; 82 tests and three webhook simulations passed |
| AM-IMP-2026.1013.02 | Root Leaf OA only | Installed | UOF setup external browser URI; production verification pending |

This record does not install changes into SevenAM or other OA credentials. Their existing manifests and permissions are unchanged.

| AM-IMP-2026.1013.03 | Root Leaf OA only | Deployed | PR290 CI passed; live 699d76d on both origins; enabled organizer-confirmation-per-person; LINE card validation 200; original task issued/notified with requester, recipient and evidence linked; meeting card remains unconfirmed |

| AM-IMP-2026.1013.04 | Root Leaf OA calendar and configured DailyLog | Installed | 33 root calendar/group checks; 15 DailyLog source/full-worker/sharing checks; production pending |

| AM-IMP-2026.1016.01 | Root Leaf OA / authorized photo pilot only | Deployed | PR293 / PR295 full CI passed; live f018961 on both origins; latest concurrent DailyLog2966b151 complete24 modules retains exact photo module and original bindings/cron; original group pilot remains enabled; persistent desktop Flex actions validated; human acceptance pending |
| AM-IMP-2026.1016.02 | Root Leaf OA / original photo pilot and DailyLog | Deployed | PR297 full CI passed; live fd58e04 on both origins and purpose target editContract verified; DailyLog e6414c93 complete25 modules, keep_assets and all original settings/cron preserved; same task editor URI and quoted-image import; human LINE acceptance pending |
| AM-IMP-2026.1016.03 | Root Leaf OA existing mention pipeline | Deployed | PR299 complete CI passed; live2885bb1 on both origins with both quoted-colleague-delivery-v1 markers;61 isolated checks/pause and10 production synthetic judgments passed; original pilot/edit contract and DailyLog e6414c93 complete25 modules/settings/cron retained; human new-message acceptance pending |
