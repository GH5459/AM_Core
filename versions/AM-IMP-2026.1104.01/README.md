# Bounded AI, preview and patrol memory
Status: Ready. Root AM Platform only; no vendored runtime per VENDORED.md.

Historical Render OOM on 2026-11-03 is confirmed at 512 MB. No heap dump/request allocation trace exists to attribute that event to a specific request. AI errors are correlation, not proof of an infinite retry: existing retries and budgets are finite.

Reproduced defect: no shared AI concurrency admission across tenant clients; image input becomes binary + Base64 + serialized JSON; repeated slow calls overlap. Synthetic 24 x 8 MiB image calls against mocked HTTP completed with old peak RSS 572 MiB/24 active versus patched 243 MiB/2 active on Windows Node 24.19.0. Figures describe this fixture, not production traffic or a guaranteed memory ceiling.

Also fixed: media context retains raw input while waiting for AI; preview decoding can overlap large rasters; dispatcher patrols can overlap timer/cron calls; Drive chunked download enforces byte limit only after buffering full response. Native decode is now serialized before fetch.

AI profiles, bounded retries/fallback, exact original bytes, signed access checks, image dimensions, event association, module order and durable jobs remain. Overload queue is bounded (AI 64, preview 16); expired/full admission fails through existing error paths. Pending AI wait counts toward total call budget. Numeric-only runtime memory and gate counts logged every minute.
