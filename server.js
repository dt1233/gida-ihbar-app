const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
let marked;

const app = express();
const PORT = process.env.PORT || 5175;

// Paths
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads'); // kept for local/dev, not used on Cloudinary
const DATA_DIR = path.join(ROOT, 'data');
const SCENARIO_MD = path.join(ROOT, 'scenario.md');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');

// In-memory app state (persisted to Cloudinary raw)
let appState = { scenario: '', announcements: [] };

async function uploadRawJsonToCloudinary(jsonObj) {
  const payload = Buffer.from(JSON.stringify(jsonObj, null, 2), 'utf8');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', public_id: `${CLD_FOLDER}/app_state.json`, overwrite: true },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(payload);
  });
}

async function downloadRawJsonFromCloudinary() {
  try {
    const resMeta = await cloudinary.api.resource(`${CLD_FOLDER}/app_state.json`, { resource_type: 'raw' });
    const url = resMeta.secure_url;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function loadState() {
  // Try Cloudinary first
  const cloud = await downloadRawJsonFromCloudinary();
  if (cloud && typeof cloud === 'object') {
    appState = { scenario: String(cloud.scenario || ''), announcements: Array.isArray(cloud.announcements) ? cloud.announcements : [] };
    return;
  }
  // Fallback: local files
  try {
    const md = fs.existsSync(SCENARIO_MD) ? await fs.promises.readFile(SCENARIO_MD, 'utf8') : '';
    const annRaw = fs.existsSync(ANNOUNCEMENTS_FILE) ? await fs.promises.readFile(ANNOUNCEMENTS_FILE, 'utf8') : '{"items":[]}';
    const ann = JSON.parse(annRaw || '{"items":[]}');
    appState = { scenario: md || '', announcements: ann.items || [] };
  } catch {
    appState = { scenario: '', announcements: [] };
  }
}

async function saveState() {
  try {
    await uploadRawJsonToCloudinary({ scenario: appState.scenario || '', announcements: appState.announcements || [] });
  } catch (_) { /* ignore */ }
  // Best-effort: also write locally
  try {
    await fs.promises.writeFile(SCENARIO_MD, String(appState.scenario || ''), 'utf8');
    await fs.promises.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify({ items: appState.announcements || [] }, null, 2), 'utf8');
  } catch (_) {}
}

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

// Cloudinary config
// Prefer CLOUDINARY_URL. Alternatively use CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}
const CLD_FOLDER = process.env.CLOUDINARY_FOLDER || 'gida-ihbar';

// Multer (memory) -> upload to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Public APIs
app.get('/api/images', async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression(`folder:${CLD_FOLDER}`)
      .sort_by('created_at','desc')
      .max_results(100)
      .execute();
    const images = (result.resources || []).map(r => ({
      name: r.public_id, // use public_id as name for delete lookup
      url: r.secure_url,
    }));
    res.json({ images });
  } catch (e) { res.status(500).json({ error: 'Resimler listelenemedi', details: String(e) }); }
});

app.get('/api/scenario', async (req, res) => {
  try {
    if (!marked) marked = require('marked');
    const html = marked.parse(appState.scenario || '');
    res.json({ scenario: html, html: true });
  } catch (e) { res.status(500).json({ error: 'Senaryo okunamadı', details: String(e) }); }
});

app.get('/api/announcements', async (req, res) => {
  try {
    res.json({ items: appState.announcements || [] });
  } catch (e) { res.status(500).json({ error: 'Duyurular okunamadı', details: String(e) }); }
});

// Admin APIs
app.post('/api/admin/upload', requireAuth, upload.array('images', 20), async (req, res) => {
  const out = [];
  try {
    for (const f of (req.files || [])) {
      const uploadRes = await cloudinary.uploader.upload_stream({ folder: CLD_FOLDER, resource_type: 'image' }, (err, result) => {
        if (err) throw err;
      });
    }
  } catch (e) {
    // Fallback streaming implementation (since upload_stream needs piping)
  }
  try {
    // Proper upload using promise wrapper
    async function uploadBuffer(buf, filename){
      return new Promise((resolve, reject)=>{
        const stream = cloudinary.uploader.upload_stream({ folder: CLD_FOLDER, resource_type: 'image', filename_override: filename, use_filename: true, unique_filename: true }, (err, result)=>{
          if (err) return reject(err);
          resolve(result);
        });
        stream.end(buf);
      });
    }
    for (const f of (req.files || [])) {
      const r = await uploadBuffer(f.buffer, f.originalname);
      out.push({ name: r.public_id, url: r.secure_url });
    }
    if (out.length > 0) {
      appState.announcements = appState.announcements || [];
      appState.announcements.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'upload', message: `${out.length} yeni görsel yüklendi.`, by: req.session?.user || 'Admin' });
      await saveState();
    }
    res.json({ ok: true, count: out.length, files: out });
  } catch (e) {
    res.status(500).json({ error: 'Yükleme hatası', details: String(e) });
  }
});

app.delete('/api/admin/images/:name', requireAuth, async (req, res) => {
  try {
    const publicId = decodeURIComponent(req.params.name || '');
    if (!publicId) return res.status(400).json({ error: 'Geçersiz id' });
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    appState.announcements = appState.announcements || [];
    appState.announcements.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'delete', message: `Görsel silindi: ${publicId}` , by: req.session?.user || 'Admin'});
    await saveState();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Silinemedi', details: String(e) }); }
});

app.get('/api/admin/scenario-md', requireAuth, async (req, res) => {
  try { res.json({ content: appState.scenario || '' }); }
  catch (e) { res.status(500).json({ error: 'Okunamadı', details: String(e) }); }
});

app.post('/api/admin/scenario-md', requireAuth, async (req, res) => {
  try {
    const { content } = req.body || {};
    appState.scenario = String(content || '');
    appState.announcements = appState.announcements || [];
    appState.announcements.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'scenario', message: 'Senaryo güncellendi.', by: req.session?.user || 'Admin' });
    await saveState();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Yazılamadı', details: String(e) }); }
});

app.post('/api/admin/announcements', requireAuth, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Boş mesaj' });
    appState.announcements = appState.announcements || [];
    appState.announcements.unshift({ id: Date.now(), ts: new Date().toISOString(), type: 'notice', message: String(message), by: req.session?.user || 'Admin' });
    await saveState();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Duyuru eklenemedi', details: String(e) }); }
});

// Delete announcement by id
app.delete('/api/admin/announcements/:id', requireAuth, async (req, res) => {
  try {
    const idRaw = req.params.id;
    const idNum = Number(idRaw);
    if (!idRaw || Number.isNaN(idNum)) return res.status(400).json({ error: 'Geçersiz id' });
    const before = (appState.announcements || []).length;
    appState.announcements = (appState.announcements || []).filter(a => Number(a.id) !== idNum);
    const after = appState.announcements.length;
    await saveState();
    res.json({ ok: true, removed: before - after });
  } catch (e) { res.status(500).json({ error: 'Duyuru silinemedi', details: String(e) }); }
});

// Fallback -> index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Initialize state then start server
(async () => {
  await loadState();
  app.listen(PORT, () => console.log(`Gida Ihbar app listening on http://localhost:${PORT}`));
})();
