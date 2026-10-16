# Replied-image explanation judgment correction

AM-IMP-2026.1016.03 Ready, authorized for deployment by user on 2026-10-16. An archived replied-image request to a mentioned colleague was ignored as none before DailyLog intake. Both group and task gates now share a narrow explicit explanation rule; the source relation is passed to semantic judgment for other cases without reading or inventing image contents. Single verified colleague and reply reference are required for the rule, while ambiguous recipients, negation, progress, examples and general questions retain normal safeguards.

Based on main4fe0dad/live fd58e04. Existing source, identity/current-member, replay, task creation, quote import and original-task editor behavior retained. DailyLog e6414c93 complete25 modules verified; no target rebuild or configuration writes required. Original photo pilot remains unchanged. No historical ignored event is reset or replayed, and no real task or LINE message is created for tests.

35 isolated task/group/rule checks and private pause passed; full CI and production readback pending. Human new-message LINE acceptance remains pending.
