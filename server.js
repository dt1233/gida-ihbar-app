const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
let marked;

const app = express();
const PORT = process.env.PORT || 5175;

// Paths
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const SCENARIO_MD = path.join(ROOT, 'scenario.md');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');

// Ensure dirs/files
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCENARIO_MD)) fs.writeFileSync(SCENARIO_MD, '# Senaryo\n\nBu metni admin panelinden düzenleyin.');
if (!fs.existsSync(ANNOUNCEMENTS_FILE)) fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify({ items: [] }, null, 2));

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

// Sessions & Auth
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-' + nanoid(16);
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
// Default password handling with Turkish 'ı' variant
const DEFAULT_PASS_TR = 'admingıdaihbar';
const DEFAULT_PASS_EN = 'admingidaihbar';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || bcrypt.hashSync(DEFAULT_PASS_TR, 10); // primary default
const ADMIN_PASS_HASH_ALT = bcrypt.hashSync(DEFAULT_PASS_EN, 10); // alt default for keyboard variant

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.user === ADMIN_USER) return next();
  return res.status(401).json({ error: 'Yetkisiz' });
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Eksik bilgi' });
  const okUser = username === ADMIN_USER;
  let okPass = await bcrypt.compare(password, ADMIN_PASS_HASH);
  if (!okPass) {
    // Also accept the ASCII 'i' variant if user typed without Turkish 'ı'
    okPass = await bcrypt.compare(password, ADMIN_PASS_HASH_ALT);
  }
  if (!okUser || !okPass) return res.status(401).json({ error: 'Geçersiz kimlik' });
  req.session.user = ADMIN_USER;
  res.json({ ok: true, user: ADMIN_USER });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.user === ADMIN_USER), user: req.session?.user || null });
});

// Static
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

// Serve admin via clean path
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Public APIs
app.get('/api/images', async (req, res) => {
  try {
    const files = await fs.promises.readdir(UPLOAD_DIR);
    const images = files.filter(f => !f.startsWith('.')).map(f => ({ name: f, url: `/uploads/${encodeURIComponent(f)}` })).sort((a,b)=>a.name<b.name?1:-1);
    res.json({ images });
  } catch (e) { res.status(500).json({ error: 'Resimler listelenemedi', details: String(e) }); }
});

app.get('/api/scenario', async (req, res) => {
  try {
    if (!marked) marked = require('marked');
    const md = await fs.promises.readFile(SCENARIO_MD, 'utf8');
    const html = marked.parse(md || '');
    res.json({ scenario: html, html: true });
  } catch (e) { res.status(500).json({ error: 'Senaryo okunamadı', details: String(e) }); }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const raw = await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{"items":[]}');
    res.json({ items: data.items || [] });
  } catch (e) { res.status(500).json({ error: 'Duyurular okunamadı', details: String(e) }); }
});

// Admin APIs
app.post('/api/admin/upload', requireAuth, upload.array('images', 20), async (req, res) => {
  const count = req.files?.length || 0;
  const files = (req.files || []).map(f => ({ name: f.filename, url: `/uploads/${encodeURIComponent(f.filename)}` }));
  try {
    if (count > 0) {
      const raw = await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8');
      const data = JSON.parse(raw || '{"items":[]}');
      data.items = data.items || [];
      data.items.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'upload', message: `${count} yeni görsel yüklendi.`, by: req.session?.user || 'Admin' });
      await fs.promises.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (_) {}
  res.json({ ok: true, count, files });
});

app.delete('/api/admin/images/:name', requireAuth, async (req, res) => {
  try {
    const fname = req.params.name || '';
    if (!fname || fname.includes('/') || fname.includes('..')) return res.status(400).json({ error: 'Geçersiz ad' });
    const fpath = path.join(UPLOAD_DIR, fname);
    await fs.promises.unlink(fpath);
    // announcement
    const raw = await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{"items":[]}');
    data.items = data.items || [];
    data.items.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'delete', message: `Görsel silindi: ${fname}` , by: req.session?.user || 'Admin'});
    await fs.promises.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Silinemedi', details: String(e) }); }
});

app.get('/api/admin/scenario-md', requireAuth, async (req, res) => {
  try { const md = await fs.promises.readFile(SCENARIO_MD, 'utf8'); res.json({ content: md }); }
  catch (e) { res.status(500).json({ error: 'Okunamadı', details: String(e) }); }
});

app.post('/api/admin/scenario-md', requireAuth, async (req, res) => {
  try {
    const { content } = req.body || {};
    await fs.promises.writeFile(SCENARIO_MD, String(content || ''), 'utf8');
    // announcement
    const raw = await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{"items":[]}');
    data.items.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'scenario', message: 'Senaryo güncellendi.', by: req.session?.user || 'Admin' });
    await fs.promises.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Yazılamadı', details: String(e) }); }
});

app.post('/api/admin/announcements', requireAuth, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Boş mesaj' });
    const raw = await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{"items":[]}');
    data.items = data.items || [];
    data.items.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'notice', message: String(message), by: req.session?.user || 'Admin' });
    await fs.promises.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Duyuru eklenemedi', details: String(e) }); }
});

// Delete announcement by id
app.delete('/api/admin/announcements/:id', requireAuth, async (req, res) => {
  try {
    const idRaw = req.params.id;
    const idNum = Number(idRaw);
    if (!idRaw || Number.isNaN(idNum)) return res.status(400).json({ error: 'Geçersiz id' });
    const raw = await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{"items":[]}');
    const before = (data.items || []).length;
    data.items = (data.items || []).filter(a => Number(a.id) !== idNum);
    const after = data.items.length;
    await fs.promises.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, removed: before - after });
  } catch (e) { res.status(500).json({ error: 'Duyuru silinemedi', details: String(e) }); }
});

// Fallback -> index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => console.log(`Gida Ihbar app listening on http://localhost:${PORT}`));
