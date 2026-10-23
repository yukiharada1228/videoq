# On-prem Helm validation — 2026-10-23

## Delivered configuration

- Production Hono/Node API and migration bundle, with PostgreSQL connection pools and transactional shared rate limiting.
- S3-compatible media operations without Cloudflare bindings; operator-managed DB, bucket, queue and inference endpoints.
- Python on-prem image with locked dependencies, job deadlines and graceful SIGTERM handling.
- Helm chart for API, web, worker, migration hook, recovery/retention CronJobs and a connectivity test; optional ingress.
- English and Japanese installation guidance, configuration examples and a dedicated CI workflow.

## Automated checks executed locally

| Check | Result |
|---|---|
| API unit/integration suite with disposable PostgreSQL | 1,673 passed; 34 environment-dependent tests skipped |
| Existing Workers runtime suite | 32 passed |
| Worker poller and SQS endpoint tests | 11 passed |
| API type check | Passed |
| Wrangler generated binding type check | Up to date |
| Drizzle check / migration provenance | Passed; 40 journal entries |
| Helm lint and site/replica/secret/ingress variants | Passed |
| Strict Kubernetes 1.29 schema validation | All 11 resources valid |
| Production API / worker / web image builds | Passed on ARM64 |
| Bundled Node HTTP smoke | Readiness, auth, both chat access guards, signup, concurrent auth, maintenance, retention and graceful shutdown passed |
| English/Japanese documentation build and content checks | Passed |
| Helm package | Built successfully, including the connectivity hook and excluding local environment files |

The dedicated CI workflow was added but has not been run remotely as part of this validation. Its image builds target the runner architecture.

## Kubernetes deployment checks

A disposable kind cluster running Kubernetes 1.37 was used with test-only PostgreSQL 17/pgvector, Garage and ElasticMQ. These disposable backing services were outside the application chart and are not a production durability design.

1. Installed the chart with operator-created credentials. The pre-install migration hook applied the complete chain before application workloads started. API, web and worker became ready.
2. Exercised HTTP readiness and signup, then authenticated against the production API image.
3. Uploaded through signed S3 PUT and multipart-part URLs, aborted both uploads through the API, and confirmed no objects remained in the test bucket.
4. Delivered a valid reindex job for a nonexistent video. The worker acquired its DB lease, completed the safe no-op task and acknowledged the SQS message. Redelivery was logged as a completed duplicate, with the execution count remaining at one attempt.
5. Observed a successful scheduled recovery Job and a manually triggered retention Job.
6. Updated to a distinct API image tag and two API replicas. The pre-upgrade migration hook succeeded and both replicas became ready.
7. Ran `helm test`; the API readiness and web connectivity hook succeeded.
8. Executed the documented admin promotion command inside the API container, confirming an explicit database hostname is preserved.
9. Rolled the release configuration back to the initial one-replica configuration. The API became ready and the database retained all 40 applied migrations, as expected for an application-only rollback.

The laptop initially ran out of disk space, and other local clusters later caused probe and connection timeouts. After capacity was restored and the user authorized temporarily pausing those other clusters, the deployment lifecycle checks succeeded. These environmental failures were not counted as passing checks.

Real inference models, GPU performance, production storage/queue durability, backup recovery and site-specific ingress/TLS were not benchmarked here. The smoke checks made no paid inference calls. Validate those operator-provided services before production rollout.
