# Running Kinfolk on Ubuntu with Nginx Proxy Manager

This guide runs Kinfolk as a **Dockerised Node.js application** backed by a private MariaDB database. Nginx Proxy Manager (NPM) terminates HTTPS and forwards the public domain to the Kinfolk container through a private Docker network. NPM is designed to proxy web services and manage Let’s Encrypt certificates from its interface, so it is a suitable front door for this layout.[1]

> **Important portability note.** The current Kinfolk repository uses the managed Manus OAuth and file-storage integrations that were injected into the original scaffold. The app will build and serve on your Ubuntu server, and the family database schema will migrate successfully. However, a genuinely independent production deployment needs those two integrations replaced before you expose family data: use an identity provider you control (for example, Authentik, Keycloak, or a conventional email/password implementation) and an S3-compatible object store you control (for example, MinIO, AWS S3, or Backblaze B2). Do **not** copy the managed platform tokens into your server.

| Area | Current repository status | What to do for a private self-hosted production instance |
|---|---|---|
| UI, family tree, chat interface, invitations, governance | Deployable | Deploy as described below. |
| MariaDB family-domain records | Deployable | Run the supplied migrations through the `migrate` container. |
| Session sign-in | Coupled to managed OAuth | Replace the OAuth integration before inviting actual family members. |
| Family photos and documents | Coupled to managed storage proxy | Replace `server/storage.ts` with your preferred S3-compatible implementation. |
| Nostr/private relay | Integration boundary is present; no live relay is configured | Add your relay URL, client-side encryption, and an audited Nostr adapter after the core self-hosted services are portable. |

## 1. Prepare the Server and Domain

Point an `A` record such as `family.example.com` to your Ubuntu server’s public IPv4 address. If you use IPv6, add the matching `AAAA` record. NPM’s own guidance expects ports 80 and 443 to reach the proxy host, with the domain pointing at the server hosting it.[1]

On the Ubuntu server, install Docker Engine and the Docker Compose plugin using Docker’s current official installation instructions. Then permit only SSH, HTTP, and HTTPS at the firewall; keep both the database and NPM’s administrative port off the public internet.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

docker --version
docker compose version
```

If NPM is running as a container, identify its service container name:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

Create one shared proxy network. The Kinfolk application and NPM will both join this network; NPM can then target the application by the Docker service name rather than opening port 3000 publicly. This follows NPM’s documented Docker-network approach for upstream services.[2]

```bash
docker network create proxy
docker network connect proxy YOUR_NPM_CONTAINER_NAME
```

Make the NPM network connection persistent by adding the following to the NPM Compose file and recreating that stack when convenient:

```yaml
networks:
  proxy:
    external: true
    name: proxy
```

Under the NPM `app` service, also add:

```yaml
networks:
  - proxy
```

## 2. Clone Kinfolk and Create Its Environment File

Create an application directory and clone your repository. Keep the environment file outside version control and restrict it to the service account that manages Docker.

```bash
sudo mkdir -p /opt/kinfolk
sudo chown "$USER":"$USER" /opt/kinfolk
git clone https://github.com/MugishaEinstein/kinfolk.git /opt/kinfolk
cd /opt/kinfolk

openssl rand -hex 32
```

If the repository remains private, authenticate the server with a read-only GitHub deploy key or a fine-grained personal access token before running `git clone`. Do not embed an access token in the clone URL or commit it to any project file.

Create `/opt/kinfolk/.env` with the random value generated above in `JWT_SECRET` and a different random hex value for `MYSQL_PASSWORD`.

```dotenv
MYSQL_DATABASE=kinfolk
MYSQL_USER=kinfolk
MYSQL_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_HEX_VALUE
MYSQL_ROOT_PASSWORD=REPLACE_WITH_A_DIFFERENT_LONG_RANDOM_HEX_VALUE

JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_HEX_VALUE

# Set only after you replace the managed OAuth implementation.
# VITE_APP_ID=
# OAUTH_SERVER_URL=
# OWNER_OPEN_ID=

# Set only after you replace the managed file-storage implementation.
# BUILT_IN_FORGE_API_URL=
# BUILT_IN_FORGE_API_KEY=
```

Protect this file and ensure it is never added to Git.

```bash
chmod 600 /opt/kinfolk/.env
printf '.env\n' >> /opt/kinfolk/.git/info/exclude
```

## 3. Add the Docker Files

Create `/opt/kinfolk/Dockerfile`.

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM build AS migrate
CMD ["pnpm", "drizzle-kit", "migrate"]

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Next, create `/opt/kinfolk/compose.yaml`. The `db` service has no published host port and is reachable only from Kinfolk’s internal Docker network. The app exposes port 3000 only to the shared `proxy` network.

```yaml
services:
  db:
    image: mariadb:11.4
    restart: unless-stopped
    env_file: .env
    environment:
      MARIADB_DATABASE: ${MYSQL_DATABASE}
      MARIADB_USER: ${MYSQL_USER}
      MARIADB_PASSWORD: ${MYSQL_PASSWORD}
      MARIADB_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - kinfolk-db:/var/lib/mysql
    networks:
      - internal
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 12

  migrate:
    build:
      context: .
      target: migrate
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - internal
    restart: "no"

  kinfolk:
    build:
      context: .
      target: runtime
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}
    depends_on:
      migrate:
        condition: service_completed_successfully
    expose:
      - "3000"
    networks:
      - internal
      - proxy

volumes:
  kinfolk-db:

networks:
  internal:
    internal: true
  proxy:
    external: true
    name: proxy
```

Start it, inspect the result, and confirm the migrations completed before you configure the proxy host.

```bash
cd /opt/kinfolk
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate
docker compose logs --tail=100 kinfolk
```

The expected steady state is `db` and `kinfolk` running. The one-off `migrate` service should show an exited status of `0` after applying migrations.

## 4. Configure Nginx Proxy Manager

In NPM, create a new **Proxy Host** with the following settings. When both containers are attached to the `proxy` network, `kinfolk` is the correct forward hostname because Docker’s internal DNS resolves the Compose service name.[2]

| NPM field | Value |
|---|---|
| Domain Names | `family.example.com` |
| Scheme | `http` |
| Forward Hostname / IP | `kinfolk` |
| Forward Port | `3000` |
| Cache Assets | Off initially |
| Block Common Exploits | On |
| Websockets Support | On, to keep the future private-relay path compatible |

On the **SSL** tab, select **Request a new SSL Certificate**, enable **Force SSL**, agree to the Let’s Encrypt terms, and save. NPM supports requesting and renewing Let’s Encrypt certificates from the proxy-manager interface.[1]

Do not add restrictive HSTS settings until you have confirmed that HTTPS works correctly for the final domain. On the **Advanced** tab, no custom configuration is required for the current app; NPM already manages standard proxy forwarding. If you later need custom Nginx behavior, NPM supports server-level custom snippets.[2]

## 5. Verify the Deployment

Run the following checks from the Ubuntu server. The container check confirms the service process, while the public check confirms DNS, TLS, NPM routing, and the application itself.

```bash
cd /opt/kinfolk
docker compose ps
docker compose logs --tail=100 kinfolk

curl -I https://family.example.com
curl -sS https://family.example.com/api/trpc/system.health | head
```

Open `https://family.example.com` in a browser. Before you invite people or upload personal records, complete the OAuth and storage portability work described at the beginning of this guide. Treat the running version as a deployment smoke test until then.

## 6. Updates, Backups, and Recovery

Use the following update routine. It fetches your latest GitHub `main`, rebuilds the image, reruns any new database migrations, and replaces only the application containers.

```bash
cd /opt/kinfolk
git pull --ff-only origin main
docker compose up -d --build
docker compose logs --tail=100 migrate
```

Back up the database before every schema change and on a recurring schedule. Store backups outside the server as well.

```bash
cd /opt/kinfolk
mkdir -p backups
set -a
. ./.env
set +a
docker compose exec -T db mariadb-dump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > "backups/kinfolk-$(date +%F-%H%M).sql"
```

To restore a known-good database backup, stop only the application, import the SQL file, then restart the stack. Validate the backup in a non-production environment before relying on it for a family archive.

```bash
cd /opt/kinfolk
set -a
. ./.env
set +a
docker compose stop kinfolk
docker compose exec -T db mariadb -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < backups/kinfolk-YYYY-MM-DD-HHMM.sql
docker compose up -d kinfolk
```

## Troubleshooting

| Symptom | Likely cause | First check |
|---|---|---|
| NPM returns `502 Bad Gateway` | NPM cannot resolve or reach the app container | Confirm both containers are attached to `proxy`; check `docker network inspect proxy`. |
| Certificate request fails | DNS or port forwarding is incomplete | Confirm the domain resolves to the server and ports 80/443 reach NPM.[1] |
| App container exits after startup | Missing environment variable or build failure | Run `docker compose logs kinfolk` and review the first error. |
| Migration service fails | Database is not ready or credentials are wrong | Run `docker compose logs migrate db`; verify the `DATABASE_URL` generated from `.env`. |
| Sign-in or uploads fail after deployment | Managed Manus OAuth/storage remains in the code | Do not work around it with copied tokens; replace those integrations first. |

## References

[1] [Nginx Proxy Manager — Guide](https://nginxproxymanager.com/guide/)

[2] [Nginx Proxy Manager — Advanced Configuration](https://nginxproxymanager.com/advanced-config/)
