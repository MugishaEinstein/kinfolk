import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Heart,
  House,
  LockKeyhole,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  Scale,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TreePine,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type View = "home" | "tree" | "messages" | "governance";
type Member = {
  id: string;
  name: string;
  initials: string;
  relationship: string;
  detail: string;
  tone: "sage" | "clay" | "rose" | "lavender" | "sand" | "ink";
  online?: boolean;
};

type FamilyMessage = {
  id: number;
  author: string;
  initials: string;
  text: string;
  time: string;
  tone: Member["tone"];
  mine?: boolean;
};

const members: Member[] = [
  { id: "mara", name: "Mara Calder", initials: "MC", relationship: "Grandmother", detail: "Family historian · 76", tone: "rose" },
  { id: "samuel", name: "Samuel Calder", initials: "SC", relationship: "Grandfather", detail: "Garden keeper · 78", tone: "ink" },
  { id: "june", name: "June Calder", initials: "JC", relationship: "Parent · Council", detail: "Home steward · 49", tone: "sage", online: true },
  { id: "arthur", name: "Arthur Calder", initials: "AC", relationship: "Parent · Council", detail: "Family archivist · 51", tone: "clay", online: true },
  { id: "elise", name: "Elise Calder", initials: "EC", relationship: "Child", detail: "Lives in Copenhagen · 24", tone: "lavender", online: true },
  { id: "noah", name: "Noah Calder", initials: "NC", relationship: "Child", detail: "Student · 20", tone: "sand" },
  { id: "lina", name: "Lina Voss", initials: "LV", relationship: "Partner", detail: "Joined the home in 2024", tone: "rose" },
  { id: "otto", name: "Otto Voss", initials: "OV", relationship: "Grandchild", detail: "Curious explorer · 4", tone: "sage" },
];

const rooms = [
  { id: "general", name: "Family general", preview: "The guest room is ready.", time: "9:42", unread: 2, kind: "general" },
  { id: "nuclear", name: "Nuclear family", preview: "June: I can collect the photos.", time: "9:12", unread: 0, kind: "nuclear" },
  { id: "weekend", name: "Weekend supper", preview: "Arthur added a note", time: "Yesterday", unread: 0, kind: "custom" },
  { id: "archive", name: "Family archive", preview: "Mara shared a document", time: "Mon", unread: 0, kind: "custom" },
];

const initialMessages: FamilyMessage[] = [
  { id: 1, author: "Arthur", initials: "AC", text: "The guest room is ready for Saturday. I added the old photo albums to the sideboard.", time: "09:24", tone: "clay" },
  { id: 2, author: "June", initials: "JC", text: "Lovely. I’ll bring the apple cake — the one Mara taught me to make.", time: "09:31", tone: "sage" },
  { id: 3, author: "Elise", initials: "EC", text: "I’ll be there by noon. Could someone save me a seat near the window?", time: "09:42", tone: "lavender", mine: true },
];

const nav = [
  { id: "home" as const, label: "Home", icon: House },
  { id: "tree" as const, label: "Family tree", icon: TreePine },
  { id: "messages" as const, label: "Messages", icon: MessageCircle },
  { id: "governance" as const, label: "Decisions", icon: Scale },
];

function Monogram({ initials, tone, size = "md" }: { initials: string; tone: Member["tone"]; size?: "sm" | "md" | "lg" }) {
  return <span className={`monogram monogram-${tone} monogram-${size}`}>{initials}</span>;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function TreeCanvas({ selectedMember, onSelect }: { selectedMember: Member; onSelect: (member: Member) => void }) {
  const findMember = (id: string) => members.find(member => member.id === id)!;
  const node = (id: string, className: string) => {
    const member = findMember(id);
    return (
      <button key={id} className={`tree-node ${className} ${selectedMember.id === id ? "is-selected" : ""}`} onClick={() => onSelect(member)}>
        <Monogram initials={member.initials} tone={member.tone} />
        <span className="tree-node-name">{member.name.split(" ")[0]}</span>
        {member.online ? <i className="online-dot" aria-label="Online" /> : null}
      </button>
    );
  };

  return (
    <div className="tree-canvas" aria-label="Interactive Calder family tree">
      <svg className="tree-lines" viewBox="0 0 960 420" preserveAspectRatio="none" aria-hidden="true">
        <path d="M170 95 H365 M300 95 V155 M170 95 V155 M365 95 V155" />
        <path d="M300 218 V260 M300 260 H555 M555 260 V310 M300 260 V310" />
        <path d="M555 355 V390" />
        <path d="M620 218 H785 M700 218 V310" />
      </svg>
      {node("mara", "node-mara")}
      {node("samuel", "node-samuel")}
      {node("june", "node-june")}
      {node("arthur", "node-arthur")}
      {node("elise", "node-elise")}
      {node("noah", "node-noah")}
      {node("lina", "node-lina")}
      {node("otto", "node-otto")}
      <span className="tree-branch-label label-first">First branch</span>
      <span className="tree-branch-label label-now">Today</span>
    </div>
  );
}

function FamilyTreePanel({ selectedMember, onSelect }: { selectedMember: Member; onSelect: (member: Member) => void }) {
  return (
    <section className="tree-panel surface-card">
      <SectionHeading eyebrow="The Calder home" title="Our family tree" action={<button className="text-action"><Search size={15} /> Find a person</button>} />
      <div className="tree-layout">
        <TreeCanvas selectedMember={selectedMember} onSelect={onSelect} />
        <aside className="member-detail">
          <div className="member-detail-top">
            <Monogram initials={selectedMember.initials} tone={selectedMember.tone} size="lg" />
            <span className="quiet-status">{selectedMember.online ? "Here now" : "Family member"}</span>
          </div>
          <h3>{selectedMember.name}</h3>
          <p className="member-role">{selectedMember.relationship}</p>
          <p className="member-meta">{selectedMember.detail}</p>
          <div className="member-actions">
            <button className="small-action"><MessageCircle size={15} /> Message</button>
            <button className="small-action"><FileText size={15} /> Profile</button>
          </div>
          <p className="detail-footnote"><Heart size={13} fill="currentColor" /> Connected in the Calder home</p>
        </aside>
      </div>
    </section>
  );
}

function MessagesPanel({ activeRoom, setActiveRoom }: { activeRoom: string; setActiveRoom: (room: string) => void }) {
  const [messages, setMessages] = useState<FamilyMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const activeRoomData = rooms.find(room => room.id === activeRoom) ?? rooms[0];

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setMessages(current => [...current, {
      id: Date.now(), author: "You", initials: "YO", text: trimmed, time: "Now", tone: "lavender", mine: true,
    }]);
    setDraft("");
  }

  return (
    <section className="messages-panel surface-card">
      <div className="rooms-rail">
        <div className="rail-heading"><span>Conversations</span><button aria-label="Create a room"><Plus size={16} /></button></div>
        <div className="room-list">
          {rooms.map(room => (
            <button key={room.id} className={`room-item ${room.id === activeRoom ? "active" : ""}`} onClick={() => setActiveRoom(room.id)}>
              <span className={`room-mark ${room.kind === "nuclear" ? "locked" : ""}`}>{room.kind === "nuclear" ? <LockKeyhole size={13} /> : "#"}</span>
              <span className="room-copy"><b>{room.name}</b><small>{room.preview}</small></span>
              <span className="room-meta"><small>{room.time}</small>{room.unread ? <i>{room.unread}</i> : null}</span>
            </button>
          ))}
        </div>
        <div className="secure-rail-note"><LockKeyhole size={14} /><span>Private home relay<br />Encrypted at the boundary</span></div>
      </div>
      <div className="message-thread">
        <header className="conversation-header">
          <div><p className="eyebrow">Private room</p><h3>{activeRoomData.name}</h3></div>
          <div className="conversation-members"><span className="tiny-stack"><Monogram initials="JC" tone="sage" size="sm" /><Monogram initials="AC" tone="clay" size="sm" /><Monogram initials="EC" tone="lavender" size="sm" /></span><button aria-label="Room options"><MoreHorizontal size={20} /></button></div>
        </header>
        <div className="security-strip"><ShieldCheck size={15} /><span>Messages are stored as encrypted content and ready for your private relay.</span></div>
        <div className="message-list">
          {messages.map(message => (
            <div className={`message-row ${message.mine ? "mine" : ""}`} key={message.id}>
              {!message.mine ? <Monogram initials={message.initials} tone={message.tone} size="sm" /> : null}
              <div className="message-bubble"><div className="message-info"><b>{message.author}</b><span>{message.time}</span></div><p>{message.text}</p></div>
            </div>
          ))}
        </div>
        <form className="message-composer" onSubmit={sendMessage}>
          <button type="button" aria-label="Attach a family file"><Paperclip size={19} /></button>
          <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${activeRoomData.name.toLowerCase()}`} aria-label="Message draft" />
          <button className="send-button" type="submit" aria-label="Send encrypted message"><Send size={17} /></button>
        </form>
      </div>
    </section>
  );
}

function InvitationCard({ onReview }: { onReview: () => void }) {
  return (
    <section className="invitation-card surface-card">
      <div className="card-topline"><span className="icon-disc clay"><UserRoundPlus size={18} /></span><span className="count-pill">1 awaiting your care</span></div>
      <h3>A new member would like to join</h3>
      <p>Marin Torres was invited by June as a trusted family friend.</p>
      <div className="invite-person"><Monogram initials="MT" tone="sand" /><span><b>Marin Torres</b><small>Family friend · Invited today</small></span></div>
      <div className="approval-track"><span><Check size={13} /> June approved</span><span className="approval-empty">1 more council acknowledgement</span></div>
      <button className="wide-button" onClick={onReview}>Review invitation <ArrowUpRight size={16} /></button>
    </section>
  );
}

function GovernancePanel({ compact = false, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  return (
    <section className={`governance-panel surface-card ${compact ? "compact" : ""}`}>
      <SectionHeading eyebrow="Family council" title={compact ? "One decision needs you" : "Shared decisions"} action={compact ? <button className="text-action" onClick={onOpen}>View all <ArrowUpRight size={14} /></button> : <span className="subtle-label">Transparent by design</span>} />
      <div className="proposal-card">
        <div className="proposal-copy"><span className="proposal-tag">Membership</span><h3>Welcome Marin into the Calder home</h3><p>Marin has accepted June’s invitation. Council acknowledgement confirms appropriate access.</p></div>
        <div className="proposal-status"><span>2 of 3</span><small>acknowledged</small></div>
      </div>
      <div className="vote-line"><span className="tiny-stack"><Monogram initials="JC" tone="sage" size="sm" /><Monogram initials="AC" tone="clay" size="sm" /><span className="empty-avatar">?</span></span><span>Arthur, your acknowledgement is needed.</span>{!compact ? <button className="ack-button">Acknowledge <Check size={15} /></button> : null}</div>
      {!compact ? <div className="governance-history"><span><Check size={14} /> June added an acknowledgement</span><span><FileText size={14} /> Family guide updated yesterday</span><span><CalendarDays size={14} /> Decision closes in 3 days</span></div> : null}
    </section>
  );
}

function HomeOverview({ onNavigate, onReviewInvite }: { onNavigate: (view: View) => void; onReviewInvite: () => void }) {
  return (
    <>
      <section className="welcome-band">
        <div className="welcome-copy"><p className="eyebrow">Thursday, 27 August</p><h1>Good morning, Arthur.</h1><p>Your family home is calm and connected. There are two conversations and one shared decision waiting for you.</p><div className="welcome-actions"><button className="primary-button" onClick={() => onNavigate("messages")}>Open family chat <ChevronRight size={17} /></button><button className="outline-button" onClick={() => onNavigate("tree")}>Visit the tree</button></div></div>
        <div className="welcome-sculpture" aria-hidden="true"><div className="orb orb-a" /><div className="orb orb-b" /><div className="orb orb-c" /><div className="home-seal"><Heart size={20} fill="currentColor" /><span>Since<br />1948</span></div></div>
      </section>
      <div className="dashboard-grid">
        <div className="main-column"><FamilyTreePanel selectedMember={members[2]} onSelect={() => onNavigate("tree")} /><MessagesPanel activeRoom="general" setActiveRoom={() => onNavigate("messages")} /></div>
        <aside className="side-column"><InvitationCard onReview={onReviewInvite} /><GovernancePanel compact onOpen={() => onNavigate("governance")} /><section className="events-card surface-card"><SectionHeading eyebrow="Coming up" title="At home" /><div className="event-item"><span className="event-date"><b>31</b><small>AUG</small></span><span><b>Sunday supper</b><small>Calder home · 18:30</small></span><button aria-label="View Sunday supper"><ChevronRight size={17} /></button></div><div className="event-item"><span className="event-date muted"><b>06</b><small>SEP</small></span><span><b>Otto’s museum day</b><small>City museum · 10:00</small></span><button aria-label="View Otto’s museum day"><ChevronRight size={17} /></button></div></section></aside>
      </div>
    </>
  );
}

function TreeView({ selectedMember, onSelect }: { selectedMember: Member; onSelect: (member: Member) => void }) {
  return <div className="view-stack"><div className="view-intro"><p className="eyebrow">Family connection</p><h1>Our story, in branches.</h1><p>Explore each household, follow relationships, and keep the details that make a family feel close.</p></div><FamilyTreePanel selectedMember={selectedMember} onSelect={onSelect} /><section className="tree-notes"><div><span className="icon-disc sage"><Sparkles size={17} /></span><h3>Household branches</h3><p>Tree navigation respects the relationships and visibility chosen by your family.</p></div><div><span className="icon-disc rose"><FileText size={17} /></span><h3>Shared memories</h3><p>Profiles can carry photos, short stories, and documents safely alongside the tree.</p></div><div><span className="icon-disc ink"><LockKeyhole size={17} /></span><h3>Private by default</h3><p>Family information belongs inside the home, never a public social graph.</p></div></section></div>;
}

function MessagesView({ activeRoom, setActiveRoom }: { activeRoom: string; setActiveRoom: (room: string) => void }) {
  return <div className="view-stack"><div className="view-intro split-intro"><div><p className="eyebrow">Private communication</p><h1>Conversations for the people who matter.</h1><p>Every family room has a clear purpose and a privacy boundary that stays with it.</p></div><span className="relay-pill"><LockKeyhole size={14} /> Private relay ready</span></div><MessagesPanel activeRoom={activeRoom} setActiveRoom={setActiveRoom} /></div>;
}

function GovernanceView({ onInvite }: { onInvite: () => void }) {
  return <div className="view-stack"><div className="view-intro split-intro"><div><p className="eyebrow">Family council</p><h1>Shared decisions, held with care.</h1><p>Governance makes sensitive changes visible, deliberate, and accountable to the people they affect.</p></div><button className="primary-button" onClick={onInvite}><Plus size={17} /> New proposal</button></div><GovernancePanel /><section className="activity-card surface-card"><SectionHeading eyebrow="Activity history" title="A clear record of care" /><div className="activity-list"><div><span className="timeline-dot sage" /><p><b>June added an acknowledgement</b><small>Welcome Marin into the Calder home · Today, 09:18</small></p></div><div><span className="timeline-dot clay" /><p><b>Arthur shared a family guide update</b><small>Home access & gathering notes · Yesterday, 16:42</small></p></div><div><span className="timeline-dot lavender" /><p><b>Elise attached a document</b><small>Grandmother’s recipe book · Monday, 13:04</small></p></div></div></section></div>;
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [view, setView] = useState<View>("home");
  const [activeRoom, setActiveRoom] = useState("general");
  const [selectedMember, setSelectedMember] = useState(members[2]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const displayName = useMemo(() => user?.name?.split(" ")[0] ?? "Arthur", [user?.name]);

  function navigate(next: View) {
    setView(next);
    setNavOpen(false);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  return (
    <div className="kinfolk-app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")}><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>kinfolk</span></button>
        <div className="family-switcher"><span className="family-mini"><Monogram initials="CH" tone="clay" size="sm" /></span><span>The Calder home</span><ChevronDown size={15} /></div>
        <div className="topbar-actions"><button className="icon-button notification-button" onClick={() => setNotificationOpen(!notificationOpen)} aria-label="Open notifications"><Bell size={19} /><i /></button><button className="profile-trigger" onClick={isAuthenticated ? logout : startLogin}><Monogram initials={isAuthenticated ? displayName.slice(0, 2).toUpperCase() : "AC"} tone="clay" size="sm" /><span>{isAuthenticated ? "Sign out" : "Sign in"}</span></button><button className="mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Open menu">{navOpen ? <X size={21} /> : <Menu size={21} />}</button></div>
        {notificationOpen ? <div className="notifications-popover"><div><p className="eyebrow">Attention</p><h3>Two things need you</h3></div><button onClick={() => { setNotificationOpen(false); navigate("governance"); }}><ShieldCheck size={16} /><span><b>Council acknowledgement</b><small>Welcome Marin is ready for your response.</small></span></button><button onClick={() => { setNotificationOpen(false); navigate("messages"); }}><MessageCircle size={16} /><span><b>Family general</b><small>Elise mentioned you in a new message.</small></span></button></div> : null}
      </header>

      <div className="shell">
        <aside className={`sidebar ${navOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-label">The Calder home</div>
          <nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "messages" ? <i className="nav-badge">2</i> : null}</button>; })}</nav>
          <div className="sidebar-bottom"><button onClick={() => showNotice("Home settings are ready for your family administrator.")}><Settings size={18} /><span>Home settings</span></button><div className="home-privacy"><LockKeyhole size={15} /><span>Private family space</span></div></div>
        </aside>
        <main className="main-content">
          {view === "home" ? <HomeOverview onNavigate={navigate} onReviewInvite={() => setInviteOpen(true)} /> : null}
          {view === "tree" ? <TreeView selectedMember={selectedMember} onSelect={setSelectedMember} /> : null}
          {view === "messages" ? <MessagesView activeRoom={activeRoom} setActiveRoom={setActiveRoom} /> : null}
          {view === "governance" ? <GovernanceView onInvite={() => setInviteOpen(true)} /> : null}
        </main>
      </div>

      <nav className="mobile-nav">{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "messages" ? <i /> : null}</button>; })}</nav>
      {inviteOpen ? <div className="modal-backdrop" role="presentation"><section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title"><button className="modal-close" onClick={() => setInviteOpen(false)} aria-label="Close invitation review"><X size={19} /></button><span className="icon-disc clay"><UserRoundPlus size={19} /></span><p className="eyebrow">Membership review</p><h2 id="invite-title">Welcome Marin with shared care.</h2><p>Marin accepted June’s invitation as a trusted family friend. The Calder home requires two distinct council acknowledgements before access begins.</p><div className="modal-member"><Monogram initials="MT" tone="sand" size="lg" /><span><b>Marin Torres</b><small>Family friend · Requested access today</small></span></div><div className="modal-rule"><ShieldCheck size={17} /><span><b>Two-person approval</b><small>June’s request does not count as a second acknowledgement.</small></span></div><div className="modal-actions"><button className="outline-button" onClick={() => setInviteOpen(false)}>Review later</button><button className="primary-button" onClick={() => { setInviteOpen(false); showNotice("Your acknowledgement was recorded in the family activity history."); }}>Acknowledge request <Check size={17} /></button></div></section></div> : null}
      {notice ? <div className="notice-toast"><Check size={16} /> {notice}</div> : null}
    </div>
  );
}
