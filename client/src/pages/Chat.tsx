import { trpc } from "@/lib/trpc";
import { ChevronLeft, LockKeyhole, MessageCircle, Paperclip, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "wouter";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Unable to send the message.";
}

export default function Chat() {
  const utils = trpc.useUtils();
  const { data: user, isLoading: userLoading } = trpc.auth.me.useQuery();
  const family = trpc.family.dashboard.useQuery(undefined, { enabled: Boolean(user) });
  const [roomId, setRoomId] = useState<number>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [attachmentNote, setAttachmentNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!roomId && family.data?.rooms[0]) setRoomId(family.data.rooms[0].id);
  }, [roomId, family.data?.rooms]);

  const roomMessages = trpc.family.roomMessages.useQuery(
    { familyId: family.data?.family.id ?? 0, roomId: roomId ?? 0 },
    { enabled: Boolean(family.data && roomId) },
  );
  const sendMessage = trpc.family.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      await roomMessages.refetch();
      await utils.family.dashboard.invalidate();
    },
  });
  const syncRelay = trpc.family.syncRoomFromRelay.useMutation({
    onSuccess: async () => { await roomMessages.refetch(); },
  });
  const storeAttachment = trpc.family.storeAttachment.useMutation();

  useEffect(() => {
    if (!family.data || !roomId) return;
    void syncRelay.mutateAsync({ familyId: family.data.family.id, roomId }).catch(() => undefined);
  }, [family.data?.family.id, roomId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const home = family.data;
    if (!home || !roomId || !draft.trim()) return;
    try {
      setError("");
      await sendMessage.mutateAsync({ familyId: home.family.id, roomId, content: draft.trim() });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function syncCurrentRoom() {
    const home = family.data;
    if (!home || !roomId) return;
    try {
      setError("");
      await syncRelay.mutateAsync({ familyId: home.family.id, roomId });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function attachFile(event: ChangeEvent<HTMLInputElement>) {
    const home = family.data;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!home || !file) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 6 * 1024 * 1024) {
      setError("Choose a JPG, PNG, WEBP, or PDF smaller than 6 MB.");
      return;
    }
    try {
      setError("");
      setAttachmentNote(`Preserving ${file.name}…`);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read this file."));
        reader.readAsDataURL(file);
      });
      await storeAttachment.mutateAsync({ familyId: home.family.id, fileName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf", base64, targetType: "family", targetId: home.family.id });
      setAttachmentNote(`${file.name} is preserved in the family home.`);
    } catch (caught) {
      setAttachmentNote("");
      setError(errorText(caught));
    }
  }

  if (userLoading || family.isLoading) {
    return <div className="grid min-h-screen place-items-center bg-[#f5f4ee] text-sm text-[#68766d]">Opening private conversations…</div>;
  }
  const home = family.data;
  if (!user || !home) {
    return <main className="grid min-h-screen place-items-center bg-[#f5f4ee] p-5 text-center text-[#52685b]"><div><LockKeyhole className="mx-auto mb-4" /><h1 className="font-serif text-3xl">Your family home is private.</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-[#23483a] px-4 py-3 text-sm font-bold text-white">Return to Kinfolk</Link></div></main>;
  }
  const activeRoom = home.rooms.find(room => room.id === roomId);
  const membershipId = home.membership.id;

  return <main className="min-h-screen bg-[#f5f4ee] p-4 text-[#20382e] sm:p-7">
    <section className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[1.75rem] border border-[#e1e1d8] bg-[#fffefa] shadow-[0_18px_55px_rgba(39,67,51,.07)] md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[#e7e7df] bg-[#fafaf6] p-4 md:border-b-0 md:border-r">
        <Link href="/" className="inline-flex items-center gap-1 text-xs font-bold text-[#66806e] hover:text-[#244a3b]"><ChevronLeft size={15} /> {home.family.name}</Link>
        <div className="mt-7 flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#8b958d]">Family rooms</p><MessageCircle size={17} className="text-[#698574]" /></div>
        <div className="mt-3 flex gap-2 overflow-x-auto md:block md:space-y-1">{home.rooms.map(room => <button key={room.id} onClick={() => setRoomId(room.id)} className={`min-w-max rounded-xl px-3 py-2 text-left text-xs font-bold transition md:flex md:w-full md:items-center md:gap-2 ${room.id === roomId ? "bg-[#e2ede0] text-[#254b3b]" : "text-[#758078] hover:bg-[#eef1eb]"}`}><span className="mr-1 inline-block text-[#78907c] md:mr-0">{room.accessLevel === "family" ? "#" : <LockKeyhole size={12} className="inline" />}</span>{room.name}</button>)}</div>
        <div className="mt-8 hidden rounded-xl bg-[#eaf1e8] p-3 text-[10px] leading-4 text-[#587363] md:block"><ShieldCheck size={14} className="mb-1" />Messages are encrypted before storage and signed before relay delivery.</div>
      </aside>
      <section className="flex min-h-[650px] min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-[#ebebe4] px-5 py-4 sm:px-7"><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#8e968f]">Private conversation</p><h1 className="mt-1 font-serif text-2xl tracking-[-.04em]">{activeRoom?.name ?? "Select a room"}</h1></div><div className="flex items-center gap-2"><button type="button" onClick={syncCurrentRoom} disabled={syncRelay.isPending || !roomId} className="grid h-8 w-8 place-items-center rounded-lg text-[#5a7964] hover:bg-[#edf3eb] disabled:opacity-40" aria-label="Synchronize with private relay"><RefreshCw size={15} className={syncRelay.isPending ? "animate-spin" : ""} /></button><span className="inline-flex items-center gap-2 rounded-lg bg-[#edf3eb] px-3 py-2 text-[10px] font-bold text-[#557565]"><LockKeyhole size={13} /> {syncRelay.isPending ? "Syncing" : "Private relay"}</span></div></header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-7">
          {roomMessages.isLoading ? <p className="text-xs text-[#8b958d]">Loading private messages…</p> : null}
          {roomMessages.data?.length === 0 ? <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-[#d5ddd4] bg-[#fafcf8] p-7 text-center"><div><MessageCircle className="mx-auto text-[#75917b]" size={25} /><h2 className="mt-3 font-serif text-xl">This room is ready.</h2><p className="mt-2 max-w-xs text-xs leading-5 text-[#7b877e]">Begin the conversation. Your message will be encrypted in Kinfolk, stored in your family database, and signed for the configured private relay.</p></div></div> : null}
          {roomMessages.data?.map(message => <article key={message.id} className={`flex max-w-[88%] gap-3 ${message.authorMemberId === membershipId ? "ml-auto flex-row-reverse" : ""}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#bfd4bf] font-serif text-[10px] text-[#2f513d]">{message.authorName.slice(0, 2).toUpperCase()}</span><div className={`rounded-2xl px-4 py-3 ${message.authorMemberId === membershipId ? "rounded-tr-sm bg-[#dcebd9]" : "rounded-tl-sm bg-[#f0f2ed]"}`}><div className="mb-1 flex gap-2 text-[10px] text-[#819087]"><b className="text-[#4c6355]">{message.authorName}</b><span>{new Date(message.sentAt).toLocaleString()}</span><span className={message.relayStatus === "published" ? "text-[#5f8968]" : "text-[#ad7a57]"}>{message.relayStatus === "published" ? "signed" : message.relayStatus}</span></div><p className="text-sm leading-6 text-[#334a3c]">{message.content}</p></div></article>)}
        </div>
        <form onSubmit={submit} className="border-t border-[#ebebe4] p-4 sm:p-5"><div className="flex items-center gap-3 rounded-2xl border border-[#dce1d9] bg-white px-4 py-2"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={attachFile} /><button type="button" onClick={() => fileInput.current?.click()} disabled={storeAttachment.isPending} className="grid h-9 w-9 place-items-center rounded-xl text-[#71877a] hover:bg-[#edf2ea] disabled:opacity-40" aria-label="Attach a family photo or document"><Paperclip size={17} /></button><input value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${activeRoom?.name ?? "this room"}`} disabled={!roomId || sendMessage.isPending} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[#a0a8a1]" aria-label="Private message" /><button type="submit" disabled={!draft.trim() || sendMessage.isPending || !roomId} className="grid h-9 w-9 place-items-center rounded-xl bg-[#23483a] text-white disabled:opacity-40" aria-label="Send encrypted message"><Send size={16} /></button></div>{attachmentNote ? <p className="mt-2 text-xs text-[#5d7c67]">{attachmentNote}</p> : null}{error ? <p role="alert" className="mt-2 text-xs text-[#a04f3c]">{error}</p> : null}</form>
      </section>
    </section>
  </main>;
}
