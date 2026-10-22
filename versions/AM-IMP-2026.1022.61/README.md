# 葉小蝸系統連結改用外部瀏覽器

LINE方案核准、提供建議、查看案件與文字系統入口在點擊前加入官方openExternalBrowser=1。原案件與方案hash、動作、ticket及fragment保持，登入返回同一版；只開連結不核准。傳輸層補齊URI action及既有公司服務的文字網址，保留媒體下載URI、postback與第三方文字網址。未修改已送出的LINE歷史訊息。

官方依據：https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/#opening-url-in-external-browser 。手機LINE支援此外部瀏覽器參數，LIFF／MINI App及line://功能連結沿原用途，不假設電腦版可被網站強制指定某瀏覽器。
