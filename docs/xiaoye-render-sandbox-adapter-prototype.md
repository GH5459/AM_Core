# Render sandbox CLI adapter (isolated, disabled prototype)

This module is not connected to XiaoYe or any production service. No automatic
activation is provided. Its tests launch only the local fictional CLI fixture,
which reads and writes temporary JSON files and performs no network requests.
The real Render CLI can create billable resources, so use of this adapter with a
real CLI and credentials requires a separately reviewed rollout.

The adapter accepts an explicit CLI executable, workspace ID, group ID, host-only
API key, network hosts, deadline and broker. It passes no credentials or task
content on the CLI command line or into a sandbox. Host CLI credentials are in
its environment and must be protected by the supervisor and operating system;
this prototype does not establish that boundary. Each event has a durable local
creation intent before the CLI call. Create always specifies workspace, group,
finite lifetime, disabled automatic idle suspension, and either deny-all or
exact-domain HTTPS allow-list. It requires the returned identity, group, policy,
timeout and idle timeout to match before returning a created record. Stopping is attempted after requesting broker revocation; an unreachable broker
does not prevent a stop request for the identified sandbox. Revocation is
confirmed only by an exact event/source/generation receipt, and stopping is
confirmed only by a list readback.

Render CLI 2.33.0 does not expose a create idempotency key or an intent label.
A lost create response cannot be attributed to a particular event by listing;
this adapter merely reports the group list count, retains unknown and never
recreates or guesses an identity. A sandbox with an unconfirmed identity may
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
