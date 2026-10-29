# Isolated sandbox controller prototype

This prototype models one sandbox per event using a fictional provider and a
separate, scoped-action broker. It is not wired to production, does not create
Render resources, does not provide an OS isolation boundary, and must not be
used to execute actual work. `testOnly: true` is a caller assertion, not a
security check. Actual deployment requires independent security review and
integration with a trusted supervisor, credentials, model gateway, sandbox and
provider APIs.

The SQLite controller stores event/source/generation, a hash of a scoped
capability, event lease, an absolute deadline, creation/launch/stop intents,
provider identities and an external-outcome-unknown marker. It persists an
intent before each simulated mutation. Lost replies never cause automatic
re-creation, re-launch or re-termination. Restart scanning reads provider
state and requests revocation/stopping after expiry; external effects stay
unknown even when the sandbox is observed stopped. The short-lived capability
is deliberately passed to the simulated guest; broad credentials and the host
environment are not. Scope validation belongs to the separately configured
broker. Capability generation, protection and transport remain requirements of
the future trusted supervisor.

The network policy is a *request to a fake provider*, either deny-all or an
exact-domain allow-list. There is no actual egress enforcement in this prototype.
The provider's lookup completeness and termination observations are simulated;
real provider identity, process-tree completion, idle suspension, permissions,
timeouts and restart semantics need independent verification. A lost termination
request is not retried because delivery is unknown, so an operationally
independent containment mechanism would be required. A service must repeatedly
call paginated `recover()` after startup and on a suitable schedule; without a
running and monitored supervisor there is no timely expiry guarantee. Existing
records need a reviewed schema and migration strategy before any deployment.

The controller and broker have independent stores. A broker operation already
in flight can complete after revocation; neither a timeout nor a sandbox stop
proves absence of external effects. Concurrent process launch and revoke are not
atomic. The broker's result observations do not prove a complete inventory of
side effects, and this prototype never clears the unknown marker or automatically
restarts an affected event. An operator-independent safe recovery for all
unknown cases therefore remains unfinished.

Local tests with fake providers:

```
node --test tools/test-xiaoye-sandbox-controller.cjs
node tools/test-xiaoye-sandbox-broker-integration.cjs <absolute-path-to-local-xiaoye-controlled-broker.cjs>
```

The second command tests against the sibling broker prototype; it must not be
pointed at any production module or credentials. No tests connect to Render,
GitHub, LINE, actual employee cases, or any other external service.
