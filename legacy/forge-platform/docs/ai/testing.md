# AI Narrative — Testing

## Package unit tests

| Package                | Focus                                               |
| ---------------------- | --------------------------------------------------- |
| `@forge/ai-policy`     | Classification gates, restricted confirmation paths |
| `@forge/ai-redaction`  | Block/redact patterns; audit summary safety         |
| `@forge/ai-evaluation` | Schema parse, unsupported-claim heuristics          |

Run via workspace filters, e.g. `pnpm --filter @forge/ai-policy test`.

## Provider stub

`StubAiNarrativeProvider` is the only provider for foundation tests. Enable selection with `ai.narrative.stub_provider` in test context. Do not assert production model behavior against the stub.

## API / integration

- Feature flags default false: assert generate returns disabled/forbidden when master flag is off.
- Permission matrix: generate, accept, reject, usage, configure.
- Accept / partial-accept / reject require draft id and leave auditable status.
- Redaction: restricted fields never appear in provider request fixtures.
- Evaluation: malformed provider JSON → FAILED / rejected output path.

## Explicit exclusions (Phase 4 / 5)

- Not enabled on Phase 4 synthetic tenant — do not flip flags in Phase 4 acceptance suites.
- No live Bedrock/OpenAI calls until Phase 5 is authorized.
- No auto NERIS/ePCR assertions — those paths must remain absent.

## Manual smoke (local)

1. Migrate through `0020_ai_narrative_foundation`.
2. Confirm `platform-api` `/api/v1/ai/*` routes register.
3. Confirm `ai-narrative-api` `/health` responds.
4. With flags off, POST narratives → disabled.
5. With stub + flags on in a non-Phase-4 test tenant only, create → review → accept/reject.
