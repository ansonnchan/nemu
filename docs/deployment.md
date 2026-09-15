# Deploying nemu

## Before deployment

Use a dedicated AWS environment and an explicitly configured AWS profile/role. Choose a region in `terraform.tfvars`, using the example as a starting point. Resource names receive a random suffix. Never put AWS keys, device secrets, or tokens into Terraform variables or frontend environment files.

Build the Lambda and web bundles from the repository root with `npm ci && npm run build`. Terraform packages `backend/dist/index.cjs`. The Lambda runs on Node.js 22; the bundle includes its AWS SDK dependencies.

## Provision

```sh
cd infrastructure
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

This provisions two private encrypted S3 buckets, a pay-per-request DynamoDB table with TTL, one Lambda, an HTTP API, CloudFront, a short-retention log group, and narrowly scoped Lambda IAM permissions. It does not create an account system. The Lambda can write only the raw object prefix and access the one table. HTTP API throttling and Lambda reserved concurrency bound basic burst behavior; they are not a complete public-abuse prevention system.

Keep Terraform state in an appropriately protected backend for shared use. The checked-in configuration defaults to local state; state files are ignored. Review AWS costs before applying. Raw-object expiry is 30 days, log expiry 14 days. S3/DynamoDB deletions are eventual, not exact-to-the-second erasure guarantees.

## Publish frontend assets

From the repository root, with the same configured AWS identity:

```sh
nemu_web_bucket=$(terraform -chdir=infrastructure output -raw web_bucket)
aws s3 sync web/dist/ "s3://$nemu_web_bucket/" --exclude index.html --cache-control 'public,max-age=31536000,immutable'
aws s3 cp web/dist/index.html "s3://$nemu_web_bucket/index.html" --cache-control 'no-cache' --content-type 'text/html'
terraform -chdir=infrastructure output -raw web_url
```

The non-fingerprinted `assets/quiet-desk.svg` and `assets/leaf.svg` should use a short cache lifetime when changed:

```sh
aws s3 cp web/dist/assets/quiet-desk.svg "s3://$nemu_web_bucket/assets/quiet-desk.svg" --cache-control 'public,max-age=3600' --content-type 'image/svg+xml'
aws s3 cp web/dist/assets/leaf.svg "s3://$nemu_web_bucket/assets/leaf.svg" --cache-control 'public,max-age=3600' --content-type 'image/svg+xml'
```

CloudFront uses a minimum cache lifetime for static content. On updates, invalidate `/index.html`, `/`, and changed non-fingerprinted assets using your distribution ID. API responses never use the static cache. The app uses the root URL and in-page navigation; no server-side route rewrites are needed.

The default certificate covers the generated CloudFront hostname. A custom-domain release additionally requires aliases, an ACM certificate, and DNS configuration; those resources are not included. The optional `web_origin` variable only changes the accepted browser Origin and does not provision a domain.

## Pair and verify

1. Build and run the Go process with `NEMU_URL` set to the output `web_url`.
2. Open the first-setup pairing link, or choose **Pair this browser** in the menu bar.
3. Observe real app transitions for more than five minutes. Choose **Sync now** in the dashboard or on macOS.
4. Refocus or reload the dashboard. Check the displayed last-sync timestamp and actual intervals.
5. Verify a second use of the link fails. Check that an unpaired browser cannot query a day.
6. Disconnect the network, collect activity, reconnect, and sync. The same queued batch must succeed once.
7. Sleep/wake and leave the machine idle for five minutes; verify those boundaries against the operating system clock.

Before public release, exercise these acceptance steps on a real AWS deployment and macOS device. Unit tests do not substitute for cloud IAM, power lifecycle, or browser-cookie acceptance tests.

## Operations

Structured logs contain event types and request IDs, not tokens or activity contents. Never enable request-body or Authorization-header logging at the API/CloudFront boundary. Monitor API error counts, DynamoDB throttling, Lambda duration/errors, and AWS spend through existing AWS metrics.

An agent warning retains its local queue. A permanent `409` signals conflicting local identity/chronology and needs investigation; do not reset a journal casually. If the operating system clock moves backward, correct it before continuing. Local disk failures stop recording to avoid pretending data was saved.

To retire an environment, stop recording and review data retention before destroying resources. Nonempty buckets are intentionally not force-destroyable.
