# Render sandbox CLI adapter (isolated, disabled prototype)

This module is not connected to XiaoYe or any production service. No automatic
activation is provided. Its tests launch only the local fictional CLI fixture,
which reads and writes temporary JSON files and performs no network requests.
The real Render CLI can create billable resources, so use of this adapter with a
real CLI and credentials requires a separately reviewed rollout.

The adapter accepts an explicit CLI executable, workspace ID, group ID, host-only
API key, network hosts, deadline, maximum concurrency, broker and an injected authority checker.
It checks event/source/generation/lease before and after creation, and verifies
CLI workspace and sandbox-group owner before the create call. These checks and
the external create are not atomic, and the injected checker is not itself a
verified identity service. It passes no credentials or task
content on the CLI command line or into a sandbox. Host CLI credentials are in
its environment and must be protected by the supervisor and operating system;
this prototype does not establish that boundary. Each event has a durable local
creation intent before the CLI call. Create always specifies workspace, group,
finite lifetime, explicit minimum plan, disabled automatic idle suspension, and either deny-all or
exact-domain HTTPS allow-list. It requires the returned identity, group, policy,
timeout and idle timeout to match before returning a created record. Stopping is attempted after requesting broker revocation; an unreachable broker
does not prevent a stop request for the identified sandbox. Revocation is
confirmed only by an exact event/source/generation receipt, and stopping is
confirmed only by a list readback.

Render CLI 2.33.0 does not expose a create idempotency key or an intent label.
A lost create response cannot be attributed to a particular event by listing;
this adapter merely reports the group list count, retains unknown and never
recreates or guesses an identity. Duplicate sandbox IDs are transactionally fenced for both affected events; no
automatic stop is sent when ownership is disputed. A stop already in flight
before a later collision is detected cannot be recalled. A sandbox with an unconfirmed identity may
continue until its configured lifetime; if revoke cannot be confirmed, sandbox stop is still attempted but the
capability may remain usable until revocation or expiry. A stop reply that is lost is also never resent, even if it never took
effect. These are deliberate unresolved liveness and containment limitations.
The external supervisor must call `recover` periodically and after restart;
this code does not install or monitor a scheduler. Provider responses, network
policy enforcement, sandbox process termination and behavior across suspension
must be independently tested in a controlled environment before any real use.

Model gateway, event-scoped guest credentials, execution, independent broker
transport, host/guest process isolation and complete side-effect inventory are
not implemented or verified. `start` always refuses execution. Neither the
controller's `testOnly` flag nor this module is an OS security boundary. A fake
broker or forged acknowledgement is not an independent trusted revocation
service. No automatic resolution of unknown external actions is claimed.

Locally: `node --test tools/test-xiaoye-render-sandbox-adapter.cjs`.
References: [Render CLI reference](https://render.com/docs/sandboxes-cli-reference)
and installed Render CLI 2.33.0 help for `sandboxes create/list/stop`.

Concurrency is bounded by a persistent per-workspace/group limit; each event can dispatch creation at most once. A provably pre-dispatch
failure can retry at most five times with persistent backoff, a new attempt
identifier, the original deadline and exactly matching authority. Cancellation
of such a pending attempt is persisted and prevents retry. Unknown creation and termination continue to
occupy capacity; capacity is released only after confirmed termination or a
verified pre-dispatch denial. These limits apply only within the same shared
SQLite database, not to another independent supervisor/database or other Render
clients. Price is not established and no monetary cap is claimed. Render can
reset continuous runtime after suspension/resume; this adapter records an
independent original event deadline and never extends it on restart, but it
relies on an active supervisor to enforce that deadline. A missing sandbox in a
list is unknown; the list is not claimed to be a complete inventory.

This schema is experimental. Older prototype databases without the lease and
workspace columns are explicitly rejected without deleting their records; no
migration, retroactive lease assumption or duplicate-owner repair is supplied.

For pre-dispatch failures, periodic `recover` can retry only `not_started`
records after the persisted retry time. A crash or uncertain provider response
is never reclassified as not-started. The scheduler is not implemented and
retry exhaustion is not automatic completion; unverified cases stay pending.
Render's documented minimum lifetime is 60 seconds; if the remaining original
local deadline is less than 60 whole seconds the adapter does not send create.
It never sends timeout zero, which the CLI treats as its long default. Remote
creation may start later than the local request, so even a valid provider timeout
is not an absolute wall-clock enforcement without the independent supervisor.
A nominal 60-second event window will be rejected if prechecks consume any time;
the caller must supply additional time for checks, or wait for a new authorized
work item. This adapter never silently extends the original event deadline.

The sandbox lifetime is bounded by the earlier of the original event deadline
and the verified authority expiry. The expiry is persisted, and `recover` asks
for stop once it is reached. This adapter does not extend a running sandbox on
renewal or provide the always-on recovery scheduler; provider latency, failed
stop requests, supervisor downtime, and suspension/resume can extend actual
execution or costs beyond these local bounds.
In particular, a short initial authorization limits the provider lifetime to
that short window; a job longer than 30 minutes has not been connected or
verified through this adapter. The two-hour ceiling is not a promise that a
single job can renew and continue for two hours.
The installed CLI 2.33.0 sandbox commands and the currently published Render
sandbox SDK lifecycle references do not document an operation for extending an
existing sandbox's timeout. This observation is limited to those interfaces;
it is not proof that no other or future interface can do so. A longer sandbox
lifetime plus renewable short authorizations would require a trusted continuously
running supervisor that can stop and verify the exact sandbox when authorization
expires or is revoked. That supervisor and its failure handling are not yet
implemented or verified here. The adapter deliberately keeps its conservative
initial-lease bound rather than claiming long-running production support.
During each `recover` scan of a created sandbox, the prototype rechecks the
original event, source, generation and lease. A rejection or unavailable check
requests stop and keeps external effects unknown. Since no independent scheduler
is installed, this only happens when a caller runs `recover`; it is not an
immediate-revocation guarantee. The check and external provider are not atomic.
