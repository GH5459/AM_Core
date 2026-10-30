# AM-IMP-2026.1008.07 deployment receipt

Status: Deployed. AM production 2931da7f82e3b63aa02e486ebd76d8ab2dc57eec, reviewed main from PR #270/#271/#272. DailyLog target 9612afed-a60d-4833-85b7-ea372eab88b7; dedicated green-hotel task service is configured and read back.

Explicit group mentions issue a same-ID task immediately; requester details reminders and recipient execution are independent. Configuration uses its own encrypted taskService namespace and preserves Calendar configuration. Other tenant errors do not stop the enrolled task drain. Source deployment, dedicated contract and target data/binding preservation are verified; human LINE acceptance is pending. No real task or LINE message was created for deployment tests.

Private service configuration and rollback material stay at the original DailyLog target. Integration evidence E29 contains only code hashes, versions and counts. This receipt records the live root runtime; the old primary checkout is not the production source.

## 較新發布保留核對（E30）

2026-10-08最後唯讀核對：DailyLog已由另一輪發布677aac87-53ec-4905-b180-196a900fc883／task-card-all-fields-release-20261008，完整六module與固定包hash相符，專用交辦health200／匿名401、補資料及目的／目標欄位、原binding及36工作ID／歷史和127身份保持；當時37工作。AM2931da7f及green-hotel配置保持。本輪不重發布或回灌舊9612afed；後續使用該真正最新固定包。E29是本包初次部署歷史，E30是較新版本保留核對，真人LINE仍待驗收。
