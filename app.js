const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  addProjectPartner,
  cloneProjectFromTemplate,
  listRepresentations,
  createRepresentation,
  updateRepresentation,
  deleteRepresentation,
  listFinanceEntries,
  createFinanceEntry,
  updateFinanceEntry,
  deleteFinanceEntry,
  summarizeFinance,
  summarizeFinancePerPartner,
  countPartners,
  createMessage,
  createNotification,
  createOption,
  createPartner,
  createProject,
  createTag,
  createUser,
  deleteOption,
  deletePartner,
  deleteProject,
  deleteTag,
  deleteUser,
  ensureSchema,
  getProject,
  getSession,
  getStorageName,
  getUserRole,
  listConversation,
  listInbox,
  listMessages,
  listNotificationsForUser,
  listOptions,
  listProjectTemplates,
  listProjects,
  listProjectsForPartner,
  listTags,
  listUsers,
  login,
  logout,
  markAllNotificationsRead,
  markMessagesRead,
  markNotificationRead,
  readAllPartners,
  readMessage,
  readPartner,
  readSettings,
  recentFailedLoginCount,
  recordLoginAttempt,
  removeProjectPartner,
  setUserRole,
  toggleReaction,
  unreadMessageCount,
  updatePartner,
  updateProject,
  writeSettings,
} = require('./db');
const {
  buildCorsMiddleware,
  buildLoginLimiter,
  corsErrorHandler,
  getClientIp,
  securityHeaders,
} = require('./security');

const app = express();
app.set('trust proxy', 1);
const unknownUser = 'לא ידוע';

const defaultSettings = {
  economicBg: '#e0f2fe',
  socialBg: '#ffedd5',
  priorityEmoji: '🔥',
  dashboardGoal: 1000000,
};

app.use(securityHeaders);
app.use(buildCorsMiddleware());
app.use(corsErrorHandler);
app.use(express.json({ limit: '10mb' }));

app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    console.error('Storage initialization failed:', error);
    res.status(500).json({ message: 'Storage initialization failed' });
  }
});

const getToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
};

const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const requireAuth = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const session = await getSession(getToken(req));
  if (!session) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  const role = (await getUserRole(session.username)) || 'viewer';
  req.user = { username: session.username, displayName: session.displayName, role };
  next();
};

const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'אין הרשאה לפעולה הזו' });
  }
  next();
};
const requireWrite = requireRole('admin', 'manager');
const requireDelete = requireRole('admin');
const requireAdmin = requireRole('admin');

app.get('/api/health', async (req, res) => {
  const showDetails = process.env.HEALTH_DETAILS === 'true' || Boolean(await getSession(getToken(req)));
  if (!showDetails) {
    return res.json({ ok: true });
  }
  return res.json({
    ok: true,
    storage: getStorageName(),
    partnerCount: await countPartners(),
  });
});

app.get('/api/users', requireAuth, async (req, res) => {
  res.json(await listUsers(false));
});

app.get('/api/users/me', requireAuth, async (req, res) => {
  res.json({
    username: req.user.username,
    displayName: req.user.displayName,
    role: req.user.role,
  });
});

app.put('/api/users/:username/role', requireAuth, requireAdmin, async (req, res) => {
  const role = String(req.body.role || '').trim();
  if (!['admin', 'manager', 'viewer'].includes(role)) {
    return res.status(400).json({ message: 'תפקיד לא חוקי' });
  }
  try {
    await setUserRole(req.params.username, role);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message === 'cannot demote last admin' ? 'אי אפשר להוריד את המנהל האחרון' : err.message });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const pin = String(req.body.pin || '').trim();
  const displayName = String(req.body.displayName || username).trim();
  if (!username || !pin) return res.status(400).json({ message: 'חובה להזין שם משתמש וקוד PIN' });
  if (pin.length < 4) return res.status(400).json({ message: 'קוד PIN חייב להיות לפחות 4 ספרות' });
  const existing = await listUsers(false);
  if (existing.some((u) => u.username === username)) return res.status(409).json({ message: 'שם המשתמש כבר קיים' });
  await createUser(username, pin, displayName);
  res.status(201).json({ ok: true });
});

app.delete('/api/users/:username', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.username === req.user.username) return res.status(400).json({ message: 'לא ניתן למחוק את עצמך' });
  await deleteUser(req.params.username);
  res.json({ ok: true });
});

const loginLimiter = buildLoginLimiter();
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_THRESHOLD = 10;

app.post('/api/auth/login', loginLimiter, noStore, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const pin = String(req.body.pin || '').trim();
  const ip = getClientIp(req);
  if (!username || !pin) {
    return res.status(400).json({ message: 'יש להזין שם משתמש וקוד PIN.' });
  }

  const failures = await recentFailedLoginCount({ username, ip, windowMs: LOGIN_FAILURE_WINDOW_MS });
  if (failures >= LOGIN_FAILURE_THRESHOLD) {
    return res.status(429).json({ message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.' });
  }

  const session = await login(username, pin);
  await recordLoginAttempt({ username, ip, success: Boolean(session) });
  if (!session) {
    return res.status(401).json({ message: 'שם משתמש או PIN שגויים.' });
  }

  res.json(session);
});

app.post('/api/auth/register', noStore, async (req, res) => {
  return res.status(403).json({ message: 'הרשמה עצמאית אינה מורשית. פנה למנהל המערכת להוספת חשבון.' });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await logout(getToken(req));
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user, unreadMessages: await unreadMessageCount(req.user.username) });
});

app.get('/api/partners', requireAuth, async (req, res) => {
  const partners = await readAllPartners();
  const nameMap = Object.fromEntries(partners.map((p) => [p.id, p.organizationName]));
  res.json(partners.map((p) => ({
    ...p,
    parentPartnerName: p.parentPartnerId ? (nameMap[p.parentPartnerId] || null) : null,
  })));
});

app.get('/api/partners/:id', requireAuth, async (req, res) => {
  const partner = await readPartner(req.params.id);
  if (!partner) return res.status(404).json({ message: 'Partner not found' });
  res.json(partner);
});

const HISTORY_LIMIT = 10;

const appendHistory = (current = [], entry) => {
  const next = Array.isArray(current) ? current.slice() : [];
  next.push(entry);
  if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
  return next;
};

const buildChangeEntry = (user, action, details = {}) => ({
  id: uuidv4(),
  at: new Date().toISOString(),
  by: user?.username || unknownUser,
  byDisplay: user?.displayName || user?.username || unknownUser,
  action,
  ...details,
});

const summarizeChange = (action, details = {}) => {
  if (action === 'status') {
    const labels = {
      active: 'פעיל',
      inactive: 'לא פעיל',
      archived: 'ארכיון',
    };
    return `שינה סטטוס ל-${labels[details.value] || details.value || ''}`.trim();
  }
  if (action === 'field') return `עדכן שדה ${details.field || ''}`.trim();
  if (action === 'contact_added') return 'הוסיף איש קשר';
  if (action === 'contact_updated') return 'עדכן איש קשר';
  if (action === 'contact_deleted') return 'הסיר איש קשר';
  if (action === 'log_added') return 'הוסיף עדכון ליומן';
  if (action === 'created') return 'יצר את הכרטיס';
  if (action === 'merge') return 'מיזוג כרטיסים';
  return action;
};

app.post('/api/partners', requireAuth, requireWrite, async (req, res) => {
  const data = await readAllPartners();
  const organizationName = (req.body.organizationName || '').trim();

  if (!organizationName) return res.status(400).json({ message: 'חובה להזין שם ארגון' });

  const isDuplicate = data.some((partner) => partner.organizationName === organizationName);
  if (isDuplicate) {
    return res.status(409).json({ message: 'ארגון זה כבר קיים במערכת', isDuplicate: true });
  }

  const now = new Date().toISOString();
  const initialHistory = appendHistory([], buildChangeEntry(req.user, 'created', { summary: summarizeChange('created') }));
  const newPartner = {
    ...req.body,
    organizationName,
    id: uuidv4(),
    lastUpdated: now,
    lastUpdatedBy: req.user.username,
    lastModifiedAt: now,
    lastModifiedBy: req.user.displayName || req.user.username,
    changeHistory: initialHistory,
    createdAt: now,
    contacts: req.body.contacts || [],
    communicationLog: req.body.communicationLog || [],
    sourceFiles: req.body.sourceFiles || [],
    contactDate: req.body.contactDate || now.split('T')[0],
    partnerType: req.body.partnerType || '',
    partnerCategory: req.body.partnerCategory || '',
    tags: req.body.tags || [],
    parentPartnerId: req.body.parentPartnerId || null,
  };
  delete newPartner.updatedBy;

  res.status(201).json(await createPartner(newPartner));
});

app.put('/api/partners/:id', requireAuth, requireWrite, async (req, res) => {
  const current = await readPartner(req.params.id);
  if (!current) return res.status(404).json({ message: 'Partner not found' });

  const patch = { ...req.body };
  delete patch.updatedBy;
  delete patch.id;
  delete patch.changeHistory;

  const now = new Date().toISOString();
  const changedKeys = Object.keys(patch).filter((key) => JSON.stringify(patch[key]) !== JSON.stringify(current[key]));
  let nextHistory = Array.isArray(current.changeHistory) ? current.changeHistory.slice() : [];

  for (const key of changedKeys) {
    if (key === 'lastUpdated' || key === 'lastModifiedAt' || key === 'lastModifiedBy' || key === 'lastUpdatedBy') continue;
    if (key === 'status') {
      nextHistory = appendHistory(nextHistory, buildChangeEntry(req.user, 'status', {
        value: patch.status,
        previous: current.status,
        summary: summarizeChange('status', { value: patch.status }),
      }));
    } else if (key === 'contacts') {
      const before = Array.isArray(current.contacts) ? current.contacts : [];
      const after = Array.isArray(patch.contacts) ? patch.contacts : [];
      let action = 'contact_updated';
      if (after.length > before.length) action = 'contact_added';
      else if (after.length < before.length) action = 'contact_deleted';
      nextHistory = appendHistory(nextHistory, buildChangeEntry(req.user, action, { summary: summarizeChange(action) }));
    } else {
      nextHistory = appendHistory(nextHistory, buildChangeEntry(req.user, 'field', {
        field: key,
        summary: summarizeChange('field', { field: key }),
      }));
    }
  }

  const updated = await updatePartner(req.params.id, {
    ...patch,
    lastUpdated: now,
    lastUpdatedBy: req.user.username || current.lastUpdatedBy || unknownUser,
    lastModifiedAt: now,
    lastModifiedBy: req.user.displayName || req.user.username || unknownUser,
    changeHistory: nextHistory,
  });

  res.json(updated);
});

app.delete('/api/partners/:id', requireAuth, requireDelete, async (req, res) => {
  const deleted = await deletePartner(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Partner not found' });
  res.json(deleted);
});

app.post('/api/partners/:id/merge', requireAuth, requireDelete, async (req, res) => {
  const sourceId = req.params.id;
  const targetId = req.body.targetId;

  if (!targetId || sourceId === targetId) {
    return res.status(400).json({ message: 'Invalid target ID for merge' });
  }

  const sourcePartner = await readPartner(sourceId);
  const targetPartner = await readPartner(targetId);
  if (!sourcePartner || !targetPartner) {
    return res.status(404).json({ message: 'Source or target partner not found' });
  }

  const contactKeys = new Set();
  const contacts = [...(targetPartner.contacts || []), ...(sourcePartner.contacts || [])].filter((contact) => {
    const key = `${contact.name || ''}|${contact.email || ''}|${contact.phone || ''}`.toLowerCase();
    if (contactKeys.has(key)) return false;
    contactKeys.add(key);
    return true;
  });

  const communicationLog = [...(targetPartner.communicationLog || []), ...(sourcePartner.communicationLog || [])]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const sourceFiles = Array.from(new Set([...(targetPartner.sourceFiles || []), ...(sourcePartner.sourceFiles || [])]));
  const now = new Date().toISOString();
  const mergedHistory = appendHistory(targetPartner.changeHistory || [], buildChangeEntry(req.user, 'merge', {
    summary: summarizeChange('merge'),
    sourceName: sourcePartner.organizationName,
  }));
  const updatedTarget = await updatePartner(targetId, {
    ...targetPartner,
    contacts,
    communicationLog,
    sourceFiles,
    generalNotes: [targetPartner.generalNotes, sourcePartner.generalNotes].filter(Boolean).join(' | '),
    lastUpdated: now,
    lastUpdatedBy: `${req.user.username} (מיזוג)`,
    lastModifiedAt: now,
    lastModifiedBy: req.user.displayName || req.user.username,
    changeHistory: mergedHistory,
  });

  await deletePartner(sourceId);
  res.json(updatedTarget);
});

app.post('/api/partners/:id/logs', requireAuth, requireWrite, async (req, res) => {
  const partner = await readPartner(req.params.id);
  if (!partner) return res.status(404).json({ message: 'Partner not found' });

  const message = (req.body.message || '').trim();
  if (!message) return res.status(400).json({ message: 'חובה להזין תוכן לעדכון' });

  const now = new Date().toISOString();
  const allowedTypes = ['call', 'meeting', 'email', 'note', 'other'];
  const type = allowedTypes.includes(req.body.type) ? req.body.type : 'note';
  const newLog = {
    id: uuidv4(),
    date: now,
    updaterName: req.user.username,
    type,
    message,
  };

  const nextHistory = appendHistory(partner.changeHistory || [], buildChangeEntry(req.user, 'log_added', {
    summary: summarizeChange('log_added'),
  }));

  await updatePartner(req.params.id, {
    communicationLog: [...(partner.communicationLog || []), newLog],
    lastUpdated: now,
    lastUpdatedBy: req.user.username,
    lastModifiedAt: now,
    lastModifiedBy: req.user.displayName || req.user.username,
    changeHistory: nextHistory,
  });

  res.status(201).json(newLog);
});

app.get('/api/settings/:username', requireAuth, async (req, res) => {
  if (req.params.username !== req.user.username) return res.status(403).json({ message: 'Forbidden' });
  res.json({ ...defaultSettings, ...(await readSettings(req.params.username)) });
});

app.put('/api/settings/:username', requireAuth, async (req, res) => {
  if (req.params.username !== req.user.username) return res.status(403).json({ message: 'Forbidden' });
  const settings = { ...defaultSettings, ...(await readSettings(req.params.username)), ...req.body };
  await writeSettings(req.params.username, settings);
  res.json(settings);
});

app.get('/api/messages', requireAuth, async (req, res) => {
  res.json(await listMessages({ username: req.user.username, partnerId: req.query.partnerId || null }));
});

const sanitizeContactMetadata = (input) => {
  if (!input || typeof input !== 'object') return null;
  const contact = input.contact || input;
  if (!contact || typeof contact !== 'object' || !contact.name) return null;
  return {
    contact: {
      id: String(contact.id || ''),
      name: String(contact.name || ''),
      role: String(contact.role || ''),
      phone: String(contact.phone || ''),
      email: String(contact.email || ''),
      dataSource: String(contact.dataSource || ''),
    },
    organizationName: String(input.organizationName || ''),
  };
};

const buildContactCardMessage = async ({ partnerId, partner, metadataInput, body, senderUsername, recipientUsername }) => {
  const metadata = sanitizeContactMetadata(metadataInput) || {};
  if (!metadata.contact) {
    const error = new Error('חסר מידע על איש הקשר.');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  if (!metadata.organizationName && partner) {
    metadata.organizationName = partner.organizationName || '';
  }
  return createMessage({
    partnerId,
    senderUsername,
    recipientUsername,
    messageType: 'contact_card',
    body,
    metadata,
  });
};

app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    const partnerId = req.body.partnerId || null;
    const recipientUsername = req.body.recipientUsername || req.body.toUser || null;
    const replyToMessageId = req.body.replyToMessageId || null;
    const messageType = req.body.messageType || req.body.type || (partnerId ? (req.body.body ? 'text' : 'partner_card') : 'text');

    if (recipientUsername && recipientUsername === req.user.username) {
      return res.status(400).json({ message: 'לא ניתן לשלוח הודעה פרטית לעצמך.' });
    }

    if (messageType === 'partner_card' || messageType === 'contact_card') {
      if (!partnerId) {
        return res.status(400).json({ message: 'חובה לציין partnerId.' });
      }
      const partner = await readPartner(partnerId);
      if (!partner) {
        return res.status(404).json({ message: 'השותף לא נמצא.' });
      }
      if (messageType === 'contact_card') {
        const message = await buildContactCardMessage({
          partnerId,
          partner,
          metadataInput: req.body.metadata,
          body: req.body.body,
          senderUsername: req.user.username,
          recipientUsername,
        });
        return res.status(201).json(message);
      }
    }

    const message = await createMessage({
      partnerId,
      senderUsername: req.user.username,
      recipientUsername,
      messageType,
      body: req.body.body,
      replyToMessageId,
    });
    res.status(201).json(message);
  } catch (error) {
    console.error('Create message failed:', error);
    if (error.code === 'EMPTY_BODY') {
      return res.status(400).json({ message: 'תוכן ההודעה ריק.' });
    }
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'UNKNOWN_RECIPIENT') {
      return res.status(404).json({ message: 'הנמען לא נמצא.' });
    }
    return res.status(500).json({ message: 'שליחת ההודעה נכשלה.', error: error.message });
  }
});

app.get('/api/messages/inbox', requireAuth, async (req, res) => {
  try {
    const inbox = await listInbox(req.user.username);
    res.json(inbox);
  } catch (error) {
    console.error('List inbox failed:', error);
    res.status(500).json({ message: 'טעינת תיבת הדואר נכשלה.', error: error.message });
  }
});

app.get('/api/messages/private/:username', requireAuth, async (req, res) => {
  try {
    const otherUsername = String(req.params.username || '').trim();
    if (!otherUsername) {
      return res.status(400).json({ message: 'חסר שם משתמש.' });
    }
    const conversation = await listConversation(req.user.username, otherUsername);
    res.json(conversation);
  } catch (error) {
    console.error('List conversation failed:', error);
    res.status(500).json({ message: 'טעינת השיחה נכשלה.', error: error.message });
  }
});

app.post('/api/messages/private', requireAuth, async (req, res) => {
  try {
    const recipientUsername = String(req.body.recipientUsername || req.body.toUser || '').trim();
    if (!recipientUsername) {
      return res.status(400).json({ message: 'חובה לציין נמען.' });
    }
    if (recipientUsername === req.user.username) {
      return res.status(400).json({ message: 'לא ניתן לשלוח הודעה פרטית לעצמך.' });
    }
    const partnerId = req.body.partnerId || null;
    const replyToMessageId = req.body.replyToMessageId || null;
    const messageType = req.body.messageType || req.body.type || (partnerId ? 'partner_card' : 'text');

    if (messageType === 'partner_card' || messageType === 'contact_card') {
      if (!partnerId) {
        return res.status(400).json({ message: 'חובה לציין partnerId.' });
      }
      const partner = await readPartner(partnerId);
      if (!partner) {
        return res.status(404).json({ message: 'השותף לא נמצא.' });
      }
      if (messageType === 'contact_card') {
        const message = await buildContactCardMessage({
          partnerId,
          partner,
          metadataInput: req.body.metadata,
          body: req.body.body,
          senderUsername: req.user.username,
          recipientUsername,
        });
        return res.status(201).json(message);
      }
    }

    const message = await createMessage({
      partnerId,
      senderUsername: req.user.username,
      recipientUsername,
      messageType,
      body: req.body.body,
      replyToMessageId,
    });
    res.status(201).json(message);
  } catch (error) {
    console.error('Create private message failed:', error);
    if (error.code === 'EMPTY_BODY') {
      return res.status(400).json({ message: 'תוכן ההודעה ריק.' });
    }
    if (error.code === 'UNKNOWN_RECIPIENT') {
      return res.status(404).json({ message: 'הנמען לא נמצא.' });
    }
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'שליחת ההודעה הפרטית נכשלה.', error: error.message });
  }
});

app.post('/api/messages/read', requireAuth, async (req, res) => {
  await markMessagesRead(req.user.username, Array.isArray(req.body.messageIds) ? req.body.messageIds : []);
  res.json({ ok: true, unreadMessages: await unreadMessageCount(req.user.username) });
});

app.post('/api/messages/:id/reactions', requireAuth, async (req, res) => {
  try {
    const message = await readMessage(req.params.id);
    if (!message) return res.status(404).json({ message: 'ההודעה לא נמצאה.' });
    const emoji = String(req.body.emoji || '').trim();
    if (!emoji) return res.status(400).json({ message: 'חסר אימוג׳י.' });
    const reactions = await toggleReaction(req.params.id, req.user.username, emoji);
    res.json({ messageId: req.params.id, reactions });
  } catch (error) {
    console.error('Toggle reaction failed:', error);
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: 'שמירת התגובה נכשלה.', error: error.message });
  }
});

// ── Tags ──────────────────────────────────────────────────────────────────────

app.get('/api/tags', requireAuth, async (req, res) => {
  res.json(await listTags());
});

app.post('/api/tags', requireAuth, requireWrite, async (req, res) => {
  const label = String(req.body.label || '').trim();
  const color = String(req.body.color || '#1a56db').trim();
  if (!label) return res.status(400).json({ message: 'חובה להזין שם תגית' });
  const id = req.body.id || uuidv4();
  const tag = await createTag(id, label, color);
  res.status(201).json(tag);
});

app.delete('/api/tags/:id', requireAuth, requireWrite, async (req, res) => {
  await deleteTag(req.params.id);
  res.json({ ok: true });
});

// ── Options (partner_type, partner_category, status) ─────────────────────────

app.get('/api/options/:type', requireAuth, async (req, res) => {
  const allowed = ['partner_type', 'partner_category', 'status', 'project_stage', 'project_label', 'partner_region'];
  if (!allowed.includes(req.params.type)) return res.status(400).json({ message: 'סוג לא תקין' });
  res.json(await listOptions(req.params.type));
});

app.post('/api/options/:type', requireAuth, requireWrite, async (req, res) => {
  const allowed = ['partner_type', 'partner_category', 'status', 'project_stage', 'project_label', 'partner_region'];
  if (!allowed.includes(req.params.type)) return res.status(400).json({ message: 'סוג לא תקין' });
  const label = String(req.body.label || '').trim();
  const color = String(req.body.color || '#1a56db').trim();
  if (!label) return res.status(400).json({ message: 'חובה להזין שם' });
  const id = req.body.id || uuidv4();
  const opt = await createOption(id, req.params.type, label, color, Boolean(req.body.is_default), Number(req.body.sort_order) || 0);
  res.status(201).json(opt);
});

app.delete('/api/options/:type/:id', requireAuth, requireWrite, async (req, res) => {
  await deleteOption(req.params.id);
  res.json({ ok: true });
});

// ── Projects ──────────────────────────────────────────────────────────────────

app.get('/api/projects', requireAuth, async (req, res) => {
  res.json(await listProjects());
});

app.post('/api/projects', requireAuth, requireWrite, async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'חובה להזין כותרת לפרויקט' });
  const project = await createProject(
    uuidv4(), title, req.body.description, req.body.leading_department,
    req.body.field_labels || {}, req.body.activity_year || null,
    req.body.drive_link || null, req.body.attachments || [],
    {
      stage: req.body.stage || '',
      priority: req.body.priority || '',
      owner: req.body.owner || '',
      due_date: req.body.due_date || null,
      start_date: req.body.start_date || null,
      labels: Array.isArray(req.body.labels) ? req.body.labels : [],
    }
  );
  res.status(201).json(project);
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  res.json(project);
});

app.put('/api/projects/:id', requireAuth, requireWrite, async (req, res) => {
  const actor = req.user?.displayName || req.user?.username || '';
  const project = await updateProject(req.params.id, req.body, actor);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  res.json(project);
});

app.delete('/api/projects/:id', requireAuth, requireDelete, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  await deleteProject(req.params.id);
  res.json({ ok: true });
});

app.post('/api/projects/:id/partners', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const partnerId = String(req.body.partnerId || '').trim();
  if (!partnerId) return res.status(400).json({ message: 'חובה לציין partnerId' });
  await addProjectPartner(req.params.id, partnerId, req.body.contactId || null);
  res.status(201).json({ ok: true });
});

app.delete('/api/projects/:id/partners/:partnerId', requireAuth, requireWrite, async (req, res) => {
  await removeProjectPartner(req.params.id, req.params.partnerId);
  res.json({ ok: true });
});

// ── Project tasks ────────────────────────────────────────────────────────────

app.post('/api/projects/:id/tasks', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'חובה להזין כותרת למשימה' });
  const tasks = Array.isArray(project.tasks) ? project.tasks.slice() : [];
  const now = new Date().toISOString();
  tasks.push({
    id: uuidv4(), title, completed: false,
    assignee: req.body.assignee || '',
    due_date: req.body.due_date || null,
    sort_order: tasks.length,
    created_at: now,
  });
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { tasks }, actor);
  res.status(201).json(updated);
});

app.put('/api/projects/:id/tasks/:taskId', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const tasks = Array.isArray(project.tasks) ? project.tasks.slice() : [];
  const idx = tasks.findIndex((t) => t.id === req.params.taskId);
  if (idx < 0) return res.status(404).json({ message: 'משימה לא נמצאה' });
  const allowed = ['title', 'completed', 'assignee', 'due_date', 'sort_order', 'status'];
  const next = { ...tasks[idx] };
  for (const key of allowed) {
    if (req.body[key] !== undefined) next[key] = req.body[key];
  }
  if (req.body.status !== undefined && req.body.completed === undefined) {
    next.completed = req.body.status === 'done';
  }
  if (req.body.completed !== undefined && req.body.status === undefined) {
    next.status = req.body.completed ? 'done' : (tasks[idx].status === 'done' ? 'todo' : tasks[idx].status || 'todo');
  }
  tasks[idx] = next;
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { tasks }, actor);
  // Notify newly-assigned user
  const prevAssignee = (await getProject(req.params.id))?.tasks?.find?.((t) => t.id === req.params.taskId);
  void prevAssignee; // suppress unused (we already have the old value above via tasks[idx])
  const oldAssignee = (project.tasks || []).find((t) => t.id === req.params.taskId)?.assignee || '';
  if (next.assignee && next.assignee !== oldAssignee && next.assignee !== req.user?.username) {
    await createNotification({
      recipient: next.assignee,
      type: 'task_assigned',
      body: `${actor} הקצה לך משימה: "${next.title || 'משימה'}" בפרויקט "${project.title}"`,
      link: `/projects/${req.params.id}`,
    }).catch(() => {});
  }
  res.json(updated);
});

app.delete('/api/projects/:id/tasks/:taskId', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const tasks = (Array.isArray(project.tasks) ? project.tasks : []).filter((t) => t.id !== req.params.taskId);
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { tasks }, actor);
  res.json(updated);
});

// ── Project comments ─────────────────────────────────────────────────────────

app.post('/api/projects/:id/comments', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ message: 'חובה לכתוב תוכן תגובה' });
  const comments = Array.isArray(project.comments) ? project.comments.slice() : [];
  const author = req.user?.displayName || req.user?.username || 'לא ידוע';
  const users = await listUsers(false).catch(() => []);
  const knownNames = new Set(users.map((u) => u.username));
  const mentions = [];
  for (const match of body.matchAll(/@([^\s@,.;:!?]+)/g)) {
    if (knownNames.has(match[1]) && !mentions.includes(match[1])) mentions.push(match[1]);
  }
  comments.push({
    id: uuidv4(),
    author,
    authorUsername: req.user?.username || '',
    body,
    mentions,
    created_at: new Date().toISOString(),
  });
  const updated = await updateProject(req.params.id, { comments }, author);
  // Auto-notify mentioned users (don't notify yourself)
  for (const mention of mentions) {
    if (mention === req.user?.username) continue;
    await createNotification({
      recipient: mention,
      type: 'mention',
      body: `${author} הזכיר אותך בפרויקט "${project.title}"`,
      link: `/projects/${req.params.id}`,
    }).catch(() => {});
  }
  res.status(201).json(updated);
});

app.delete('/api/projects/:id/comments/:commentId', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const username = req.user?.username || '';
  const current = (Array.isArray(project.comments) ? project.comments : []);
  const target = current.find((c) => c.id === req.params.commentId);
  if (!target) return res.status(404).json({ message: 'תגובה לא נמצאה' });
  if (target.authorUsername && target.authorUsername !== username) {
    return res.status(403).json({ message: 'אפשר למחוק רק תגובות שלך' });
  }
  const comments = current.filter((c) => c.id !== req.params.commentId);
  const actor = req.user?.displayName || username;
  const updated = await updateProject(req.params.id, { comments }, actor);
  res.json(updated);
});

// ── Project metrics (impact KPIs) ────────────────────────────────────────────

const METRIC_TYPES = ['input', 'activity', 'output', 'outcome', 'long_term'];

app.post('/api/projects/:id/metrics', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'חובה להזין שם מדד' });
  const type = METRIC_TYPES.includes(req.body.type) ? req.body.type : 'output';
  const metric = {
    id: uuidv4(),
    name,
    type,
    unit: String(req.body.unit || '').trim(),
    target: req.body.target == null || req.body.target === '' ? null : Number(req.body.target),
    baseline: req.body.baseline == null || req.body.baseline === '' ? null : Number(req.body.baseline),
    data_points: [],
    created_at: new Date().toISOString(),
  };
  const metrics = Array.isArray(project.metrics) ? project.metrics.slice() : [];
  metrics.push(metric);
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { metrics }, actor);
  res.status(201).json(updated);
});

app.put('/api/projects/:id/metrics/:metricId', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const metrics = Array.isArray(project.metrics) ? project.metrics.slice() : [];
  const idx = metrics.findIndex((m) => m.id === req.params.metricId);
  if (idx < 0) return res.status(404).json({ message: 'מדד לא נמצא' });
  const next = { ...metrics[idx] };
  if (req.body.name !== undefined) next.name = String(req.body.name).trim();
  if (req.body.type !== undefined && METRIC_TYPES.includes(req.body.type)) next.type = req.body.type;
  if (req.body.unit !== undefined) next.unit = String(req.body.unit).trim();
  if (req.body.target !== undefined) next.target = req.body.target == null || req.body.target === '' ? null : Number(req.body.target);
  if (req.body.baseline !== undefined) next.baseline = req.body.baseline == null || req.body.baseline === '' ? null : Number(req.body.baseline);
  metrics[idx] = next;
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { metrics }, actor);
  res.json(updated);
});

app.delete('/api/projects/:id/metrics/:metricId', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const metrics = (Array.isArray(project.metrics) ? project.metrics : []).filter((m) => m.id !== req.params.metricId);
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { metrics }, actor);
  res.json(updated);
});

app.post('/api/projects/:id/metrics/:metricId/datapoints', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const metrics = Array.isArray(project.metrics) ? project.metrics.slice() : [];
  const idx = metrics.findIndex((m) => m.id === req.params.metricId);
  if (idx < 0) return res.status(404).json({ message: 'מדד לא נמצא' });
  const value = Number(req.body.value);
  if (Number.isNaN(value)) return res.status(400).json({ message: 'ערך לא תקין' });
  const author = req.user?.displayName || req.user?.username || '';
  const dataPoint = {
    id: uuidv4(),
    at: new Date().toISOString(),
    value,
    note: String(req.body.note || '').trim(),
    byDisplay: author,
  };
  const m = { ...metrics[idx], data_points: [...(metrics[idx].data_points || []), dataPoint] };
  metrics[idx] = m;
  const updated = await updateProject(req.params.id, { metrics }, author);
  res.status(201).json(updated);
});

app.delete('/api/projects/:id/metrics/:metricId/datapoints/:dataPointId', requireAuth, requireWrite, async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ message: 'פרויקט לא נמצא' });
  const metrics = Array.isArray(project.metrics) ? project.metrics.slice() : [];
  const idx = metrics.findIndex((m) => m.id === req.params.metricId);
  if (idx < 0) return res.status(404).json({ message: 'מדד לא נמצא' });
  metrics[idx] = {
    ...metrics[idx],
    data_points: (metrics[idx].data_points || []).filter((d) => d.id !== req.params.dataPointId),
  };
  const actor = req.user?.displayName || req.user?.username || '';
  const updated = await updateProject(req.params.id, { metrics }, actor);
  res.json(updated);
});

// ── Partner → projects ───────────────────────────────────────────────────────

app.get('/api/partners/:id/projects', requireAuth, async (req, res) => {
  res.json(await listProjectsForPartner(req.params.id));
});

// ── Representations (נציגויות ההתאחדות) ───────────────────────────────────

app.get('/api/representations', requireAuth, async (req, res) => {
  res.json(await listRepresentations());
});

app.post('/api/representations', requireAuth, requireWrite, async (req, res) => {
  const created = await createRepresentation(req.body || {});
  res.status(201).json(created);
});

app.put('/api/representations/:id', requireAuth, requireWrite, async (req, res) => {
  const updated = await updateRepresentation(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ message: 'נציגות לא נמצאה' });
  res.json(updated);
});

app.delete('/api/representations/:id', requireAuth, requireDelete, async (req, res) => {
  await deleteRepresentation(req.params.id);
  res.json({ ok: true });
});

// ── Finance (תנועות כספיות + התחייבויות עתידיות) ──────────────────────────

app.get('/api/finance/entries', requireAuth, async (req, res) => {
  const filter = {};
  if (req.query.partnerId) filter.partnerId = String(req.query.partnerId);
  if (req.query.projectId) filter.projectId = String(req.query.projectId);
  if (req.query.status)    filter.status    = String(req.query.status);
  if (req.query.kind)      filter.kind      = String(req.query.kind);
  res.json(await listFinanceEntries(filter));
});

app.get('/api/finance/summary', requireAuth, async (req, res) => {
  const partnerId = req.query.partnerId ? String(req.query.partnerId) : null;
  const list = await listFinanceEntries(partnerId ? { partnerId } : {});
  res.json(summarizeFinance(list));
});

app.get('/api/finance/per-partner', requireAuth, async (req, res) => {
  res.json(await summarizeFinancePerPartner());
});

app.post('/api/finance/entries', requireAuth, requireWrite, async (req, res) => {
  try {
    const created = await createFinanceEntry(req.body || {}, req.user?.displayName || req.user?.username || '');
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ message: err.message || 'יצירה נכשלה' });
  }
});

app.put('/api/finance/entries/:id', requireAuth, requireWrite, async (req, res) => {
  const updated = await updateFinanceEntry(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ message: 'תנועה לא נמצאה' });
  res.json(updated);
});

app.delete('/api/finance/entries/:id', requireAuth, requireDelete, async (req, res) => {
  await deleteFinanceEntry(req.params.id);
  res.json({ ok: true });
});


// ── Notifications ────────────────────────────────────────────────────────────

app.get('/api/notifications', requireAuth, async (req, res) => {
  const rows = await listNotificationsForUser(req.user.username, 50);
  res.json(rows);
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  await markNotificationRead(req.params.id, req.user.username);
  res.json({ ok: true });
});

app.post('/api/notifications/mark-all-read', requireAuth, async (req, res) => {
  await markAllNotificationsRead(req.user.username);
  res.json({ ok: true });
});

// ── Project templates ────────────────────────────────────────────────────────

app.get('/api/projects/templates', requireAuth, async (req, res) => {
  res.json(await listProjectTemplates());
});

app.post('/api/projects/from-template/:templateId', requireAuth, requireWrite, async (req, res) => {
  const cloned = await cloneProjectFromTemplate(req.params.templateId, req.body || {});
  if (!cloned) return res.status(404).json({ message: 'התבנית לא נמצאה' });
  res.status(201).json(cloned);
});

// ── Bulk operations ──────────────────────────────────────────────────────────

const runBulk = async (req, res, kind) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const action = String(req.body.action || '');
  const payload = req.body.payload || {};
  if (ids.length === 0) return res.status(400).json({ message: 'בחר לפחות פריט אחד' });
  const results = { ok: [], failed: [] };
  const actor = req.user?.displayName || req.user?.username || '';
  for (const id of ids) {
    try {
      if (kind === 'partner') {
        if (action === 'set_status') {
          await updatePartner(id, { status: payload.status, lastModifiedBy: actor, lastModifiedAt: new Date().toISOString() });
        } else if (action === 'add_tag') {
          const p = await readPartner(id);
          if (!p) throw new Error('not found');
          const tags = [...(p.tags || [])];
          if (payload.tag && !tags.some((t) => t.label === payload.tag.label)) tags.push(payload.tag);
          await updatePartner(id, { tags, lastModifiedBy: actor, lastModifiedAt: new Date().toISOString() });
        } else if (action === 'delete') {
          if (req.user.role !== 'admin') throw new Error('forbidden');
          await deletePartner(id);
        } else {
          throw new Error('unknown action');
        }
      } else if (kind === 'project') {
        if (action === 'set_stage') {
          await updateProject(id, { stage: payload.stage }, actor);
        } else if (action === 'set_status') {
          await updateProject(id, { status: payload.status }, actor);
        } else if (action === 'delete') {
          if (req.user.role !== 'admin') throw new Error('forbidden');
          await deleteProject(id);
        } else {
          throw new Error('unknown action');
        }
      }
      results.ok.push(id);
    } catch (err) {
      results.failed.push({ id, message: err.message });
    }
  }
  res.json(results);
};

app.post('/api/partners/bulk', requireAuth, requireWrite, (req, res) => runBulk(req, res, 'partner'));
app.post('/api/projects/bulk', requireAuth, requireWrite, (req, res) => runBulk(req, res, 'project'));

// ─────────────────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Unhandled API error:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
