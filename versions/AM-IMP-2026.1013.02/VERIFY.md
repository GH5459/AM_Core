# 驗證

node --test tools/test-uof-setup-entry.mjs

node --experimental-vm-modules tools/verify-private-assistant-pause.mjs

node tools/check-upgrade-package.js AM-IMP-2026.1013.02

LINE官方validate/reply只驗格式，不送真人訊息。固定連結匿名GET仍應302導向
UOF本人登入。發布後核對正式commit及health browserMode=external。
手機預設瀏覽器實機確認由同仁完成；舊LINE卡片不能改寫，需重新按UOF產生新卡片。
