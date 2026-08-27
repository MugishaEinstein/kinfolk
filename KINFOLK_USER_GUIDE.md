# Kinfolk Page Guide

Kinfolk is a private family home. Every person uses their own device passkey, and family conversations are stored as encrypted content before they are published to the configured private Nostr relay.

> **Use the exact page addresses below until a visible global navigation menu is added to the signed-in dashboard.** Replace the hostname with your live host, `chat.nostr.africa`.

| Page | Address | Who uses it | Main purpose |
|---|---|---|---|
| Private access | `https://chat.nostr.africa/` | Everyone | Create or use a device passkey, then enter Kinfolk. |
| Family home | `https://chat.nostr.africa/` | Signed-in active members | View the family overview, member list, private-relay status, decisions, and activity. |
| Membership | `https://chat.nostr.africa/membership` | New invitees and family council members | Create invitations, accept an invitation code, and acknowledge pending membership requests. |
| Private chat | `https://chat.nostr.africa/chat` | Signed-in active members | Choose a family room, read real stored messages, synchronize with the private relay, send encrypted messages, and attach family files. |

## 1. Private Access — `/`

This is the first page every person sees. Select **Create access** only when you are registering a new account on a personal device. Enter your name, and optionally your email for invitation matching, then select **Create passkey access**. Your browser or device will ask you to authenticate with a fingerprint, face recognition, device PIN, or physical security key.

Kinfolk does **not** receive or store fingerprint images or biometric templates. It receives a cryptographic proof from your device.

After registration, use **Sign in with a passkey** whenever you return. Family members should not share one passkey; each person should create their own.

### First-time family administrator setup

The first signed-in user who does not yet belong to a family is shown the **Create private family home** form. Enter a home name such as *The Okello home*, optionally add a short description, and select **Create private family home**. You become the initial family administrator.

## 2. Family Home — `/`

The family home is the signed-in overview. It is intentionally quiet: it shows only information belonging to your private family space.

| Area | How to use it |
|---|---|
| **Family tree** | View active members. As people are invited and approved, they appear as real member records in the home. |
| **Private relay connection** | Check whether the private Nostr relay has been deployed. It shows *Awaiting private relay deployment* until `wss://relay.nostr.africa` is running. |
| **Family council** | See how many governance decisions require attention. Use the membership page to approve people; governance decision controls will appear as your family creates proposals. |
| **Home activity** | Review timestamped real activity such as home creation, invitations, approvals, and messages. |
| **Sign out** | Use the arrow icon in the top-right corner when you finish on a shared device. |

## 3. Membership — `/membership`

This is where people are brought into the family home. It supports both sides of the membership process.

### Invite your wife or children

You must be a family administrator or council member.

1. Open `/membership`.
2. Under **Invite someone**, enter their name and email.
3. Choose **Nuclear family** for a wife or child. Use **Extended family** for relatives and **Trusted family friend** for a non-relative.
4. Select **Create invitation**.
5. Copy the displayed private code and share it privately. The code is shown once, so save it until the person accepts it.

### Accept an invitation

1. The invited person first creates their own passkey at `/`.
2. They open `/membership`.
3. Under **Accept your invitation**, they paste the private invitation code and select **Request access**.
4. A family council member returns to the same page and selects **Acknowledge** beside the pending request.

Once the required number of acknowledgements is reached, the new member becomes active. They can then use the family home and private chat.

> The current version creates an invitation code for private sharing. It does not automatically email the code; do not send it in a public group or on social media.

## 4. Private Chat — `/chat`

Only signed-in, active family members can use the chat page. If you see **“Your family home is private”**, sign in with your passkey first and make sure your membership was approved.

### Choose a room

Use the **Family rooms** list on the left. Select a room such as *Family general*, *Nuclear family*, or *Announcements*. Each room has its own access boundary. A lock icon indicates a restricted room.

### Read and synchronize messages

Messages visible in the conversation are loaded from your private Kinfolk database. Select the **circular refresh icon** next to **Private relay** to perform a user-triggered synchronization with `wss://relay.nostr.africa`. This reads eligible signed relay events, verifies their signature, and avoids storing duplicate relay events.

The relay button is intentional: it does not run a silent background timer. You decide when the application contacts the private relay.

### Send a message

1. Open the correct room.
2. Type into the **Private message** field.
3. Select the dark-green **Send** button.

Kinfolk encrypts the message before storing it in the database. It then signs and publishes the encrypted event through its private relay publisher. Each message displays a status:

| Status | Meaning |
|---|---|
| **signed** | The relay accepted the signed encrypted event. |
| **queued** | The message is stored privately but relay delivery is pending. |
| **failed** | The message is safely stored, but the private relay did not accept it. Use the relay sync button after checking the deployment. |

### Attach a family photo or document

Select the **paperclip** beside the message field. You can add a JPG, PNG, WEBP, or PDF smaller than 6 MB. Kinfolk preserves the file through the configured S3-compatible storage service and saves only its secure metadata with your family record.

## Recommended First-Day Sequence

1. The family administrator creates the private home at `/`.
2. The administrator deploys the app, MinIO storage, and the private Nostr relay following `DEPLOY_LIVE_NOSTR.md`.
3. The administrator creates private invitation codes at `/membership`.
4. Each family member creates their own passkey and accepts their invitation.
5. A council member acknowledges every request.
6. Members open `/chat`, select **Synchronize with private relay**, and begin the first conversation.

## Quick Troubleshooting

| Problem | What to check |
|---|---|
| Passkey prompt does not appear | Use a current browser over HTTPS, with a device screen lock enabled. |
| A person cannot open chat | Confirm that they created their own passkey and their membership request is approved. |
| A message says `failed` | Confirm the `relay.nostr.africa` NPM proxy host, TLS certificate, relay container, and `KINFOLK_NOSTR_SECRET_KEY` configuration. |
| A file will not attach | Confirm the file type and 6 MB limit, then verify the MinIO `files.nostr.africa` proxy configuration. |
| An invitation code is lost | Create a new invitation. Treat the lost code as invalid and do not attempt to recover it from the interface. |
