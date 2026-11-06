# 安裝

從完整 CI 通過且已合併推送 main 的提交發布 AM。使用正式環境的 AMCORE_MEETING_START_OPERATORS JSON 指定有效 tenantKey/account；不得把正式值寫入共用套件。保留現有其他設定。

讀取 DailyLog 最新完整模組與設定，私人保存回退。用本包 build.cjs 的 patchWorker 只替換現有內嵌 workspace 與來源工具函式，保留最新 Calendar 建檔、取消與其他功能及全部其餘模組、資產、秘密、bindings、排程。發布前重核基準版本與模組雜湊，變動即重新準備。不要重建 dirty 根目錄。
