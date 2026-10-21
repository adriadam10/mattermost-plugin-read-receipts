# Mattermost Read Receipts plugin

WhatsApp-style read receipts for Mattermost direct and group messages and small channels.

- ✓ sent, ✓✓ grey delivered, ✓✓ blue read, at the bottom right of each of your own messages.
- In group messages and channels the ticks turn blue once **everybody** has read the message.
- "Message info" (post `···` menu, or click the ticks): who read it and when, and who only got it.
- Only the author of a message can see its receipts; the server refuses the status of anybody else's posts.
- A message counts as read when it was on screen while the window had focus, not just because the conversation was opened.
- Users can turn read receipts off in *Settings → Read receipts*. As in WhatsApp this applies to direct messages and works both ways: their reads are not recorded and they do not see anybody else's. Group messages and channels always have receipts.
- Public and private channels get receipts only up to *Max channel members* (System Console → Plugins → Read Receipts, default 25, 0 turns them off, maximum 100). In bigger channels "read by everybody" hardly ever happens and every read would notify all members. The server tells the client which channels to skip, so it stops reporting them.

## How it works

Messages in a conversation arrive in order, so the plugin keeps, per member and
conversation (direct/group message or tracked channel), two watermarks: how far messages have been **delivered** to one of
their clients and how far they have **read**. A message is delivered/read by a
member once the watermark passed its creation time. Each watermark keeps its last
500 advances so the info panel can say *when* each message was reached. Everything
is stored in the plugin KV store; no data is copied out of Mattermost.

- **Delivered**: when the server posts a message, members with a connected client
  (online or away) get it delivered. Web/desktop clients also report delivery when a
  message reaches them over the websocket and, on load, for conversations active in
  the last 14 days.
- **Read**: the webapp watches the posts by others with an `IntersectionObserver`
  and reports those at least 60% visible while the tab is visible and focused.
- Each change is pushed to the other members over the websocket, so ticks turn blue live.

Webapp plugins cannot add a component to every post (the post header slot is hidden
on consecutive posts), so the ticks are placed at the end of the post body from a
`MutationObserver`.

## Limitations

- The native mobile apps do not run webapp plugins: they show no ticks, and reading
  there is not reported as read (only as delivered, while the app is connected).
- Bots and deactivated users are not counted as recipients.

## Build

Only Docker is needed:

```sh
./build.sh
# -> dist/com.github.adriadam10.read-receipts-<version>.tar.gz
```

## CI and releases

- Every push and PR runs the Go and webapp tests and the build; the plugin `.tar.gz` is attached to the run as an artifact.
- Pushing a tag `vX.Y.Z` (matching `version` in `plugin.json`) publishes a GitHub release with the plugin.
- Dependabot checks npm, Go modules and GitHub Actions weekly. Patch/minor updates merge automatically once CI passes. The Mattermost plugin API module is pinned on purpose: it must not get ahead of the oldest supported server.

## Install

```sh
mmctl plugin install-url https://github.com/adriadam10/mattermost-plugin-read-receipts/releases/download/vX.Y.Z/com.github.adriadam10.read-receipts-X.Y.Z.tar.gz
mmctl plugin enable com.github.adriadam10.read-receipts
```

Uploading requires `PluginSettings.EnableUploads = true`.

Tested on Mattermost 11.11.

## License

MIT
