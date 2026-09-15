# Activity and recovery semantics

## One foreground app

At 08:00 Discord, 08:15 Spotify, and 08:20 Chrome, the first two intervals contain 15 and 5 minutes. Music playing behind the editor earns no app time. A one-second observed switch remains its own interval.

## A mutable five-minute tail

Before five minutes without input, the foreground app remains provisional active time. At the threshold, the engine removes speculative app intervals after the last input and creates an idle interval at that timestamp. For last input at 08:17 and detection at 08:22, active time ends and idle starts at 08:17. Returning closes idle and starts a new foreground session.

The outbox receives only settled time. Hourly and manual uploads cut intervals at a safe timestamp five minutes behind observation time. Fragments share a logical session ID, so hourly boundaries do not inflate switches or shorten the displayed longest session. Wire fragments are bounded to 24 hours; they are clipped to local calendar boundaries only when querying.

## Sleep, pause, shutdown, and restart

Native sleep and user-session deactivation close the current interval. Wake or session activation resumes observation. Pausing closes recording and persists the preference. Graceful shutdown saves without depending on a network request.

Every observation atomically replaces the private journal with fsync, rename, and directory fsync. A process lock prevents two writers. Restart closes the previous interval at the last saved observation, not the current wall clock. Unknown downtime is excluded. A gap over ten seconds also closes at the last observation, covering missed notifications and process stalls. A corrupt journal fails closed; it is never silently replaced with an empty day.

The journal holds the unsettled tail, completed pending intervals, a stable in-flight batch, device ID, and sync status. It contains no permanent secret. Keychain access failures stop startup unless the item is explicitly absent.

## Upload protocol

The outbox assigns a random 128-bit ID to at most 90 intervals and persists the exact batch before sending. Failure keeps it intact; retries use exponential delays capped at one hour. The normal scheduler remains hourly. Successful acknowledgment removes the batch locally; remaining queued batches then drain in order.

The backend normalizes timestamps, hashes the canonical body, writes a private raw S3 object, and atomically records intervals, receipt, and device watermark in DynamoDB. A conflicting ID or overlapping chronology is rejected. An identical retry succeeds. The last batch hash stays in device metadata so the last acknowledgment can still be recovered after receipt TTL cleanup. Backdated offline uploads are accepted with their original timestamps; cloud retention starts at ingestion.

## Daily calculation

An IANA timezone defines UTC day bounds. The query includes the prior 24 hours because a wire interval can start on the preceding day. Active and idle seconds are clipped to the chosen date. Percentages use active app time as the denominator for top apps, and total recorded time for the summary cards. Neither uses the entire 24-hour wall-clock day.

Switches are assigned to the local day containing the switch timestamp. Checkpoints, pause, wake, and idle returns are not switches. Longest session totals consecutive fragments with the same logical session ID within the selected day. Brief real switches remain separate.
