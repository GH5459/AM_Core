# Work diary first screen

The existing authenticated renderer remains the only source of bootstrap data.
Profile, private-native protection, existing Notion registration status and employee
experience are read concurrently. A first Notion registration is still awaited;
returning-account bookkeeping runs through the original register function under
waitUntil. All other register callers and all login/access/CSRF checks are unchanged.

The final response wrapper preloads the explicit identity-independent script
allowlist without changing execution order. Fixed JS/CSS URLs include the current
Cloudflare immutable Worker version from the additive non-secret binding
`{type:"version_metadata", name:"DAILYLOG_RUNTIME_VERSION"}`. Only a successful
expected-content response, without Set-Cookie, with exactly that current query
gets private browser caching. Old-version queries remain no-store. HTML, bootstrap,
configuration, APIs and private/business data retain their original policies.
Missing version metadata disables the asset optimization safely.

The previous workspace-first position/background controller is unchanged.
Server-Timing reports entry stages without account identifiers or private data.

Release only a clean reviewed commit with full CI and isolated current Worker-D1
tests. Extend the latest complete deployed module set; retain every unrelated
module, secret, asset binding, setting, schedule and tail. Add only the version
metadata binding above. Verify module hashes and original protected boundaries.
Measure the same actual rich-menu URL before and after with identical controls
and form-open criteria. Desktop Chrome/device-width results are not physical
Android results; the user-reported 11 seconds and target under 8 seconds remain
separate until a physical handset is measured.
