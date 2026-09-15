# Security and privacy

## What is collected

Application display name and bundle identifier; UTC starts/ends; app or idle interval type; logical session and batch identity; reason an interval ended. Input activity is only the operating system’s inactivity duration. No event contents are read.

## Credentials and pairing

The process generates a 128-bit device ID and 256-bit secret from the operating system’s random source. Only the secret’s SHA-256 hash goes into DynamoDB. The secret is sent to the configured HTTPS API for registration/authentication and stored locally in Keychain. Local files contain only the device ID and activity state. Redirects are rejected by the uploader.

Pairing links carry a random 256-bit token in the URL fragment, never the permanent credential. The fragment is removed before a network request. Redemption checks a ten-minute expiry and atomically deletes the token while creating a browser session. Token and session lookup keys are hashes. Expiry is enforced in code, independently of asynchronous TTL removal.

Cookies use Secure, HttpOnly, SameSite=Strict, and `/api` scope. Browser mutations check the configured Origin; pairing requires it. Sessions expire after 30 days. Disconnect clears the browser cookie; it does not revoke a previously stolen copy server-side. Treat a browser-session compromise as lasting until expiry, or remove its hashed session record through trusted operations.

## Trust and limitations

Possession of a pairing link grants access to its device, so keep links private. A stolen permanent device secret lets an attacker submit data for that device and issue pairing links. There is no password recovery or account owner to authenticate against. Keychain and filesystem protection assume the macOS user account itself is trusted. The local journal is private but not separately encrypted; use operating-system disk encryption for at-rest protection.

The ingestion service validates schemas, bounds each batch to 90 intervals/256 KiB, rejects future or overlapping intervals, enforces device-scoped authorization, and records batches atomically. It cannot prove that a credential holder’s claimed foreground observations are authentic. Public registration is throttled but does not provide bot-proof enrollment.

Detailed records expire after 30 days from ingestion. Raw S3 objects include device, calendar path, batch ID, and canonical hash. The hash suffix prevents a conflicting upload from overwriting the accepted raw object. Aggregate caches exclude timelines and expire one year after cache creation; reading them does not extend that expiry. Previously uncomputed dates or timezones cannot be reconstructed after detailed records expire.

Dependencies and fonts are bundled. There are no trackers, analytics SDKs, or third-party runtime font requests.
