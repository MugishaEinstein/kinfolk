import { trpc } from "@/lib/trpc";
import { Check, Copy, KeyRound, Send, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "wouter";

function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }

export default function Membership() {
  const utils = trpc.useUtils();
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const dashboard = trpc.family.dashboard.useQuery(undefined, { enabled: Boolean(user) });
  const [token, setToken] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [membershipType, setMembershipType] = useState<"nuclear" | "extended" | "external">("extended");
  const [createdToken, setCreatedToken] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const createInvite = trpc.family.invite.useMutation();
  const acceptInvite = trpc.family.acceptInvitation.useMutation();
  const reviewInvite = trpc.family.reviewInvitation.useMutation();

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!dashboard.data) return;
    try {
      setError(""); setNotice("");
      const result = await createInvite.mutateAsync({ familyId: dashboard.data.family.id, inviteeName, inviteeEmail, membershipType });
      setCreatedToken(result.invitationToken); setInviteeName(""); setInviteeEmail("");
      await utils.family.dashboard.invalidate();
    } catch (caught) { setError(errorText(caught)); }
  }

  async function accept(event: FormEvent) {
    event.preventDefault();
    try {
      setError(""); setNotice("");
      const result = await acceptInvite.mutateAsync({ invitationToken: token.trim() });
      setToken(""); setNotice(`Your request is now awaiting the family council’s acknowledgement for home #${result.familyId}.`);
      await utils.family.dashboard.invalidate();
    } catch (caught) { setError(errorText(caught)); }
  }

  async function review(invitationId: number, decision: "approve" | "reject") {
    if (!dashboard.data) return;
    try {
      setError("");
      const result = await reviewInvite.mutateAsync({ invitationId, familyId: dashboard.data.family.id, decision });
      setNotice(`Response recorded. Current decision: ${result.status.replace("_", " ")}.`);
      await utils.family.dashboard.invalidate();
    } catch (caught) { setError(errorText(caught)); }
  }

  if (isLoading || dashboard.isLoading) return <div className="grid min-h-screen place-items-center bg-[#f5f4ee] text-sm text-[#68766d]">Opening family access…</div>;
  if (!user) return <main className="grid min-h-screen place-items-center bg-[#f5f4ee] p-5 text-center"><div><KeyRound className="mx-auto text-[#5f816b]" /><h1 className="mt-4 font-serif text-3xl text-[#254537]">Passkey access is required.</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-[#23483a] px-4 py-3 text-sm font-bold text-white">Create or use a passkey</Link></div></main>;
  const home = dashboard.data;
  const canReview = home && ["admin", "council"].includes(home.membership.role);

  return <main className="min-h-screen bg-[#f5f4ee] px-5 py-8 text-[#20382e] sm:px-9"><div className="mx-auto max-w-5xl"><Link href="/" className="text-xs font-bold text-[#5a7965] hover:text-[#244a3b]">← Back to Kinfolk</Link><header className="mt-8 max-w-2xl"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#758b7c]">Private membership</p><h1 className="mt-3 font-serif text-5xl tracking-[-.055em]">Bring people in with care.</h1><p className="mt-4 text-sm leading-6 text-[#65766c]">Every person starts with a private code, then the family home applies the membership rules you have chosen.</p></header><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-[1.5rem] border border-[#e3e2d9] bg-[#fffefa] p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#dfeade] text-[#41634d]"><KeyRound size={19} /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#909991]">Join a home</p><h2 className="font-serif text-2xl">Accept your invitation</h2></div></div><form className="mt-6" onSubmit={accept}><label className="block text-xs font-bold text-[#536b5b]">Private invitation code<input required value={token} onChange={event => setToken(event.target.value)} minLength={64} maxLength={64} placeholder="Paste the 64-character code" className="mt-2 w-full rounded-xl border border-[#dedfd6] bg-white px-3 py-3 font-mono text-xs outline-none focus:border-[#63836d]" /></label><button disabled={acceptInvite.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#23483a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" type="submit"><ShieldCheck size={17} />{acceptInvite.isPending ? "Confirming…" : "Request access"}</button></form>{!home ? <p className="mt-5 rounded-xl bg-[#f2f5f0] p-3 text-xs leading-5 text-[#6d7c73]">You are signed in with a passkey. Paste a family invitation to ask to join a private home.</p> : null}</section>{home && canReview ? <section className="rounded-[1.5rem] border border-[#e3e2d9] bg-[#fffefa] p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#f1ded3] text-[#9d604b]"><UserPlus size={19} /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#909991]">Family council</p><h2 className="font-serif text-2xl">Invite someone</h2></div></div><form className="mt-6 grid gap-4" onSubmit={invite}><label className="text-xs font-bold text-[#536b5b]">Name<input required value={inviteeName} onChange={event => setInviteeName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dedfd6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#63836d]" /></label><label className="text-xs font-bold text-[#536b5b]">Email<input required type="email" value={inviteeEmail} onChange={event => setInviteeEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dedfd6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#63836d]" /></label><label className="text-xs font-bold text-[#536b5b]">Membership<select value={membershipType} onChange={event => setMembershipType(event.target.value as typeof membershipType)} className="mt-2 w-full rounded-xl border border-[#dedfd6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#63836d]"><option value="nuclear">Nuclear family</option><option value="extended">Extended family</option><option value="external">Trusted family friend</option></select></label><button disabled={createInvite.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e2ece0] px-4 py-3 text-sm font-bold text-[#2d5440] disabled:opacity-50" type="submit"><Send size={16} />{createInvite.isPending ? "Creating…" : "Create invitation"}</button></form>{createdToken ? <div className="mt-4 rounded-xl border border-[#d6e3d4] bg-[#f3f8f1] p-3"><p className="text-[10px] font-bold text-[#547360]">Share this code privately. It will not be shown again.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-white px-2 py-2 text-[10px] text-[#3e5949]">{createdToken}</code><button type="button" onClick={() => navigator.clipboard.writeText(createdToken)} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[#5c7a66]" aria-label="Copy invitation code"><Copy size={15} /></button></div></div> : null}</section> : <section className="rounded-[1.5rem] border border-[#e3e2d9] bg-[#fffefa] p-6 sm:p-8"><UsersRound className="text-[#6c8872]" /><h2 className="mt-4 font-serif text-2xl">Membership starts with an invitation.</h2><p className="mt-3 text-sm leading-6 text-[#738178]">Ask a family council member to make a private invitation for you. A council member will then review your request.</p></section>}</div>{home && canReview ? <section className="mt-5 rounded-[1.5rem] border border-[#e3e2d9] bg-[#fffefa] p-6 sm:p-8"><div className="flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#909991]">Acknowledgements</p><h2 className="mt-1 font-serif text-2xl">Requests awaiting care</h2></div><ShieldCheck className="text-[#6c8872]" /></div>{home.pendingInvitations.length ? <div className="mt-5 space-y-3">{home.pendingInvitations.map(invitation => <article key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f4f6f1] p-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e9cdbf] font-serif text-xs text-[#664536]">{invitation.inviteeName.slice(0,2).toUpperCase()}</span><span className="min-w-40 flex-1"><b className="block text-sm text-[#40574a]">{invitation.inviteeName}</b><small className="block text-[10px] text-[#849088]">{invitation.membershipType} · {invitation.requiredApprovals} council acknowledgements required</small></span><button onClick={() => review(invitation.id, "approve")} disabled={reviewInvite.isPending} className="inline-flex items-center gap-1 rounded-lg bg-[#dcebd9] px-3 py-2 text-xs font-bold text-[#315842]"><Check size={14} />Acknowledge</button></article>)}</div> : <p className="mt-5 text-sm text-[#77847b]">No membership requests need a response.</p>}</section> : null}{notice ? <p className="mt-5 rounded-xl bg-[#eaf2e8] p-4 text-sm text-[#50735b]">{notice}</p> : null}{error ? <p role="alert" className="mt-5 rounded-xl bg-[#fff0ec] p-4 text-sm text-[#9b4d3a]">{error}</p> : null}</div></main>;
}
