# 驗證

執行 node --experimental-vm-modules --test tools/test-leaf-groups.mjs，包含原始群組／會議／本人任務保護。新增未連結交辦人與混合收件人、提示去重、名單改變、全員連結但公司不唯一、服務中斷、確認後原來源只建立一次。不得把收件人工作身分當成交辦人授權。正式兩 origin health 的 commit 與 lineGroupMentions.identityNoticePolicy=unlinked-people-only-v1 一致，保留其他功能與設定，不代送真人訊息或建任務。
