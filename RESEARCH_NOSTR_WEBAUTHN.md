# Implementation References: Nostr Private Relay and Passkeys

Kinfolk’s live relay layer will use **NIP-01** event envelopes and relay messages (`EVENT`, `REQ`, `CLOSE`), including signed event IDs, event signatures, and relay acknowledgement handling. NIP-01 describes relays as WebSocket endpoints and specifies the relevant client/relay frames.[1]

The membership gate should use a private relay whitelist alongside **NIP-42** authenticated client connections. NIP-42 uses a signed, ephemeral event of kind `22242`, containing `relay` and `challenge` tags; relays must validate the recent challenge and relay URL before accepting the authenticated connection.[2]

Family message content should use **NIP-44 v2** payloads only after validating the outer Nostr event’s identity and signature. NIP-44 documents that payload-only encryption does not hide relay-visible IP addresses, timestamps, and some message-size characteristics; it also does not carry attachments. Attachments therefore remain in the application’s protected object-storage path, with metadata referenced in message content.[3]

The selected client implementation is `nostr-tools`, whose maintained documentation covers key generation, event finalization/verification, relay pools, Node WebSocket configuration, and NIP-42 flows.[4]

Kinfolk sign-in should use WebAuthn passkeys. Fingerprints or facial recognition are authorization gestures performed by the device authenticator. The Kinfolk server stores only a credential public key, credential ID, counter, and related public metadata—not biometric data or a passkey private key. The authentication server must issue a single-use challenge, enforce the registered RP ID/origin, require user verification, and update the signature counter to detect replay/cloning anomalies.[5] [6]

## References

[1] [NIP-01: Basic protocol flow description](https://nips.nostr.com/01)

[2] [NIP-42: Authentication of clients to relays](https://nips.nostr.com/42)

[3] [NIP-44: Encrypted payloads](https://nips.nostr.com/44)

[4] [nostr-tools project documentation](https://github.com/nbd-wtf/nostr-tools)

[5] [W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)

[6] [MDN: Passkeys](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys)
