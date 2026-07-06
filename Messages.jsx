/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Send, Inbox, MessageSquare, Briefcase, X, Search, Plus, ChevronDown, User as UserIcon, CornerUpLeft, Smile } from 'lucide-react';
import { apiJson, getSession } from './api';

const TABS = {
  PUBLIC: 'public',
  INBOX: 'inbox',
};

const POLL_INTERVAL_MS = 10000;

const initials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] || '') + (parts[1][0] || '');
};

const colorFor = (name) => {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
};

const relativeTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  const sameDay = new Date().toDateString() === date.toDateString();
  if (sameDay) return `${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) {
    return `אתמול ${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (hours < 24 * 7) return date.toLocaleDateString('he-IL', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
};

function Avatar({ name }) {
  return (
    <div className="chat-avatar" style={{ background: colorFor(name) }} aria-hidden>
      {initials(name).toUpperCase()}
    </div>
  );
}

function ContactCardEmbed({ message, partner }) {
  const meta = message?.metadata?.contact || {};
  const orgName = message?.metadata?.organizationName || partner?.organizationName || '';
  return (
    <div className="contact-card-message" data-testid="contact-card-message">
      <div className="partner-card-header">
        <UserIcon size={16} />
        <span>👤 כרטיס איש קשר</span>
      </div>
      <div className="partner-card-title">{meta.name || 'ללא שם'}</div>
      {orgName && <div className="partner-card-line">ארגון: {orgName}</div>}
      {meta.role && <div className="partner-card-line">תפקיד: {meta.role}</div>}
      <div className="partner-card-line">
        {meta.phone && <span>📞 {meta.phone}</span>}
        {meta.phone && meta.email && <span>{'  '}</span>}
        {meta.email && <span>✉️ {meta.email}</span>}
      </div>
      {message?.partnerId && (
        <Link to={`/partners/${message.partnerId}`} className="btn btn-outline btn-sm" data-testid="contact-card-open">
          פתח כרטיס שותף →
        </Link>
      )}
    </div>
  );
}

function PartnerCardEmbed({ partner, body }) {
  if (!partner) {
    return (
      <div className="partner-card-message" data-testid="partner-card-missing">
        <div className="partner-card-title">כרטיס שותף לא זמין</div>
        <div className="muted-text">ייתכן שהשותף נמחק.</div>
        {body && <div className="partner-card-note">{body}</div>}
      </div>
    );
  }
  const phone = partner.contacts?.find((contact) => contact.phone)?.phone || '';
  const company = partner.domain || partner.sponsorshipCategory || '';
  return (
    <div className="partner-card-message" data-testid="partner-card-message">
      <div className="partner-card-header">
        <Briefcase size={16} />
        <span>כרטיס שותף</span>
      </div>
      <div className="partner-card-title">{partner.organizationName || 'ללא שם'}</div>
      {company && <div className="partner-card-line">{company}</div>}
      {partner.status && <div className="partner-card-line">סטטוס: {statusLabel(partner.status)}</div>}
      {phone && <div className="partner-card-line">📞 {phone}</div>}
      <Link to={`/partners/${partner.id}`} className="btn btn-outline btn-sm" data-testid="partner-card-open">
        פתח כרטיס
      </Link>
      {body && <div className="partner-card-note">{body}</div>}
    </div>
  );
}

function statusLabel(status) {
  switch (status) {
    case 'closed': return 'סגור';
    case 'negotiation': return 'מו"מ';
    case 'initial': return 'פנייה ראשונית';
    case 'archive': return 'ארכיון';
    default: return status || '';
  }
}

function renderBodyWithMentions(text, knownUsers) {
  if (!text) return null;
  const userSet = new Set(knownUsers.map((u) => u.username));
  const parts = [];
  const regex = /@([^\s@,.;:!?]+)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key}>{text.slice(lastIndex, match.index)}</span>);
      key += 1;
    }
    if (userSet.has(match[1])) {
      parts.push(<span key={key} className="mention">@{match[1]}</span>);
    } else {
      parts.push(<span key={key}>{match[0]}</span>);
    }
    key += 1;
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

const REACTION_EMOJIS = ['👍', '❤️', '😊', '🙏', '🎉', '🔥'];

function MessageActions({ onReply, onReact }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div className="message-actions" data-testid="message-actions">
      <button type="button" className="message-action-btn" title="הגב" aria-label="הגב להודעה" onClick={onReply} data-testid="reply-btn">
        <CornerUpLeft size={14} />
      </button>
      <div style={{ position: 'relative' }}>
        <button type="button" className="message-action-btn" title="הוסף תגובה" aria-label="הוסף תגובה" onClick={() => setShowPicker((value) => !value)} data-testid="emoji-btn">
          <Smile size={14} />
        </button>
        {showPicker && (
          <div className="emoji-picker" data-testid="emoji-picker" onMouseLeave={() => setShowPicker(false)}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-picker-option"
                onClick={() => { onReact(emoji); setShowPicker(false); }}
                data-testid="emoji-pick"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReactionsBar({ reactions, currentUsername, onToggle }) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div className="reactions-bar" data-testid="reactions-bar">
      {reactions.map((reaction) => {
        const mine = Array.isArray(reaction.users) && reaction.users.includes(currentUsername);
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={`reaction-chip ${mine ? 'mine' : ''}`}
            onClick={() => onToggle(reaction.emoji)}
            title={(reaction.users || []).join(', ')}
            data-testid="reaction-chip"
          >
            <span>{reaction.emoji}</span>
            <span className="reaction-count">{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ReplyContext({ parentMessage }) {
  if (!parentMessage) return null;
  const preview = parentMessage.messageType === 'partner_card'
    ? '📇 כרטיס שותף'
    : parentMessage.messageType === 'contact_card'
      ? '👤 כרטיס איש קשר'
      : (parentMessage.body || '').slice(0, 80);
  return (
    <div className="reply-context" data-testid="reply-context">
      <div className="reply-context-name">↩ {parentMessage.senderUsername}</div>
      <div className="reply-context-text">{preview}</div>
    </div>
  );
}

function ChatBubble({
  message,
  partners,
  currentUsername,
  knownUsers,
  allMessages,
  onReply,
  onToggleReaction,
}) {
  const partner = message.partnerId ? partners.find((p) => p.id === message.partnerId) : null;
  const isMine = message.senderUsername === currentUsername;
  const parent = message.replyToMessageId
    ? allMessages.find((m) => m.id === message.replyToMessageId)
    : null;
  return (
    <div className={`chat-bubble-row ${isMine ? 'mine' : 'other'}`} data-testid="chat-bubble">
      <Avatar name={message.senderUsername} />
      <div className="chat-bubble-stack">
        <div className="chat-meta">
          <strong>{message.senderUsername}</strong>
          <span>{relativeTime(message.createdAt)}</span>
        </div>
        <div className="chat-bubble-wrap">
          <div className="chat-bubble">
            {parent && <ReplyContext parentMessage={parent} />}
            {message.messageType === 'partner_card' ? (
              <PartnerCardEmbed partner={partner} body={message.body} />
            ) : message.messageType === 'contact_card' ? (
              <ContactCardEmbed message={message} partner={partner} />
            ) : (
              <span>{renderBodyWithMentions(message.body, knownUsers)}</span>
            )}
          </div>
          <MessageActions
            onReply={() => onReply(message)}
            onReact={(emoji) => onToggleReaction(message.id, emoji)}
          />
        </div>
        <ReactionsBar
          reactions={message.reactions}
          currentUsername={currentUsername}
          onToggle={(emoji) => onToggleReaction(message.id, emoji)}
        />
      </div>
    </div>
  );
}

function PartnerPicker({ partners, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners.slice(0, 30);
    return partners
      .filter((p) =>
        (p.organizationName || '').toLowerCase().includes(q) ||
        (p.domain || '').toLowerCase().includes(q) ||
        (p.pic || '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [partners, query]);

  return (
    <div className="partner-picker" data-testid="partner-picker">
      <div className="partner-picker-header">
        <strong>בחר שותף לשיתוף</strong>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="סגור">
          <X size={16} />
        </button>
      </div>
      <div className="partner-picker-search">
        <Search size={16} />
        <input
          autoFocus
          className="form-control"
          placeholder="חפש שותף..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="partner-picker-search"
        />
      </div>
      <div className="partner-picker-list">
        {filtered.length === 0 && <div className="muted-text">לא נמצאו שותפים.</div>}
        {filtered.map((partner) => (
          <button
            type="button"
            key={partner.id}
            className="partner-picker-item"
            onClick={() => onSelect(partner)}
            data-testid="partner-picker-item"
          >
            <strong>{partner.organizationName || 'ללא שם'}</strong>
            {partner.domain && <span className="muted-text"> · {partner.domain}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewDmPicker({ users, currentUsername, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => u.username !== currentUsername)
      .filter((u) =>
        !q ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q)
      );
  }, [users, query, currentUsername]);
  return (
    <div className="partner-picker" data-testid="new-dm-picker">
      <div className="partner-picker-header">
        <strong>שיחה חדשה</strong>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="סגור">
          <X size={16} />
        </button>
      </div>
      <div className="partner-picker-search">
        <Search size={16} />
        <input
          autoFocus
          className="form-control"
          placeholder="חפש משתמש..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="partner-picker-list">
        {filtered.length === 0 && <div className="muted-text" style={{ padding: 12 }}>לא נמצאו משתמשים.</div>}
        {filtered.map((u) => (
          <button
            type="button"
            key={u.username}
            className="partner-picker-item"
            onClick={() => onSelect(u.username)}
            data-testid="new-dm-pick"
          >
            <strong>{u.displayName || u.username}</strong>
            <span className="muted-text"> · @{u.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({
  body,
  setBody,
  onSubmit,
  pendingPartner,
  setPendingPartner,
  onOpenPartnerPicker,
  users,
  placeholder,
}) {
  const textareaRef = useRef(null);
  const [mentionState, setMentionState] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const detectMention = (value, caret) => {
    const before = value.slice(0, caret);
    const match = before.match(/@([^\s@,.;:!?]*)$/);
    if (!match) return null;
    return { start: caret - match[1].length - 1, query: match[1] };
  };

  const handleChange = (event) => {
    const value = event.target.value;
    setBody(value);
    const caret = event.target.selectionStart || value.length;
    const m = detectMention(value, caret);
    if (m) {
      setMentionState(m);
      setActiveIndex(0);
    } else {
      setMentionState(null);
    }
  };

  const filteredMentionUsers = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.toLowerCase();
    return users
      .filter((u) => !q || (u.username || '').toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionState, users]);

  const insertMention = (username) => {
    if (!mentionState) return;
    const value = body;
    const before = value.slice(0, mentionState.start);
    const after = value.slice(mentionState.start + mentionState.query.length + 1);
    const next = `${before}@${username} ${after}`;
    setBody(next);
    setMentionState(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const caret = before.length + username.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(caret, caret);
      }
    }, 0);
  };

  const handleKeyDown = (event) => {
    if (mentionState && filteredMentionUsers.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((idx) => Math.min(idx + 1, filteredMentionUsers.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((idx) => Math.max(idx - 1, 0));
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        insertMention(filteredMentionUsers[activeIndex].username);
        return;
      }
      if (event.key === 'Escape') {
        setMentionState(null);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form
      className="chat-composer"
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      data-testid="message-composer"
    >
      {pendingPartner && (
        <div className="partner-card-preview" data-testid="pending-partner">
          <Briefcase size={16} color="var(--primary-color)" />
          <div className="preview-info">
            <strong>{pendingPartner.organizationName}</strong>
            {pendingPartner.status && <span className="muted-text" style={{ fontSize: '0.78rem' }}>סטטוס: {statusLabel(pendingPartner.status)}</span>}
            <Link to={`/partners/${pendingPartner.id}`} target="_blank" rel="noopener">פתח כרטיס</Link>
          </div>
          <button type="button" className="btn-icon" onClick={() => setPendingPartner(null)} aria-label="הסר">
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          className="form-control"
          rows="3"
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          data-testid="message-textarea"
        />
        {mentionState && filteredMentionUsers.length > 0 && (
          <div className="mention-dropdown" data-testid="mention-dropdown">
            {filteredMentionUsers.map((u, idx) => (
              <button
                type="button"
                key={u.username}
                className={`mention-item ${idx === activeIndex ? 'active' : ''}`}
                onMouseDown={(event) => { event.preventDefault(); insertMention(u.username); }}
                onMouseEnter={() => setActiveIndex(idx)}
                data-testid="mention-option"
              >
                <Avatar name={u.username} />
                <div>
                  <div><strong>{u.displayName || u.username}</strong></div>
                  <div className="muted-text" style={{ fontSize: '0.75rem' }}>@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="composer-actions" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onOpenPartnerPicker}
          data-testid="share-partner-card-btn"
        >
          <Briefcase size={14} />
          שתף כרטיס שותף
        </button>
        <button className="btn btn-primary btn-sm" type="submit" data-testid="send-message-btn">
          <Send size={14} />
          שליחה
        </button>
      </div>
    </form>
  );
}

export default function Messages({ onRead }) {
  const session = getSession();
  const currentUsername = session?.username || '';
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState(TABS.PUBLIC);
  const [users, setUsers] = useState([]);
  const [partners, setPartners] = useState([]);

  const [publicMessages, setPublicMessages] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [conversation, setConversation] = useState([]);

  const [body, setBody] = useState('');
  const [pendingPartner, setPendingPartner] = useState(null);
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);
  const [showNewDmPicker, setShowNewDmPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasNewMessage, setHasNewMessage] = useState(null); // { senderName }
  const [replyTo, setReplyTo] = useState(null); // parent message
  const [replyText, setReplyText] = useState('');
  const messagesContainerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastSeenIdRef = useRef(null);

  const isPrivateActive = tab === TABS.INBOX && Boolean(activeChatUser);

  const loadCommon = useCallback(async () => {
    const [usersData, partnersData] = await Promise.all([
      apiJson('/users').catch(() => []),
      apiJson('/partners').catch(() => []),
    ]);
    setUsers(usersData);
    setPartners(partnersData);
  }, []);

  const loadPublic = useCallback(async () => {
    const data = await apiJson('/messages');
    const ordered = Array.isArray(data) ? data.slice().reverse() : [];
    setPublicMessages(ordered);
    const unreadIds = ordered.filter((m) => !m.read && m.senderUsername !== currentUsername).map((m) => m.id);
    if (unreadIds.length) {
      try {
        await apiJson('/messages/read', { method: 'POST', body: JSON.stringify({ messageIds: unreadIds }) });
        onRead?.();
      } catch (err) { console.warn('mark-read failed', err); }
    }
    return ordered;
  }, [currentUsername, onRead]);

  const loadInbox = useCallback(async () => {
    const data = await apiJson('/messages/inbox');
    setInbox(data);
    return data;
  }, []);

  const loadConversation = useCallback(async (username) => {
    const data = await apiJson(`/messages/private/${encodeURIComponent(username)}`);
    setConversation(data);
    const unreadIds = data
      .filter((m) => !m.read && m.recipientUsername === currentUsername)
      .map((m) => m.id);
    if (unreadIds.length) {
      try {
        await apiJson('/messages/read', { method: 'POST', body: JSON.stringify({ messageIds: unreadIds }) });
        onRead?.();
      } catch (err) { console.warn('mark-read failed', err); }
      loadInbox();
    }
    return data;
  }, [currentUsername, onRead, loadInbox]);

  const refreshAll = useCallback(async () => {
    setError('');
    try {
      await loadCommon();
      if (tab === TABS.PUBLIC) await loadPublic();
      if (tab === TABS.INBOX) await loadInbox();
      if (activeChatUser) await loadConversation(activeChatUser);
    } catch (err) {
      setError(err.message || 'לא הצלחתי לטעון הודעות.');
    } finally {
      setLoading(false);
    }
  }, [tab, activeChatUser, loadCommon, loadPublic, loadInbox, loadConversation]);

  useEffect(() => {
    setLoading(true);
    refreshAll();
  }, [tab]);

  useEffect(() => {
    if (activeChatUser) loadConversation(activeChatUser).catch((err) => setError(err.message));
  }, [activeChatUser, loadConversation]);

  // Honor incoming navigation state from PartnerDetails: { sharePartner, openInbox, dmTo }
  useEffect(() => {
    const state = location.state;
    if (!state) return;
    if (state.sharePartner) {
      setPendingPartner(state.sharePartner);
    }
    if (state.dmTo) {
      setTab(TABS.INBOX);
      setActiveChatUser(state.dmTo);
    } else if (state.openInbox) {
      setTab(TABS.INBOX);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const checkForNewIncoming = useCallback((list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const last = list[list.length - 1];
    if (!last || last.id === lastSeenIdRef.current) return;
    if (last.senderUsername === currentUsername) {
      lastSeenIdRef.current = last.id;
      return;
    }
    if (stickToBottomRef.current) {
      lastSeenIdRef.current = last.id;
    } else {
      setHasNewMessage({ senderName: last.senderUsername });
    }
  }, [currentUsername]);

  // Polling
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        if (tab === TABS.PUBLIC) {
          const updated = await loadPublic();
          checkForNewIncoming(updated);
        } else if (tab === TABS.INBOX) {
          await loadInbox();
          if (activeChatUser) {
            const updated = await loadConversation(activeChatUser);
            checkForNewIncoming(updated);
          }
        }
      } catch {
        // ignore poll errors
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tab, activeChatUser, loadPublic, loadInbox, loadConversation, checkForNewIncoming]);

  // Auto-scroll to bottom when messages change while user is at bottom
  useEffect(() => {
    const list = isPrivateActive ? conversation : publicMessages;
    if (!list?.length) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
        lastSeenIdRef.current = list[list.length - 1].id;
        setHasNewMessage(null);
      });
    }
  }, [conversation, publicMessages, isPrivateActive, tab]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distFromBottom < 40;
    stickToBottomRef.current = atBottom;
    if (atBottom) setHasNewMessage(null);
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    stickToBottomRef.current = true;
    setHasNewMessage(null);
  };

  const sendMessage = async () => {
    setError('');
    const cleanBody = body.trim();
    const isPartnerCard = Boolean(pendingPartner);
    const isPrivate = tab === TABS.INBOX && activeChatUser;

    if (!isPartnerCard && !cleanBody) return;

    const payload = {
      body: cleanBody,
      ...(isPartnerCard ? { partnerId: pendingPartner.id, messageType: 'partner_card' } : {}),
      ...(isPrivate ? { recipientUsername: activeChatUser } : {}),
    };
    const endpoint = isPrivate ? '/messages/private' : '/messages';

    try {
      await apiJson(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setBody('');
      setPendingPartner(null);
      stickToBottomRef.current = true;
      if (isPrivate) {
        await loadConversation(activeChatUser);
        await loadInbox();
      } else {
        await loadPublic();
      }
    } catch (err) {
      setError(err.message || 'שליחת ההודעה נכשלה.');
    }
  };

  const otherUsers = users.filter((u) => u.username !== currentUsername);
  const totalInboxUnread = inbox.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
  const messagesToShow = isPrivateActive ? conversation : publicMessages;

  const replaceMessageReactions = (messageId, reactions) => {
    const updater = (list) => list.map((message) => message.id === messageId ? { ...message, reactions } : message);
    if (isPrivateActive) {
      setConversation((current) => updater(current));
    } else {
      setPublicMessages((current) => updater(current));
    }
  };

  const handleToggleReaction = async (messageId, emoji) => {
    try {
      const response = await apiJson(`/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      replaceMessageReactions(messageId, response.reactions || []);
    } catch (err) {
      setError(err.message || 'שמירת התגובה נכשלה.');
    }
  };

  const startReply = (parentMessage) => {
    setReplyTo(parentMessage);
    setReplyText('');
  };

  const cancelReply = () => {
    setReplyTo(null);
    setReplyText('');
  };

  const sendReply = async () => {
    if (!replyTo) return;
    const cleanBody = replyText.trim();
    if (!cleanBody) return;
    const isPrivate = Boolean(replyTo.recipientUsername);
    const otherUser = replyTo.senderUsername === currentUsername ? replyTo.recipientUsername : replyTo.senderUsername;
    const payload = {
      body: cleanBody,
      replyToMessageId: replyTo.id,
      ...(isPrivate ? { recipientUsername: otherUser } : {}),
    };
    const endpoint = isPrivate ? '/messages/private' : '/messages';
    try {
      await apiJson(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      cancelReply();
      stickToBottomRef.current = true;
      if (isPrivate) {
        await loadConversation(otherUser);
        await loadInbox();
      } else {
        await loadPublic();
      }
    } catch (err) {
      setError(err.message || 'שליחת התגובה נכשלה.');
    }
  };

  const renderReplyComposer = (parentMessage) => {
    if (!replyTo || replyTo.id !== parentMessage.id) return null;
    return (
      <div className="reply-composer" data-testid="reply-composer">
        <div className="reply-composer-header">
          מגיב ל: <strong>{parentMessage.senderUsername}</strong>
        </div>
        <textarea
          className="form-control"
          rows="2"
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendReply();
            } else if (event.key === 'Escape') {
              cancelReply();
            }
          }}
          placeholder="כתוב תגובה..."
          data-testid="reply-textarea"
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={cancelReply} data-testid="reply-cancel">ביטול</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={sendReply} data-testid="reply-send">
            <Send size={14} /> שלח
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="header-flex">
        <div>
          <h2>הודעות</h2>
          <div className="muted-text">אפשר לתייג משתמשים בעזרת @, להשתמש ב-Enter לשליחה ו-Shift+Enter לשורה חדשה.</div>
        </div>
      </div>

      <div className="tabs" role="tablist" data-testid="messages-tabs">
        <button
          role="tab"
          className={`tab ${tab === TABS.PUBLIC ? 'tab-active' : ''}`}
          onClick={() => { setTab(TABS.PUBLIC); setActiveChatUser(null); }}
          data-testid="tab-public"
        >
          <MessageSquare size={16} /> ערוץ כללי
        </button>
        <button
          role="tab"
          className={`tab ${tab === TABS.INBOX ? 'tab-active' : ''}`}
          onClick={() => setTab(TABS.INBOX)}
          data-testid="tab-inbox"
        >
          <Inbox size={16} /> אישי
          {totalInboxUnread > 0 && <span className="nav-badge">{totalInboxUnread}</span>}
        </button>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {tab === TABS.PUBLIC && (
        <div className="card">
          <div className="chat-container">
            <div
              className="chat-messages"
              ref={messagesContainerRef}
              onScroll={handleScroll}
              data-testid="public-message-list"
            >
              {loading ? (
                <div className="empty-state">טוען הודעות...</div>
              ) : messagesToShow.length === 0 ? (
                <div className="empty-state">אין הודעות עדיין.</div>
              ) : (
                messagesToShow.map((message) => (
                  <div key={message.id}>
                    <ChatBubble
                      message={message}
                      partners={partners}
                      currentUsername={currentUsername}
                      knownUsers={users}
                      allMessages={messagesToShow}
                      onReply={startReply}
                      onToggleReaction={handleToggleReaction}
                    />
                    {renderReplyComposer(message)}
                  </div>
                ))
              )}
              {hasNewMessage && (
                <button
                  type="button"
                  className="chat-new-indicator"
                  onClick={scrollToBottom}
                  data-testid="new-message-indicator"
                >
                  <ChevronDown size={14} /> הודעה חדשה מ{hasNewMessage.senderName}
                </button>
              )}
            </div>
            <Composer
              body={body}
              setBody={setBody}
              onSubmit={sendMessage}
              pendingPartner={pendingPartner}
              setPendingPartner={setPendingPartner}
              onOpenPartnerPicker={() => setShowPartnerPicker(true)}
              users={users}
              placeholder="כתוב הודעה לצוות..."
            />
          </div>
        </div>
      )}

      {tab === TABS.INBOX && (
        <div className="inbox-layout">
          <div className="card inbox-list" data-testid="inbox-list">
            <div className="inbox-list-header">
              <strong>שיחות אישיות</strong>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm btn-new-dm"
              onClick={() => setShowNewDmPicker(true)}
              data-testid="open-new-dm"
            >
              <Plus size={14} /> שיחה חדשה
            </button>
            {inbox.length === 0 && (
              <div className="muted-text" style={{ padding: '12px' }}>
                אין עדיין שיחות אישיות. לחץ על שם משתמש להתחיל
              </div>
            )}
            {inbox.map((item) => (
              <button
                key={item.counterpart}
                className={`inbox-item ${activeChatUser === item.counterpart ? 'inbox-item-active' : ''}`}
                onClick={() => setActiveChatUser(item.counterpart)}
                data-testid="inbox-item"
              >
                <div className="inbox-item-name">
                  <strong>{item.counterpartDisplayName || item.counterpart}</strong>
                  {item.unreadCount > 0 && <span className="nav-badge">{item.unreadCount}</span>}
                </div>
                <div className="inbox-item-preview muted-text">
                  {item.lastMessage?.messageType === 'partner_card'
                    ? `📇 ${item.lastMessage.body || 'כרטיס שותף'}`
                    : item.lastMessage?.messageType === 'contact_card'
                      ? `👤 ${item.lastMessage.metadata?.contact?.name || 'איש קשר'}`
                      : item.lastMessage?.body || ''}
                </div>
              </button>
            ))}
          </div>

          <div className="card inbox-chat" data-testid="inbox-chat">
            {!activeChatUser ? (
              <div className="empty-state">בחר שיחה או התחל שיחה חדשה.</div>
            ) : (
              <div className="chat-container">
                <div className="inbox-chat-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={activeChatUser} />
                  <strong>שיחה עם {activeChatUser}</strong>
                </div>
                <div
                  className="chat-messages"
                  ref={messagesContainerRef}
                  onScroll={handleScroll}
                  data-testid="conversation-messages"
                >
                  {conversation.length === 0 ? (
                    <div className="empty-state">אין עדיין הודעות בשיחה הזו.</div>
                  ) : (
                    conversation.map((message) => (
                      <div key={message.id}>
                        <ChatBubble
                          message={message}
                          partners={partners}
                          currentUsername={currentUsername}
                          knownUsers={users}
                          allMessages={conversation}
                          onReply={startReply}
                          onToggleReaction={handleToggleReaction}
                        />
                        {renderReplyComposer(message)}
                      </div>
                    ))
                  )}
                  {hasNewMessage && (
                    <button
                      type="button"
                      className="chat-new-indicator"
                      onClick={scrollToBottom}
                      data-testid="new-message-indicator"
                    >
                      <ChevronDown size={14} /> הודעה חדשה מ{hasNewMessage.senderName}
                    </button>
                  )}
                </div>
                <Composer
                  body={body}
                  setBody={setBody}
                  onSubmit={sendMessage}
                  pendingPartner={pendingPartner}
                  setPendingPartner={setPendingPartner}
                  onOpenPartnerPicker={() => setShowPartnerPicker(true)}
                  users={users}
                  placeholder={`כתוב הודעה פרטית ל-${activeChatUser}...`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {showPartnerPicker && (
        <div className="modal-overlay" onClick={() => setShowPartnerPicker(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '480px' }}>
            <PartnerPicker
              partners={partners}
              onSelect={(partner) => { setPendingPartner(partner); setShowPartnerPicker(false); }}
              onClose={() => setShowPartnerPicker(false)}
            />
          </div>
        </div>
      )}

      {showNewDmPicker && (
        <div className="modal-overlay" onClick={() => setShowNewDmPicker(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '380px' }}>
            <NewDmPicker
              users={otherUsers}
              currentUsername={currentUsername}
              onSelect={(username) => {
                setActiveChatUser(username);
                setShowNewDmPicker(false);
              }}
              onClose={() => setShowNewDmPicker(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
