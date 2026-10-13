# 驗證

- node --test tools/test-uof-setup-entry.mjs tools/test-line-bindings.mjs tools/test-line-capture-latency.mjs
- node --experimental-vm-modules tools/verify-private-assistant-pause.mjs
- node --experimental-vm-modules tools/verify-attachment-webhook.mjs
- node --experimental-vm-modules tools/verify-bank-line-reply-intake.mjs
- node --experimental-vm-modules --test tools/test-leaf-calendar.mjs
- node tools/check-upgrade-package.js AM-IMP-2026.1013.01

合成資料驗證 unsigned／standby／群組／一般聊天／配對文字／核准指令不觸發入口；
新讀 bound／suspended，混合 webhook、資料庫失敗及重送只回一次。
LINE 官方 validate/reply 只驗格式、不傳訊息。正式 health marker／版本必須回讀。
同仁手機實際點選與登入配對驗收另列，不以真人配對或訊息作自動測試。
