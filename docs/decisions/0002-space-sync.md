# 0002: Live updates come through a space sync service

Status: proposed (2026-11-19). Based on [Space sync](https://atproto.com/blog/space-sync); method
names, credential lifetimes and cursor format weren't published yet when this was written.

## What the protocol gives us

Space records don't go through relays. A **sync service**, a backend that can be self-hosted next
to an app, follows spaces and exposes them as a Jetstream that's compatible with existing clients,
in `spaces` mode. Events carry the full record, the `space` it is in, and its author. Clients can
replay from a cursor, then go live.

The service has no account. To read a space it asks a user who already has read access for a
short-lived delegation, then trades that with the space's authority (the issuer's PDS) for a
credential. If that user loses access, it needs another reader or it stops following the space.
The stream is for backends, and the app decides what each viewer may see.

## How Kinship uses it (Journey B)

```
issuer's PDS ──signed write notice──▶ Kinship sync service ──Jetstream (spaces)──▶ Kinship notifier
 (space authority)                      (follows every space a                     │ looks up which recipients'
                                         Kinship recipient can read)                │ devices hold that space
                                                                                    ▼
                                         recipient device ◀── silent push "space S changed"
                                         pulls S with its own credential, patches op-sqlite + OS Contacts
```

- **Recipients supply the read access.** A Kinship user who subscribes to a contact's spaces grants the
  sync service delegations for them at sign-in (an OAuth scope on `app.kinship.space.channel` and
  `app.kinship.space.context`). Any one recipient per space is enough.
- **Pushes carry no contact data.** A silent push only says which space changed. APNs and FCM would
  otherwise see phone numbers and addresses, and Apple limits payloads to 4 KB anyway. The device
  fetches the record itself, which also handles iOS background throttling: if the push is
  dropped, the next app open pulls.
- **The service keeps no records.** It stores its cursor and a `space → recipient devices` index,
  and drops record bodies once the push is sent. It does **see** channel records in plaintext while
  they pass through. That's a change to the PRD's threat model: "the broker holds no PII at rest",
  not "Kinship never sees PII". Channel spaces are access-controlled, not encrypted (PRD § 1), so
  this matches the protocol's own model. The vault is still never followed: it's encrypted, and it
  has no readers besides its owner.

## Hosting

A Jetstream consumer is a long-lived outbound websocket. On Cloudflare that's a Durable Object (it
holds the socket and the cursor, with alarms to reconnect); otherwise it's a small container. The
sync service itself can be run for us or self-hosted, so pick whichever the SDK supports first.
Not built: it waits on the SDK and the published endpoints.
