# UOF entry request scope

The combined entry request currently invokes the original session and pending
routes as separate actor calls. Both verify the same session/continuation chain.
Move the combined entry inside the actor and create a per-request facade which
shares only the original session verification promise between those exact GETs.
The original routes, errors, refreshed directory checks, final pending access
check, cookies, CSRF, expiry/chain checks and all approval code remain unchanged.
There is no session or business-data cache across requests. Add timing headers
without identifiers. The facade does not mutate the live actor.

Computer baseline: actual journal category-link clicks took5.197,4.247,3.907s
to visible authenticated pending-list controls. The bootstrap request took about
2.4s. These are warm desktop observations, not physical Android results. The first
opening was observed as still confirming at32.551s and ready by91.104s, but lacked
continuous observation; it is retained as an interval, not a precise latency.
Candidate performance is not a deployed speed improvement until the same entry
has been measured after an authorized release.
