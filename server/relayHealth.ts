export type RelayHealth = {
  status: "online" | "offline" | "misconfigured";
  relayUrl: string | null;
  checkedAt: string;
  name?: string;
  software?: string;
  detail: string;
};

function relayInformationUrl(relayUrl: string) {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.toString();
}

export async function getRelayHealth(relayUrl = process.env.VITE_NOSTR_RELAY_URL): Promise<RelayHealth> {
  const checkedAt = new Date().toISOString();
  if (!relayUrl?.startsWith("wss://")) {
    return { status: "misconfigured", relayUrl: relayUrl ?? null, checkedAt, detail: "A secure wss:// relay URL has not been configured." };
  }

  try {
    const response = await fetch(relayInformationUrl(relayUrl), {
      headers: { Accept: "application/nostr+json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return { status: "offline", relayUrl, checkedAt, detail: `Relay metadata returned HTTP ${response.status}.` };
    }
    const metadata = await response.json() as { id?: string; name?: string; software?: string };
    if (metadata.id && metadata.id.replace(/\/$/, "") !== relayUrl.replace(/\/$/, "")) {
      return { status: "offline", relayUrl, checkedAt, detail: "Relay metadata does not match the configured endpoint." };
    }
    return { status: "online", relayUrl, checkedAt, name: metadata.name, software: metadata.software, detail: "Private relay is reachable and returned Nostr metadata." };
  } catch {
    return { status: "offline", relayUrl, checkedAt, detail: "The private relay could not be reached from Kinfolk." };
  }
}
