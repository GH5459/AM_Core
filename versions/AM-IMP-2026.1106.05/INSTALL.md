# 安裝

重新讀取 DailyLog 當前完整正式來源、版本、設定及排程。只在精確定位點符合時套用本包；保留所有未改模組的原始 bytes、Assets、秘密、bindings、排程及版本 metadata。不能沿歷史完整包或 dirty 根目錄重新編譯發布。

新前端轉換必須位於最外層版本快取之前，保留原 project-identity、tasks、HR 與 routine 執行順序。驗證全部通過、完整 CI 與合併樹相同後才發布 DailyLog。AM 與 UOF 不需要為本包重發。
