# 安裝

從最新 main 隔離實作，完整 CI 通過、審查後合併。AM 依合併 main 發布。DailyLog 與 UOF 各由真正最新完整正式模組延伸，只換 common-line 模組及新增各自 recovery 模組，保留其餘全部 bytes、Assets、秘密、bindings、排程。先部署 DailyLog，再 UOF，最後以原機器入口為指定同仁登記短效重新驗證資格；此步不改身分。本人自己完成驗證。禁止歷史包重發或 dirty 根 build。
