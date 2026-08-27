# Live Kinfolk + Private Nostr Relay Deployment

This package runs two public hostnames through Nginx Proxy Manager (NPM): the private family application at `https://chat.nostr.africa` and the Nostr WebSocket relay at `wss://relay.nostr.africa`.

> This is a **private deployment**, not a public relay. The relay accepts only events signed by Kinfolk’s configured server publisher key and requires NIP-42 relay authentication. Kinfolk additionally verifies family membership before it asks the publisher to sign or send any event.

## Required DNS and NPM Hosts

| Hostname | DNS record | NPM forward host | NPM forward port | Required NPM options |
|---|---|---|---:|---|
| `chat.nostr.africa` | `A` → your Ubuntu server IPv4 | `kinfolk` | `3000` | Block Common Exploits, Force SSL |
| `relay.nostr.africa` | `A` → the same Ubuntu server IPv4 | `nostr-relay` | `8080` | Websockets Support, Block Common Exploits, Force SSL |
| `files.nostr.africa` | `A` → the same Ubuntu server IPv4 | `minio` | `9000` | Block Common Exploits, Force SSL |

For all three hosts, request a new Let’s Encrypt certificate in NPM. On the `relay.nostr.africa` proxy host, enable **Websockets Support**. This passes the `Upgrade` and `Connection` headers required by the relay’s WebSocket protocol.[1]

On the `relay.nostr.africa` proxy host only, add the following in NPM’s **Advanced** tab so a quiet long-lived subscription is not closed by the proxy:

```nginx
proxy_read_timeout 1d;
proxy_send_timeout 1d;
```

## Server Setup

```bash
sudo mkdir -p /opt/kinfolk
sudo chown "$USER":"$USER" /opt/kinfolk
git clone https://github.com/MugishaEinstein/kinfolk.git /opt/kinfolk
cd /opt/kinfolk

# Make NPM and Kinfolk’s web/relay containers discoverable to each other.
docker network create proxy
docker network connect proxy YOUR_NGINX_PROXY_MANAGER_CONTAINER

cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

Populate `deploy/.env.production` with fresh server-side values. Do not reuse a personal Nostr key. The message encryption key must be generated with `openssl rand -base64 32` and retained in an encrypted password manager or a server secret vault. Loss of this key makes stored messages unrecoverable. MinIO is Kinfolk’s self-hosted S3-compatible object store: use a long random password, keep its console on an internal port, and do not publish port `9001` through NPM.

## Relay Publisher Key

The `deploy/relay/config.toml` whitelist contains the current Kinfolk publisher public key:

```text
d8924e4f4b1ae75b1704f97937aff09fdf6dc6393f16073dfbe8762a6ed7739b
```

If you set a **different** `KINFOLK_NOSTR_SECRET_KEY` on the Ubuntu server, derive its matching public key before first start and replace the whitelist entry in `deploy/relay/config.toml`.

```bash
cd /opt/kinfolk
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml run --rm kinfolk node scripts/relay-pubkey.mjs
```

## Start and Verify

```bash
cd /opt/kinfolk
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up -d --build
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml ps
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml logs --tail=100 migrate kinfolk nostr-relay

curl -I https://chat.nostr.africa
curl -H 'Accept: application/nostr+json' https://relay.nostr.africa
```

The app’s relay status becomes `published` when a real message is accepted by `wss://relay.nostr.africa`; a `failed` status means it was saved encrypted in the database but was not accepted by the relay. Do not treat a successful HTTPS health check as proof that the WebSocket relay is operating—send a real message from `/chat` after registering a passkey and creating a family home.

## Security Notes

Passkeys are scoped to `chat.nostr.africa`; device biometric information is never sent to the server. The server stores passkey public credentials and challenges only.[2]

Kinfolk signs Nostr envelopes with its dedicated service key and uses NIP-42 to authenticate that publisher to the relay. The event body is encrypted before both MySQL persistence and relay publication. The relay stores the resulting ciphertext, not readable message text.[3] [4]

## Updating

```bash
cd /opt/kinfolk
git pull --ff-only origin main
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up -d --build
```

Back up both the MariaDB volume and the `nostr-relay-data` volume before changing migrations, rotating keys, or updating relay software.

## References

[1] [nostr-rs-relay reverse proxy guidance](https://github.com/scsibug/nostr-rs-relay/blob/master/docs/reverse-proxy.md)

[2] [W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)

[3] [NIP-01: Basic protocol flow description](https://nips.nostr.com/01)

[4] [NIP-42: Authentication of clients to relays](https://nips.nostr.com/42)
