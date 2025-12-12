const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { logger, httpLogger } = require('./logger');
require('dotenv').config({ path: '.env.production' });
const axios = require('axios');

// Security: Validate required environment variables
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
      

if (!WEBHOOK_SECRET) {
  logger.error('WEBHOOK_SECRET not set! Please set it in .env.production before starting.');
  logger.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const app = express();
const PORT = process.env.API_PORT || 3008;
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'courses.db');
// Configure `trust proxy` from env to avoid permissive defaults.
// By default we do NOT trust proxies (safer for rate-limiting).
// Set `TRUST_PROXY` env to 'true', 'false', a number, or an address list when behind a reverse proxy.
let trustProxyValue = false;
if (process.env.TRUST_PROXY !== undefined) {
  const v = process.env.TRUST_PROXY;
  if (v === 'true') trustProxyValue = true;
  else if (v === 'false') trustProxyValue = false;
  else if (!Number.isNaN(Number(v))) trustProxyValue = Number(v);
  else trustProxyValue = v; // allow string like 'loopback' or a comma-separated list
}
app.set('trust proxy', trustProxyValue);
// Middleware
// Security: Lock down CORS to specific origins
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://virtual-counselor.org', 'https://n8n.virtual-counselor.org']
  : ['http://localhost:3007', 'http://localhost:3009'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security: Add helmet for secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for API responses
}));

// Security: Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 100) || 5 * 60 * 1000, // 5 minutes
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 100) || 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security: Stricter rate limiting for webhooks (tunable via env vars)
const webhookLimiter = rateLimit({
  windowMs: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 1 minute
  // Default bumped for internal scrapes; reduce in production if exposed publicly
  max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX, 10) || 200,
  message: { error: 'Too many webhook calls, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/', apiLimiter);

// Webhook rate limiting can be disabled by setting WEBHOOK_RATE_LIMIT_MAX=0
if (parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX, 10) === 0) {
  console.log('⚠️ Webhook rate limiting DISABLED via WEBHOOK_RATE_LIMIT_MAX=0');
} else {
  app.use('/webhook/', webhookLimiter);
}

// Payload size: increased to allow large batch posts from n8n (tunable via env)
app.use(express.json({ limit: process.env.EXPRESS_JSON_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.EXPRESS_JSON_LIMIT || '50mb' }));

// Structured HTTP logging middleware
app.use(httpLogger);

// Security: Webhook authentication middleware
const webhookAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    logger.warn('Webhook request rejected: Missing Authorization header', { meta: { ip: req.ip, path: req.path } });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing Authorization header'
    });
  }

  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    logger.warn('Webhook request rejected: Invalid credentials', { meta: { ip: req.ip, path: req.path } });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid credentials'
    });
  }

  // Authentication successful
  next();
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================
// DATABASE SETUP
// ============================================

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error('Error opening database', { meta: { error: err.message, path: DB_PATH } });
    process.exit(1);
  }
  logger.info(`Connected to SQLite database: ${DB_PATH}`);
});

// Enable WAL mode for better concurrent access
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 5000'); // Wait up to 5 seconds for locks

// Create tables
db.serialize(() => {
  // Main courses table
  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueId TEXT UNIQUE NOT NULL,
      campus TEXT NOT NULL,
      term TEXT NOT NULL,
      year INTEGER NOT NULL,
      prefix TEXT NOT NULL,
      subject TEXT,
      courseNumber TEXT NOT NULL,
      sectionNumber TEXT NOT NULL,
      isLab BOOLEAN NOT NULL,
      title TEXT,
      sectionTitle TEXT,
      credits TEXT,
      instructor TEXT,
      sln INTEGER,

      -- Course details
      courseDescription TEXT,
      coursePrerequisite TEXT,
      sectionComment TEXT,
      sectionUrl TEXT,
      dayTime TEXT,
      location TEXT,
      site TEXT,
      startDate TEXT,
      endDate TEXT,

      -- Enrollment data (updated hourly)
      seatsAvailable INTEGER,
      maxEnrollment INTEGER,
      currentEnrollment INTEGER,
      waitlistAvailable INTEGER,
      waitlistCapacity INTEGER,
      waitlistCount INTEGER,
      status TEXT,

      -- Important dates
      dateLastAuditToCredit TEXT,
      dateLastCreditToAudit TEXT,
      dateLastFinalGradeSubmit TEXT,
      dateLastInstruction TEXT,
      dateLastLtrGradeToPf TEXT,
      dateLastPftoLtrGrade TEXT,
      dateLastRegWithoutFee TEXT,
      dateLastStdAdd TEXT,
      dateLastStdDrop TEXT,
      dateLastWdrwl TEXT,
      dateRegBegin TEXT,
      dateRegEnd TEXT,

      -- Course attributes
      slnrestrict BOOLEAN,
      ger TEXT,
      diversity BOOLEAN,
      writing BOOLEAN,
      courseFee REAL,
      isMultipleFees BOOLEAN,
      titleAllowed BOOLEAN,
      showInstructors BOOLEAN,
      ucore TEXT,
      coop TEXT,
      schedulePrint TEXT,
      instructionMode TEXT,
      session TEXT,
      consent TEXT,
      minUnits TEXT,
      maxUnits TEXT,
      gradCaps TEXT,
      footnotes TEXT,

      -- Complex data as JSON
      instructors TEXT,
      meetings TEXT,

      -- Metadata
      scrapedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      -- Additional fields (stored as JSON for flexibility)
      additionalData TEXT
    )
  `);

  // Enrollment history (time-series data)
  db.run(`
    CREATE TABLE IF NOT EXISTS enrollment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseId INTEGER NOT NULL,
      uniqueId TEXT NOT NULL,
      seatsAvailable INTEGER,
      currentEnrollment INTEGER,
      waitlistCount INTEGER,
      scrapedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (courseId) REFERENCES courses(id)
    )
  `);

  // ============================================
  // HISTORICAL CATALOG DATA TABLES
  // These store degree requirements by catalog year
  // so students can see their exact requirements from when they started
  // ============================================

  // Departments table (historical - by catalog year)
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueId TEXT UNIQUE NOT NULL,
      catalogYear TEXT NOT NULL,
      academicUnitId INTEGER,
      name TEXT NOT NULL,
      title TEXT,
      fullName TEXT,
      url TEXT,
      location TEXT,
      phone TEXT,
      facultyList TEXT,
      description TEXT,
      sourceType TEXT DEFAULT 'api',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Degree Programs table (historical - by catalog year)
  db.run(`
    CREATE TABLE IF NOT EXISTS degree_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueId TEXT UNIQUE NOT NULL,
      catalogYear TEXT NOT NULL,
      departmentId INTEGER,
      externalId INTEGER,
      title TEXT NOT NULL,
      hours INTEGER,
      narrative TEXT,
      bottomText TEXT,
      isHonors BOOLEAN DEFAULT 0,
      isFYDA BOOLEAN DEFAULT 0,
      yearFormat TEXT,
      yearEnd TEXT,
      termEnd TEXT,
      sequenceItems TEXT,
      sourceType TEXT DEFAULT 'api',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (departmentId) REFERENCES departments(id)
    )
  `);

  // Minors table (historical - by catalog year)
  db.run(`
    CREATE TABLE IF NOT EXISTS minors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueId TEXT UNIQUE NOT NULL,
      catalogYear TEXT NOT NULL,
      departmentId INTEGER,
      externalId INTEGER,
      title TEXT NOT NULL,
      narrative TEXT,
      yearEnd TEXT,
      termEnd TEXT,
      sourceType TEXT DEFAULT 'api',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (departmentId) REFERENCES departments(id)
    )
  `);

  // Certificates table (historical - by catalog year)
  db.run(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueId TEXT UNIQUE NOT NULL,
      catalogYear TEXT NOT NULL,
      departmentId INTEGER,
      externalId INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      sourceType TEXT DEFAULT 'api',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (departmentId) REFERENCES departments(id)
    )
  `);

  // Legacy degrees table (keeping for backwards compatibility)
  db.run(`
    CREATE TABLE IF NOT EXISTS degrees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      degreeType TEXT,
      type TEXT NOT NULL,
      year INTEGER NOT NULL,
      catalogType TEXT,
      college TEXT,
      totalCredits INTEGER,
      sourceUrl TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Archived Catalog PDFs table (metadata + optional blob)
  db.run(`
    CREATE TABLE IF NOT EXISTS catalog_pdfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      catalogYear TEXT NOT NULL,
      description TEXT,
      fileSize INTEGER,
      filePath TEXT,
      pdfData BLOB,
      mimeType TEXT DEFAULT 'application/pdf',
      parsedAt TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for fast queries - HISTORICAL DATA
  db.run('CREATE INDEX IF NOT EXISTS idx_departments_year ON departments(catalogYear)');
  db.run('CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name)');
  db.run('CREATE INDEX IF NOT EXISTS idx_degree_programs_year ON degree_programs(catalogYear)');
  db.run('CREATE INDEX IF NOT EXISTS idx_degree_programs_dept ON degree_programs(departmentId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_degree_programs_title ON degree_programs(title)');
  db.run('CREATE INDEX IF NOT EXISTS idx_minors_year ON minors(catalogYear)');
  db.run('CREATE INDEX IF NOT EXISTS idx_minors_dept ON minors(departmentId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_certificates_year ON certificates(catalogYear)');
  db.run('CREATE INDEX IF NOT EXISTS idx_certificates_dept ON certificates(departmentId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_catalog_pdfs_year ON catalog_pdfs(catalogYear)');
  db.run('CREATE INDEX IF NOT EXISTS idx_courses_uniqueId ON courses(uniqueId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(campus, term, year)');
  db.run('CREATE INDEX IF NOT EXISTS idx_courses_prefix ON courses(prefix, courseNumber)');
  db.run('CREATE INDEX IF NOT EXISTS idx_courses_seats ON courses(seatsAvailable)');
  db.run('CREATE INDEX IF NOT EXISTS idx_enrollment_history_course ON enrollment_history(courseId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_enrollment_history_scraped ON enrollment_history(scrapedAt)');

  // Add external_id column for WSU API degree IDs (migration)
  db.run('ALTER TABLE catalog_degrees ADD COLUMN external_id TEXT', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Warning: Could not add external_id column:', err.message);
    } else if (!err) {
      console.log('✅ Added external_id column to catalog_degrees');
    }
  });
  
  // Create table for degree course requirements (sequenceItems from WSU API)
  db.run(`
    CREATE TABLE IF NOT EXISTS degree_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      degree_id INTEGER NOT NULL,
      catalog_year TEXT NOT NULL,
      year INTEGER NOT NULL,
      term INTEGER NOT NULL,
      label TEXT,
      hours TEXT,
      sort_order INTEGER,
      footnotes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (degree_id) REFERENCES catalog_degrees(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Warning: Could not create degree_requirements table:', err.message);
    }
  });
  
  db.run('CREATE INDEX IF NOT EXISTS idx_degree_requirements_degree ON degree_requirements(degree_id)', (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Warning: Could not create index on degree_requirements:', err.message);
    }
  });

  // Catalog courses table (courses referenced in degree/program catalogs, separate from live `courses` table)
  db.run(`
    CREATE TABLE IF NOT EXISTS catalog_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_id TEXT NOT NULL,
      catalog_year TEXT NOT NULL,
      code TEXT,
      prefix TEXT,
      number TEXT,
      title TEXT,
      description TEXT,
      credits REAL,
      credits_phrase TEXT,
      ucore TEXT,
      prerequisite_raw TEXT,
      prerequisite_codes TEXT,
      offered_raw TEXT,
      offered_terms TEXT,
      attributes TEXT,
      footnotes TEXT,
      alternatives TEXT,
      is_non_credit BOOLEAN DEFAULT 0,
      source_type TEXT DEFAULT 'api',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Warning: Could not create catalog_courses table:', err.message);
  });

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_courses_unique ON catalog_courses(unique_id, catalog_year)');
  db.run('CREATE INDEX IF NOT EXISTS idx_catalog_courses_code ON catalog_courses(code)');

  // Catalog minors table (historical data with narratives)
  db.run(`
    CREATE TABLE IF NOT EXISTS catalog_minors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      catalog_year TEXT NOT NULL,
      url TEXT,
      source_type TEXT DEFAULT 'api',
      narrative TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, catalog_year)
    )
  `, (err) => {
    if (err) console.error('Warning: Could not create catalog_minors table:', err.message);
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_catalog_minors_year ON catalog_minors(catalog_year)');
  db.run('CREATE INDEX IF NOT EXISTS idx_catalog_minors_name ON catalog_minors(name)');

  // Catalog certificates table (historical data with descriptions)
  db.run(`
    CREATE TABLE IF NOT EXISTS catalog_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      catalog_year TEXT NOT NULL,
      url TEXT,
      source_type TEXT DEFAULT 'api',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, catalog_year)
    )
  `, (err) => {
    if (err) console.error('Warning: Could not create catalog_certificates table:', err.message);
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_catalog_certificates_year ON catalog_certificates(catalog_year)');
  db.run('CREATE INDEX IF NOT EXISTS idx_catalog_certificates_name ON catalog_certificates(name)');

  // Add courses columns if they don't exist (for existing databases)
  db.run('ALTER TABLE catalog_minors ADD COLUMN courses TEXT', () => {});
  db.run('ALTER TABLE catalog_minors ADD COLUMN required_courses TEXT', () => {});
  db.run('ALTER TABLE catalog_minors ADD COLUMN elective_courses TEXT', () => {});
  db.run('ALTER TABLE catalog_certificates ADD COLUMN courses TEXT', () => {});
  db.run('ALTER TABLE catalog_certificates ADD COLUMN required_courses TEXT', () => {});
  db.run('ALTER TABLE catalog_certificates ADD COLUMN elective_courses TEXT', () => {});

  console.log('✅ Database tables created/verified');
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Promisify database operations
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Transaction lock to prevent concurrent transactions (SQLite limitation)
let transactionLock = Promise.resolve();
let isInTransaction = false;

// Execute a function within a database transaction
// Automatically commits on success or rolls back on error
// Uses a lock to serialize concurrent transaction requests
async function withTransaction(callback) {
  // Wait for any pending transaction to complete
  const previousLock = transactionLock;
  let releaseLock;
  transactionLock = new Promise(resolve => { releaseLock = resolve; });

  await previousLock;

  if (isInTransaction) {
    // Already in a transaction, just run the callback without wrapping
    releaseLock();
    return callback();
  }

  isInTransaction = true;
  try {
    await dbRun('BEGIN IMMEDIATE');
    const result = await callback();
    await dbRun('COMMIT');
    return result;
  } catch (error) {
    try {
      await dbRun('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Rollback failed', { meta: { error: rollbackErr.message } });
    }
    throw error;
  } finally {
    isInTransaction = false;
    releaseLock();
  }
}

// Standardized error response helpers
function sendError(res, statusCode, message, details = null) {
  const response = {
    status: 'error',
    message: message
  };
  if (details) {
    response.details = details;
  }
  return res.status(statusCode).json(response);
}

function sendBadRequest(res, message, details = null) {
  return sendError(res, 400, message, details);
}

function sendUnauthorized(res, message = 'Unauthorized') {
  return sendError(res, 401, message);
}

function sendNotFound(res, message = 'Resource not found') {
  return sendError(res, 404, message);
}

function sendServerError(res, error) {
  console.error('Server error:', error);
  return sendError(res, 500, 'Internal server error', error.message);
}

// Transaction wrapper - alias for withTransaction (uses same lock)
async function runInTransaction(callback) {
  return withTransaction(callback);
}

// ============================================
// AUTO-IMPORT HISTORICAL CATALOG DATA
// ============================================

// Import historical catalog minors/certificates from parsed PDF JSON files
// Only runs once if the data isn't already populated
async function importHistoricalCatalogData() {
  const catalogDir = path.join(__dirname, 'pdf-archieved-catalog');

  // Check if catalog directory exists
  if (!fs.existsSync(catalogDir)) {
    console.log('📁 No pdf-archieved-catalog directory found, skipping historical import');
    return;
  }

  try {
    // Check if historical data already exists with narratives/descriptions
    const minorCheck = await dbGet(
      'SELECT COUNT(*) as count FROM catalog_minors WHERE narrative IS NOT NULL AND narrative != ""'
    );
    const certCheck = await dbGet(
      'SELECT COUNT(*) as count FROM catalog_certificates WHERE description IS NOT NULL AND description != ""'
    );

    // If we already have substantial data, skip import
    if ((minorCheck?.count || 0) > 100 && (certCheck?.count || 0) > 50) {
      console.log(`📚 Historical catalog data already populated (${minorCheck.count} minors, ${certCheck.count} certificates with narratives)`);
      return;
    }

    console.log('📚 Importing historical catalog data from PDF archives...');

    // Find all parsed JSON files
    const jsonFiles = fs.readdirSync(catalogDir)
      .filter(f => f.endsWith('-parsed.json'))
      .sort();

    if (jsonFiles.length === 0) {
      console.log('  No -parsed.json files found in pdf-archieved-catalog');
      return;
    }

    let totalMinors = 0;
    let totalCerts = 0;

    for (const jsonFile of jsonFiles) {
      const year = jsonFile.match(/(\d{4})/)?.[1];
      if (!year) continue;

      const filePath = path.join(catalogDir, jsonFile);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Import minors (with extracted courses)
      for (const minor of (data.minors || [])) {
        try {
          await dbRun(`
            INSERT OR REPLACE INTO catalog_minors
            (name, catalog_year, url, source_type, narrative, courses, required_courses, elective_courses)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            minor.name,
            year,
            null,
            'pdf',
            minor.narrative || null,
            JSON.stringify(minor.courses || []),
            JSON.stringify(minor.requiredCourses || []),
            JSON.stringify(minor.electiveCourses || [])
          ]);
          totalMinors++;
        } catch (err) {
          // Ignore duplicate errors
        }
      }

      // Import certificates (with extracted courses)
      for (const cert of (data.certificates || [])) {
        try {
          await dbRun(`
            INSERT OR REPLACE INTO catalog_certificates
            (name, catalog_year, url, source_type, description, courses, required_courses, elective_courses)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            cert.name,
            year,
            null,
            'pdf',
            cert.description || null,
            JSON.stringify(cert.courses || []),
            JSON.stringify(cert.requiredCourses || []),
            JSON.stringify(cert.electiveCourses || [])
          ]);
          totalCerts++;
        } catch (err) {
          // Ignore duplicate errors
        }
      }
    }

    console.log(`  ✅ Imported ${totalMinors} minors and ${totalCerts} certificates from ${jsonFiles.length} catalog years`);
  } catch (err) {
    console.error('  ⚠️ Error importing historical catalog data:', err.message);
  }
}

// Run import after a short delay to ensure tables are created
setTimeout(() => {
  importHistoricalCatalogData().catch(err => {
    console.error('Failed to import historical catalog data:', err);
  });
}, 2000);

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/health', async (req, res) => {
  try {
    const stats = await dbGet('SELECT COUNT(*) as count FROM courses');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      totalCourses: stats.count
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [total, byCampus, byTerm, topPrefixes] = await Promise.all([
      dbGet('SELECT COUNT(*) as count FROM courses'),
      dbAll(`
        SELECT campus, COUNT(*) as count
        FROM courses
        GROUP BY campus
        ORDER BY count DESC
      `),
      dbAll(`
        SELECT term, COUNT(*) as count
        FROM courses
        GROUP BY term
        ORDER BY count DESC
      `),
      dbAll(`
        SELECT prefix, COUNT(*) as count
        FROM courses
        GROUP BY prefix
        ORDER BY count DESC
        LIMIT 20
      `)
    ]);

    res.json({
      totalCourses: total.count,
      byCampus: byCampus.reduce((acc, r) => ({ ...acc, [r.campus]: r.count }), {}),
      byTerm: byTerm.reduce((acc, r) => ({ ...acc, [r.term]: r.count }), {}),
      topPrefixes: topPrefixes.map(r => ({ prefix: r.prefix, count: r.count }))
    });
  } catch (error) {
    console.error('Error generating stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available terms (semesters)
app.get('/api/terms', async (req, res) => {
  try {
    const terms = await dbAll(`
      SELECT DISTINCT term, year, campus, COUNT(*) as courseCount
      FROM courses 
      GROUP BY term, year, campus
      ORDER BY year DESC, 
        CASE term 
          WHEN 'Fall' THEN 1 
          WHEN 'Spring' THEN 2 
          WHEN 'Summer' THEN 3 
          ELSE 4 
        END
    `);
    res.json(terms);
  } catch (error) {
    console.error('Error fetching terms:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available prefixes (subjects)
app.get('/api/prefixes', async (req, res) => {
  try {
    const { term, year, campus } = req.query;
    
    let whereClauses = [];
    let params = [];
    
    if (term) {
      whereClauses.push('LOWER(term) = LOWER(?)');
      params.push(term);
    }
    if (year) {
      whereClauses.push('year = ?');
      params.push(parseInt(year, 10));
    }
    if (campus) {
      whereClauses.push('LOWER(campus) = LOWER(?)');
      params.push(campus);
    }
    
    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    
    const prefixes = await dbAll(`
      SELECT DISTINCT prefix, subject, COUNT(*) as courseCount
      FROM courses 
      ${whereClause}
      GROUP BY prefix
      ORDER BY prefix
    `, params);
    
    res.json(prefixes);
  } catch (error) {
    console.error('Error fetching prefixes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all degrees (for degree planner)
app.get('/api/degrees', async (req, res) => {
  try {
    const { year, search } = req.query;
    
    let whereClauses = [];
    let params = [];
    
    // Default to most recent year if not specified
    const catalogYear = year || new Date().getFullYear().toString();
    whereClauses.push('catalog_year = ?');
    params.push(catalogYear);
    
    if (search) {
      whereClauses.push('name LIKE ?');
      params.push(`%${search}%`);
    }
    
    const whereClause = 'WHERE ' + whereClauses.join(' AND ');
    
    const allDegrees = await dbAll(`
      SELECT id, catalog_year, name, credits, degree_type, college, url, source_type, external_id, narrative
      FROM catalog_degrees 
      ${whereClause}
      ORDER BY name, source_type DESC
    `, params);
    
    // Deduplicate by name (case-insensitive), preferring 'api' over 'catalog_json'
    const deduped = new Map();
    for (const degree of allDegrees) {
      const key = degree.name.toLowerCase();
      const existing = deduped.get(key);
      
      // Keep this entry if: no existing entry, or this is from API and existing is from catalog_json
      if (!existing || (degree.source_type === 'api' && existing.source_type === 'catalog_json')) {
        deduped.set(key, degree);
      }
    }
    
    const degrees = Array.from(deduped.values()).map(d => ({
      id: d.id,
      catalog_year: d.catalog_year,
      name: d.name,
      credits: d.credits,
      degree_type: d.degree_type,
      college: d.college,
      url: d.url,
      external_id: d.external_id,
      narrative: d.narrative
    }));
    
    // Get available years for dropdown
    const years = await dbAll(`
      SELECT DISTINCT catalog_year 
      FROM catalog_degrees 
      ORDER BY catalog_year DESC
    `);
    
    res.json({
      degrees,
      years: years.map(y => y.catalog_year),
      total: degrees.length
    });
  } catch (error) {
    console.error('Error fetching degrees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get degree requirements from database or WSU Catalog API
// First tries database (for saved requirements), then falls back to WSU API
app.get('/api/degree-requirements', async (req, res) => {
  try {
    const { name, acadUnitId: providedAcadUnitId, type = 'degree' } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Degree name is required' });
    }

    // STEP 1: Try to fetch from database first based on type
    let dbDegree = null;

    if (type === 'minor') {
      dbDegree = await dbGet(
        'SELECT id, name, url, catalog_year, narrative, courses, required_courses, elective_courses FROM catalog_minors WHERE name = ? ORDER BY catalog_year DESC LIMIT 1',
        [name]
      );
    } else if (type === 'certificate') {
      dbDegree = await dbGet(
        'SELECT id, name, url, catalog_year, description, courses, required_courses, elective_courses FROM catalog_certificates WHERE name = ? ORDER BY catalog_year DESC LIMIT 1',
        [name]
      );
    } else {
      // Default: degree
      dbDegree = await dbGet(
        'SELECT id, name, credits, college, url, catalog_year, narrative FROM catalog_degrees WHERE name = ? ORDER BY catalog_year DESC LIMIT 1',
        [name]
      );
    }
    
    if (dbDegree) {
      // Check if we have course requirements saved
      const requirements = await dbAll(
        'SELECT year, term, label, hours, sort_order, footnotes FROM degree_requirements WHERE degree_id = ? ORDER BY year, term, sort_order',
        [dbDegree.id]
      );
      
      if (requirements.length > 0) {
        // We have saved requirements - use them!
        console.log(`✅ Loaded ${requirements.length} course requirements from database for "${name}"`);
        
        // Group by year and term
        const coursesByYearTerm = {};
        let totalCredits = 0;
        
        for (const item of requirements) {
          const key = `${item.year}-${item.term}`;
          if (!coursesByYearTerm[key]) {
            coursesByYearTerm[key] = {
              year: item.year,
              term: item.term,
              termName: item.term === 1 ? 'Fall' : item.term === 2 ? 'Spring' : 'Summer',
              courses: []
            };
          }
          
          const credits = item.hours ? parseInt(item.hours, 10) : null;
          const courseInfo = parseCourseLabel(item.label, credits);
          
          // Parse footnotes from JSON
          if (item.footnotes) {
            try {
              courseInfo.footnotes = JSON.parse(item.footnotes);
            } catch (e) {
              courseInfo.footnotes = [];
            }
          } else {
            courseInfo.footnotes = [];
          }
          
          // Only add courses that have credits
          if (credits && credits > 0) {
            coursesByYearTerm[key].courses.push(courseInfo);
            totalCredits += credits;
          } else if (!credits) {
            courseInfo.isNonCredit = true;
            coursesByYearTerm[key].courses.push(courseInfo);
          }
        }
        
        const schedule = Object.values(coursesByYearTerm).sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.term - b.term;
        });
        
        return res.json({
          degree: {
            title: dbDegree.name,
            totalHours: dbDegree.credits,
            narrative: dbDegree.narrative,
            acadUnit: dbDegree.college
          },
          schedule,
          totalCoursesInSequence: requirements.length,
          estimatedCredits: totalCredits,
          source: 'database'
        });
      }
    }
    
    // STEP 2: For minors/certificates found in DB but without requirements, return basic info
    if (dbDegree && (type === 'minor' || type === 'certificate')) {
      console.log(`️ Found ${type} "${name}" in database (no detailed requirements available)`);
      // Certificates use 'description' field, minors use 'narrative'
      const narrativeText = dbDegree.narrative || dbDegree.description || `This ${type} requires specific courses. Please consult with your advisor.`;

      // Parse stored extracted courses if present
      let parsedCourses = [];
      let parsedRequired = [];
      let parsedElective = [];
      try {
        if (dbDegree.courses) parsedCourses = JSON.parse(dbDegree.courses);
      } catch (e) { parsedCourses = []; }
      try {
        if (dbDegree.required_courses) parsedRequired = JSON.parse(dbDegree.required_courses);
      } catch (e) { parsedRequired = []; }
      try {
        if (dbDegree.elective_courses) parsedElective = JSON.parse(dbDegree.elective_courses);
      } catch (e) { parsedElective = []; }

      return res.json({
        degree: {
          title: dbDegree.name,
          totalHours: dbDegree.credits || null,
          narrative: narrativeText,
          acadUnit: dbDegree.college || null,
          url: dbDegree.url
        },
        schedule: [],
        totalCoursesInSequence: parsedCourses.length,
        estimatedCredits: 0,
        source: 'database',
        type: type,
        courses: parsedCourses,
        requiredCourses: parsedRequired,
        electiveCourses: parsedElective,
        note: parsedCourses.length === 0 ? `Detailed course requirements for ${type}s are not yet available. Please check the WSU catalog for full requirements.` : undefined
      });
    }

    // STEP 3: Fall back to WSU API if not in database (degrees only)
    console.log(`⚠️ No saved requirements for "${name}", fetching from WSU API...`);

    // For minors/certificates not in our DB, return a helpful error
    if (type === 'minor' || type === 'certificate') {
      return res.status(404).json({
        error: `${type.charAt(0).toUpperCase() + type.slice(1)} not found`,
        searchedFor: name,
        suggestion: 'Please check the WSU catalog for available programs'
      });
    }

    let acadUnitId = providedAcadUnitId;
    let degreeInfo = null;

    if (!acadUnitId && dbDegree?.external_id) {
      acadUnitId = dbDegree.external_id;
    }

    if (!acadUnitId) {
      const degreesResponse = await fetch('https://catalog.wsu.edu/api/Data/GetDegreesDropdown/General');
      const degrees = await degreesResponse.json();

      // Find matching degree (case-insensitive partial match)
      degreeInfo = degrees.find(d =>
        d.title.toLowerCase() === name.toLowerCase() ||
        d.label.toLowerCase().includes(name.toLowerCase())
      );

      if (!degreeInfo) {
        return res.status(404).json({
          error: 'Degree not found in WSU catalog',
          searchedFor: name
        });
      }

      acadUnitId = degreeInfo.acadUnitId;
    }
    
    // Fetch the academic unit data which includes course requirements
    const unitResponse = await fetch(`https://catalog.wsu.edu/api/Data/GetAcademicUnit/${acadUnitId}/General`);
    const unitData = await unitResponse.json();
    
    // Find the specific degree program
    const program = unitData.degreePrograms?.find(p => 
      p.title.toLowerCase() === name.toLowerCase()
    );
    
    if (!program) {
      // Return all programs in this unit if exact match not found
      const programs = unitData.degreePrograms?.map(p => ({
        title: p.title,
        hours: p.hours,
        coursesCount: p.sequenceItems?.length || 0
      }));
      
      return res.status(404).json({ 
        error: 'Specific program not found, but found related programs',
        searchedFor: name,
        availablePrograms: programs,
        acadUnit: unitData.academicUnit?.name
      });
    }
    
    // Parse the sequence items into a more usable format
    const coursesByYearTerm = {};
    let totalCredits = 0;
    
    for (const item of (program.sequenceItems || [])) {
      const key = `${item.year}-${item.term}`;
      if (!coursesByYearTerm[key]) {
        coursesByYearTerm[key] = {
          year: item.year,
          term: item.term,
          termName: item.term === 1 ? 'Fall' : item.term === 2 ? 'Spring' : 'Summer',
          courses: []
        };
      }
      
      // Parse the course label to extract prefix, number, credits, and attributes
      // Credits come from the 'hours' field in the API response
      const credits = item.hours ? parseInt(item.hours, 10) : null;
      const courseInfo = parseCourseLabel(item.label, credits);
      
      // Add footnotes to the course info
      courseInfo.footnotes = item.footnotes || [];
      
      // Only add courses that have credits (skip non-credit milestones)
      if (credits && credits > 0) {
        coursesByYearTerm[key].courses.push(courseInfo);
        totalCredits += credits;
      } else if (!credits) {
        // For UCORE requirements and electives without specific credits
        // Include them but mark as variable credit
        courseInfo.isNonCredit = true;
        coursesByYearTerm[key].courses.push(courseInfo);
      }
    }
    
    // Convert to sorted array
    const schedule = Object.values(coursesByYearTerm).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.term - b.term;
    });
    
    res.json({
      degree: {
        title: program.title,
        totalHours: program.hours,
        narrative: program.narrative,
        acadUnit: unitData.academicUnit?.name
      },
      schedule,
      totalCoursesInSequence: program.sequenceItems?.length || 0,
      estimatedCredits: totalCredits,
      source: 'api'
    });
    
  } catch (error) {
    console.error('Error fetching degree requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================
// RateMyProfessors proxy endpoint
// ==============================

// Simple in-memory cache with TTL
const rmpCache = new Map();
function setRmpCache(key, value, ttlMs = 1000 * 60 * 10) { // default 10 minutes
  const expires = Date.now() + ttlMs;
  rmpCache.set(key, { value, expires });
}
function getRmpCache(key) {
  const entry = rmpCache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    rmpCache.delete(key);
    return null;
  }
  return entry.value;
}

const rmpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RMP_PROXY_RATE_LIMIT_MAX, 10) || 60,
  message: { error: 'Too many RMP requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

function sanitizeNameForKey(name = '') {
  return (name || '').toString().trim().toLowerCase().replace(/[^a-z0-9\s\-]/g, '').slice(0, 120);
}

function buildRmpSearchPayload(name, schoolId) {
  return {
    operationName: 'SearchTeachers',
    variables: { query: name, schoolID: schoolId || null },
    query: `query SearchTeachers($query: String!, $schoolID: ID) { newSearch { teachers(query: $query, schoolID: $schoolID) { edges { node { legacyId firstName lastName avgRating avgDifficulty wouldTakeAgainPercent school { name id } } } } } }`
  };
}

function buildRmpGetByIdPayload(id) {
  return {
    operationName: 'GetTeacherRatings',
    variables: { id },
    query: `query GetTeacherRatings($id: ID!) { node(id: $id) { ... on Teacher { legacyId firstName lastName avgRating avgDifficulty wouldTakeAgainPercent school { name id } } } }`
  };
}

app.post('/api/rmp-proxy', rmpLimiter, async (req, res) => {
  try {
    if (process.env.ENABLE_RMP_PROXY === 'false') {
      return res.status(403).json({ success: false, error: 'rmp-proxy-disabled' });
    }

    const { action, name, id, schoolId } = req.body || {};
    if (!action || (action !== 'searchTeacher' && action !== 'getTeacherById')) {
      return res.status(400).json({ success: false, error: 'invalid-action' });
    }

    if (action === 'searchTeacher') {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'missing-name' });
      }
      const key = `rmp:teacher:${sanitizeNameForKey(name)}`;
      const cached = getRmpCache(key);
      if (cached) return res.json({ success: true, source: 'cache', data: cached });

      // Prefer using the maintained wrapper library on the server if available
      let mapped = [];
      try {
        let mod = null;
        try {
          mod = require('@domattheshack/rate-my-professors');
          mod = mod && mod.default ? mod.default : mod;
        } catch (e) {
          mod = null;
        }

        if (mod && (mod.searchTeacher || mod.searchTeachers || mod.search)) {
          // If we can search by school, try to locate WSU first
          let libSchoolId = null;
          const searchSchool = mod.searchSchool || mod.searchSchools || mod.search;
          if (typeof searchSchool === 'function') {
            try {
              const schools = await searchSchool('Washington State University');
              if (Array.isArray(schools) && schools.length) {
                const found = schools.find(s => (s.name && s.name.toLowerCase().includes('washington state')) || (s.state && String(s.state).toUpperCase() === 'WA')) || schools[0];
                libSchoolId = found && (found.id || found.schoolId || found.legacyId) ? (found.id || found.schoolId || found.legacyId) : null;
              }
            } catch (e) {
              libSchoolId = null;
            }
          }

          const searchTeacher = mod.searchTeacher || mod.search || mod.searchForTeacher || mod.searchTeachers;
          try {
            if (libSchoolId) mapped = await searchTeacher(name, libSchoolId);
            else mapped = await searchTeacher(name);
          } catch (e) {
            // try fallback without school
            try {
              mapped = await searchTeacher(name);
            } catch (e2) {
              mapped = [];
            }
          }

          // Normalize mapped if it contains nodes
          if (Array.isArray(mapped) && mapped.length && mapped[0] && mapped[0].node) {
            mapped = mapped.map(e => e.node || e);
          }
        } else {
          // library not available; fallback to GraphQL
          const payload = buildRmpSearchPayload(name, schoolId);
          const rmpResp = await axios.post('https://www.ratemyprofessors.com/graphql', payload, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': process.env.RMP_USER_AGENT || 'virtual-counselor/2.0 (+https://virtual-counselor.org)'
            },
            timeout: 10000
          });
          const edges = rmpResp?.data?.data?.newSearch?.teachers?.edges || [];
          mapped = edges.map(e => e.node || {});
        }
      } catch (err) {
        mapped = [];
      }
      // If no results, attempt a fallback search by last name only (improves hit rate)
      if ((!mapped || mapped.length === 0) && name && name.trim().includes(' ')) {
        const parts = name.trim().split(/\s+/);
        const lastName = parts[parts.length - 1];
        if (lastName && lastName.length > 1) {
          // try using library fallback if available
          try {
            let mod = null;
            try { mod = require('@domattheshack/rate-my-professors'); mod = mod && mod.default ? mod.default : mod; } catch (e) { mod = null; }
            if (mod && (mod.searchTeacher || mod.search)) {
              let lastResults = [];
              try {
                lastResults = await (mod.searchTeacher || mod.search)(lastName);
                if (Array.isArray(lastResults) && lastResults[0] && lastResults[0].node) lastResults = lastResults.map(r => r.node || r);
              } catch (e) {
                lastResults = [];
              }
              if (lastResults && lastResults.length) mapped = lastResults;
            } else {
              const payload2 = buildRmpSearchPayload(lastName, schoolId);
              try {
                const rmpResp2 = await axios.post('https://www.ratemyprofessors.com/graphql', payload2, {
                  headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': process.env.RMP_USER_AGENT || 'virtual-counselor/2.0 (+https://virtual-counselor.org)'
                  },
                  timeout: 10000
                });
                const edges2 = rmpResp2?.data?.data?.newSearch?.teachers?.edges || [];
                if (edges2 && edges2.length) mapped = edges2.map(e => e.node || {});
              } catch (e) {
                // ignore
              }
            }
          } catch (e) {
            // ignore fallback errors
          }
        }
      }

      // Normalize mapped items: ensure `legacyId` (string) and `profileUrl` are present when possible
      try {
        mapped = (Array.isArray(mapped) ? mapped : []).map(item => {
          const out = Object.assign({}, item || {});
          if (!out.legacyId && out.legacy_id) out.legacyId = out.legacy_id;
          // some results use 'id' as base64 node id; try to decode numeric id
          if (!out.legacyId && out.id && /^[A-Za-z0-9=+/]+$/.test(out.id)) {
            try {
              const decoded = Buffer.from(String(out.id), 'base64').toString('utf8');
              const m = decoded.match(/(\d+)/);
              if (m) out.legacyId = m[1];
            } catch (e) {}
          }
          if (out.legacyId) out.legacyId = String(out.legacyId);
          if (!out.profileUrl && out.legacyId) out.profileUrl = `https://www.ratemyprofessors.com/professor/${out.legacyId}`;
          return out;
        });
      } catch (e) {
        // If normalization fails for any reason, fall back to original mapped
      }

      setRmpCache(key, mapped);
      return res.json({ success: true, source: 'rmp', data: mapped });
    }

    if (action === 'getTeacherById') {
      if (!id) return res.status(400).json({ success: false, error: 'missing-id' });
      // Accept numeric legacy id or node id; if numeric, convert to node id
      let nodeId = id;
      if (/^\d+$/.test(String(id))) {
        try {
          nodeId = Buffer.from(`Teacher-${String(id)}`).toString('base64');
        } catch (e) {
          nodeId = id;
        }
      }

      const key = `rmp:id:${String(id)}`;
      const cached = getRmpCache(key);
      if (cached) return res.json({ success: true, source: 'cache', data: cached });

      // Try using library if available
      try {
        let mod = null;
        try { mod = require('@domattheshack/rate-my-professors'); mod = mod && mod.default ? mod.default : mod; } catch (e) { mod = null; }
        let details = null;
        if (mod && (mod.getTeacher || mod.getTeacherById || mod.get)) {
          const getter = mod.getTeacher || mod.getTeacherById || mod.get;
          try {
            // library may expect numeric or node id; try both
            details = await getter(id).catch(() => getter(nodeId));
          } catch (e) {
            details = null;
          }
        }

        if (!details) {
          const payload = buildRmpGetByIdPayload(nodeId);
          const rmpResp = await axios.post('https://www.ratemyprofessors.com/graphql', payload, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': process.env.RMP_USER_AGENT || 'virtual-counselor/2.0 (+https://virtual-counselor.org)'
            },
            timeout: 10000
          });
          details = rmpResp?.data?.data?.node || null;
        }

        if (!details) {
          setRmpCache(key, null);
          return res.json({ success: true, source: 'rmp', data: null });
        }

        const mapped = {
          legacyId: details.legacyId || details.legacy_id || null,
          firstName: details.firstName || details.first_name || null,
          lastName: details.lastName || details.last_name || null,
          avgRating: details.avgRating !== undefined ? Number(details.avgRating) : (details.average ? Number(details.average) : null),
          avgDifficulty: details.avgDifficulty !== undefined ? Number(details.avgDifficulty) : (details.difficulty ? Number(details.difficulty) : null),
          wouldTakeAgainPercent: details.wouldTakeAgainPercent !== undefined ? Number(details.wouldTakeAgainPercent) : (details.wouldTakeAgain ? Number(details.wouldTakeAgain) : null),
          school: details.school || null,
          profileUrl: details.legacyId ? `https://www.ratemyprofessors.com/professor/${details.legacyId}` : (details.id ? (() => {
            try { const dec = Buffer.from(details.id, 'base64').toString('utf8'); const m = dec.match(/(\d+)/); if (m) return `https://www.ratemyprofessors.com/professor/${m[1]}`; } catch (e) {} return null;
          })() : null)
        };

        if (mapped.legacyId) mapped.legacyId = String(mapped.legacyId);
        setRmpCache(key, mapped);
        return res.json({ success: true, source: 'rmp', data: mapped });
      } catch (err) {
        console.error('RMP getById error:', err && err.message ? err.message : err);
        return res.status(502).json({ success: false, error: 'upstream-unavailable' });
      }
    }

  } catch (err) {
    console.error('RMP proxy error:', err && err.message ? err.message : err);
    return res.status(502).json({ success: false, error: 'upstream-unavailable' });
  }
});

// Helper function to parse course labels like "CPT S 121 [QUAN]" or "CPT S 121 or 131"
// credits parameter is the hours value from the API
function parseCourseLabel(label, credits = null) {
  if (!label) return { raw: '', prefix: '', number: '', credits: null, attributes: [] };
  
  const result = {
    raw: label,
    prefix: '',
    number: '',
    credits: credits, // Use the hours value from API
    attributes: [],
    isChoice: false,
    alternatives: []
  };
  
  // Extract attributes like [WRTG], [QUAN], etc.
  const attrMatch = label.match(/\[([A-Z]+)\]/g);
  if (attrMatch) {
    result.attributes = attrMatch.map(a => a.replace(/[\[\]]/g, ''));
  }
  
  // Remove attributes from label for further parsing
  let cleanLabel = label.replace(/\s*\[[A-Z]+\]/g, '').trim();
  
  // Check if it's a choice (contains "or")
  if (cleanLabel.toLowerCase().includes(' or ')) {
    result.isChoice = true;
    const parts = cleanLabel.split(/\s+or\s+/i);
    result.alternatives = parts.map(p => p.trim());
  }
  
  // Credits are now passed from the API's hours field
  // Only try to extract from label if not already set
  if (!result.credits) {
    const creditsMatch = cleanLabel.match(/\s(\d+)$/);
    if (creditsMatch) {
      result.credits = parseInt(creditsMatch[1], 10);
      cleanLabel = cleanLabel.replace(/\s\d+$/, '').trim();
    }
  }
  
  // Try to extract prefix and number
  // Pattern: "PREFIX NUMBER" like "CPT S 121", "MATH 171", "ENGLISH 101"
  const courseMatch = cleanLabel.match(/^([A-Z]+(?:\s+[A-Z])?)\s+(\d+\w*)/i);
  if (courseMatch) {
    result.prefix = courseMatch[1].toUpperCase();
    result.number = courseMatch[2];
  } else {
    // Just store the whole thing
    result.prefix = cleanLabel;
  }
  
  return result;
}

// Get all minors
app.get('/api/minors', async (req, res) => {
  try {
    const { year, search } = req.query;
    
    let whereClauses = [];
    let params = [];
    
    const catalogYear = year || new Date().getFullYear().toString();
    whereClauses.push('catalog_year = ?');
    params.push(catalogYear);
    
    if (search) {
      whereClauses.push('name LIKE ?');
      params.push(`%${search}%`);
    }
    
    const whereClause = 'WHERE ' + whereClauses.join(' AND ');
    
    const minors = await dbAll(`
      SELECT id, catalog_year, name, url
      FROM catalog_minors 
      ${whereClause}
      ORDER BY name
    `, params);
    
    const years = await dbAll(`
      SELECT DISTINCT catalog_year 
      FROM catalog_minors 
      ORDER BY catalog_year DESC
    `);
    
    res.json({
      minors,
      years: years.map(y => y.catalog_year),
      total: minors.length
    });
  } catch (error) {
    console.error('Error fetching minors:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all certificates
app.get('/api/certificates', async (req, res) => {
  try {
    const { year, search } = req.query;
    
    let whereClauses = [];
    let params = [];
    
    const catalogYear = year || new Date().getFullYear().toString();
    whereClauses.push('catalog_year = ?');
    params.push(catalogYear);
    
    if (search) {
      whereClauses.push('name LIKE ?');
      params.push(`%${search}%`);
    }
    
    const whereClause = 'WHERE ' + whereClauses.join(' AND ');
    
    const certificates = await dbAll(`
      SELECT id, catalog_year, name, url
      FROM catalog_certificates 
      ${whereClause}
      ORDER BY name
    `, params);
    
    const years = await dbAll(`
      SELECT DISTINCT catalog_year 
      FROM catalog_certificates 
      ORDER BY catalog_year DESC
    `);
    
    res.json({
      certificates,
      years: years.map(y => y.catalog_year),
      total: certificates.length
    });
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get courses with filtering and pagination
app.get('/api/courses', async (req, res) => {
  try {
    const { campus, term, year, prefix, seatsAvailable, search, page = 1, limit = 50 } = req.query;

    let whereClauses = [];
    let params = [];

    if (campus) {
      whereClauses.push('LOWER(campus) = LOWER(?)');
      params.push(campus);
    }
    if (term) {
      whereClauses.push('LOWER(term) = LOWER(?)');
      params.push(term);
    }
    if (year) {
      whereClauses.push('year = ?');
      params.push(parseInt(year, 10));
    }
    if (prefix) {
      // Normalize prefix - match both with and without spaces (e.g., "CPTS" matches "CPT S")
      const normalizedPrefix = prefix.toUpperCase().replace(/\s+/g, '');
      whereClauses.push('(LOWER(prefix) = LOWER(?) OR UPPER(REPLACE(prefix, \' \', \'\')) = ?)');
      params.push(prefix, normalizedPrefix);
    }
    if (seatsAvailable) {
      whereClauses.push('seatsAvailable >= ?');
      params.push(parseInt(seatsAvailable, 10));
    }
    if (search) {
      // Case-insensitive search with support for variations like "cpts111" matching "Cpt S 111"
      const normalizedSearch = search.toUpperCase().replace(/\s+/g, '');
      whereClauses.push(`(
        LOWER(prefix) LIKE LOWER(?) OR
        LOWER(title) LIKE LOWER(?) OR
        LOWER(instructor) LIKE LOWER(?) OR
        LOWER(courseNumber) LIKE LOWER(?) OR
        LOWER(REPLACE(prefix, ' ', '')) LIKE LOWER(REPLACE(?, ' ', '')) OR
        LOWER(prefix || ' ' || courseNumber) LIKE LOWER(?) OR
        UPPER(REPLACE(prefix, ' ', '') || courseNumber) LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      const normalizedSearchTerm = `%${normalizedSearch}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, normalizedSearchTerm);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const offset = (page - 1) * limit;
    const queryParams = [...params, parseInt(limit, 10), offset];
    const countParams = [...params];

    const [courses, total] = await Promise.all([
      dbAll(`SELECT * FROM courses ${whereClause} ORDER BY prefix, courseNumber LIMIT ? OFFSET ?`, queryParams),
      dbGet(`SELECT COUNT(*) as count FROM courses ${whereClause}`, countParams)
    ]);

    res.json({
      courses,
      total: total.count,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total.count / limit)
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search courses
app.get('/api/courses/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    // Normalize the search query - strip spaces and uppercase for comparison
    const normalizedQuery = q.toUpperCase().replace(/\s+/g, '');

    // Try to detect if this looks like a course code (e.g., "cpts111" or "cpt s 111")
    const courseCodeMatch = normalizedQuery.match(/^([A-Z]+)(\d{3}\w?)$/);

    const searchTerm = `%${q}%`;
    const normalizedSearchTerm = `%${normalizedQuery}%`;

    // Build the query with normalized matching
    let courses;
    if (courseCodeMatch) {
      // User is searching for something like "cpts111" - try to match prefix + number
      const prefixPart = courseCodeMatch[1];
      const numberPart = courseCodeMatch[2];
      courses = await dbAll(`
        SELECT * FROM courses
        WHERE (UPPER(REPLACE(prefix, ' ', '')) = ? AND courseNumber = ?)
           OR LOWER(prefix) LIKE LOWER(?)
           OR LOWER(courseNumber) LIKE LOWER(?)
           OR LOWER(title) LIKE LOWER(?)
           OR LOWER(REPLACE(prefix, ' ', '') || courseNumber) LIKE LOWER(?)
        LIMIT ?
      `, [prefixPart, numberPart, searchTerm, searchTerm, searchTerm, normalizedSearchTerm, parseInt(limit, 10)]);
    } else {
      courses = await dbAll(`
        SELECT * FROM courses
        WHERE LOWER(prefix) LIKE LOWER(?)
           OR LOWER(courseNumber) LIKE LOWER(?)
           OR LOWER(title) LIKE LOWER(?)
           OR LOWER(REPLACE(prefix, ' ', '')) LIKE LOWER(REPLACE(?, ' ', ''))
           OR LOWER(prefix || ' ' || courseNumber) LIKE LOWER(?)
           OR LOWER(REPLACE(prefix, ' ', '') || courseNumber) LIKE LOWER(?)
        LIMIT ?
      `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, normalizedSearchTerm, parseInt(limit, 10)]);
    }

    res.json({ courses, total: courses.length });
  } catch (error) {
    console.error('Error searching courses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get courses with seats available
app.get('/api/courses/available', async (req, res) => {
  try {
    const { campus, term, year, minSeats = 1 } = req.query;

    let whereClauses = ['seatsAvailable >= ?'];
    let params = [parseInt(minSeats, 10)];

    if (campus) {
      whereClauses.push('campus = ?');
      params.push(campus);
    }
    if (term) {
      whereClauses.push('term = ?');
      params.push(term);
    }
    if (year) {
      whereClauses.push('year = ?');
      params.push(parseInt(year, 10));
    }

    const courses = await dbAll(`
      SELECT * FROM courses
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY seatsAvailable DESC
    `, params);

    res.json({ courses, total: courses.length });
  } catch (error) {
    console.error('Error fetching available courses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get enrollment history for a course
app.get('/api/enrollment/history/:uniqueId', async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { hours = 24 } = req.query;

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const history = await dbAll(`
      SELECT * FROM enrollment_history
      WHERE uniqueId = ? AND scrapedAt >= ?
      ORDER BY scrapedAt DESC
    `, [uniqueId, cutoffTime]);

    res.json({ history, total: history.length });
  } catch (error) {
    console.error('Error fetching enrollment history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// N8N WEBHOOK ENDPOINT - SQLITE (NO LOCKING NEEDED!)
// ============================================

app.post('/webhook/courses', webhookAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const courseData = Array.isArray(req.body) ? req.body : [req.body];

    if (courseData.length === 0) {
      return res.json({
        status: 'success',
        processed: 0,
        message: 'No data to process'
      });
    }

    console.log(`📊 Processing ${courseData.length} courses (chunked commit)`);

    let added = 0;
    let updated = 0;
    let historyRecorded = 0;
    let failed = 0;
    const failures = [];

    // Commit in smaller transactions to avoid full-batch rollback on a single bad record
    const batchSize = parseInt(process.env.WEBHOOK_BATCH_COMMIT_SIZE, 10) || 50;

    for (let i = 0; i < courseData.length; i += batchSize) {
      const chunk = courseData.slice(i, i + batchSize);

      await withTransaction(async () => {
        for (const course of chunk) {
          try {
            if (!course || !course.campus || !course.term || !course.year) {
              console.log('⚠️  Skipping invalid course data');
              continue;
            }

            const uniqueId = `${course.campus}-${course.term}-${course.year}-${course.prefix}-${course.courseNumber}-${course.sectionNumber}-${course.isLab}`;

            // Check if course exists
            const existing = await dbGet('SELECT id FROM courses WHERE uniqueId = ?', [uniqueId]);

            if (existing) {
              // Update existing course
              await dbRun(`
                UPDATE courses SET
                  subject = ?,
                  title = ?,
                  sectionTitle = ?,
                  credits = ?,
                  instructor = ?,
                  sln = ?,
                  courseDescription = ?,
                  coursePrerequisite = ?,
                  sectionComment = ?,
                  sectionUrl = ?,
                  dayTime = ?,
                  location = ?,
                  site = ?,
                  startDate = ?,
                  endDate = ?,
                  seatsAvailable = ?,
                  maxEnrollment = ?,
                  currentEnrollment = ?,
                  waitlistAvailable = ?,
                  waitlistCapacity = ?,
                  waitlistCount = ?,
                  status = ?,
                  dateLastAuditToCredit = ?,
                  dateLastCreditToAudit = ?,
                  dateLastFinalGradeSubmit = ?,
                  dateLastInstruction = ?,
                  dateLastLtrGradeToPf = ?,
                  dateLastPftoLtrGrade = ?,
                  dateLastRegWithoutFee = ?,
                  dateLastStdAdd = ?,
                  dateLastStdDrop = ?,
                  dateLastWdrwl = ?,
                  dateRegBegin = ?,
                  dateRegEnd = ?,
                  slnrestrict = ?,
                  ger = ?,
                  diversity = ?,
                  writing = ?,
                  courseFee = ?,
                  isMultipleFees = ?,
                  titleAllowed = ?,
                  showInstructors = ?,
                  ucore = ?,
                  coop = ?,
                  schedulePrint = ?,
                  instructionMode = ?,
                  session = ?,
                  consent = ?,
                  minUnits = ?,
                  maxUnits = ?,
                  gradCaps = ?,
                  footnotes = ?,
                  instructors = ?,
                  meetings = ?,
                  scrapedAt = CURRENT_TIMESTAMP,
                  updatedAt = CURRENT_TIMESTAMP
                WHERE uniqueId = ?
              `, [
                course.subject, course.title, course.sectionTitle, course.credits, course.instructor, course.sln,
                course.courseDescription, course.coursePrerequisite, course.sectionComment, course.sectionUrl,
                course.dayTime, course.location, course.site, course.startDate, course.endDate,
                course.seatsAvailable, course.maxEnrollment, course.currentEnrollment,
                course.waitlistAvailable, course.waitlistCapacity, course.waitlistCount, course.status,
                course.dateLastAuditToCredit, course.dateLastCreditToAudit, course.dateLastFinalGradeSubmit,
                course.dateLastInstruction, course.dateLastLtrGradeToPf, course.dateLastPftoLtrGrade,
                course.dateLastRegWithoutFee, course.dateLastStdAdd, course.dateLastStdDrop, course.dateLastWdrwl,
                course.dateRegBegin, course.dateRegEnd,
                course.slnrestrict, course.ger, course.diversity, course.writing, course.courseFee, course.isMultipleFees,
                course.titleAllowed, course.showInstructors, course.ucore, course.coop, course.schedulePrint,
                course.instructionMode, course.session, course.consent, course.minUnits, course.maxUnits, course.gradCaps, course.footnotes,
                JSON.stringify(course.instructors || []), JSON.stringify(course.meetings || []),
                uniqueId
              ]);

              // Record enrollment history
              await dbRun(`
                INSERT INTO enrollment_history
                (courseId, uniqueId, seatsAvailable, currentEnrollment, waitlistCount)
                VALUES (?, ?, ?, ?, ?)
              `, [
                existing.id, uniqueId,
                course.seatsAvailable, course.currentEnrollment, course.waitlistCount
              ]);

              updated++;
              historyRecorded++;
            } else {
              // Insert new course
              const insertResult = await dbRun(`
                INSERT INTO courses (
                  uniqueId, campus, term, year, prefix, subject, courseNumber, sectionNumber, isLab,
                  title, sectionTitle, credits, instructor, sln,
                  courseDescription, coursePrerequisite, sectionComment, sectionUrl,
                  dayTime, location, site, startDate, endDate,
                  seatsAvailable, maxEnrollment, currentEnrollment,
                  waitlistAvailable, waitlistCapacity, waitlistCount, status,
                  dateLastAuditToCredit, dateLastCreditToAudit, dateLastFinalGradeSubmit,
                  dateLastInstruction, dateLastLtrGradeToPf, dateLastPftoLtrGrade,
                  dateLastRegWithoutFee, dateLastStdAdd, dateLastStdDrop, dateLastWdrwl,
                  dateRegBegin, dateRegEnd,
                  slnrestrict, ger, diversity, writing, courseFee, isMultipleFees,
                  titleAllowed, showInstructors, ucore, coop, schedulePrint,
                  instructionMode, session, consent, minUnits, maxUnits, gradCaps, footnotes,
                  instructors, meetings
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                uniqueId, course.campus, course.term, course.year,
                course.prefix, course.subject, course.courseNumber, course.sectionNumber, course.isLab,
                course.title, course.sectionTitle, course.credits, course.instructor, course.sln,
                course.courseDescription, course.coursePrerequisite, course.sectionComment, course.sectionUrl,
                course.dayTime, course.location, course.site, course.startDate, course.endDate,
                course.seatsAvailable, course.maxEnrollment, course.currentEnrollment,
                course.waitlistAvailable, course.waitlistCapacity, course.waitlistCount, course.status,
                course.dateLastAuditToCredit, course.dateLastCreditToAudit, course.dateLastFinalGradeSubmit,
                course.dateLastInstruction, course.dateLastLtrGradeToPf, course.dateLastPftoLtrGrade,
                course.dateLastRegWithoutFee, course.dateLastStdAdd, course.dateLastStdDrop, course.dateLastWdrwl,
                course.dateRegBegin, course.dateRegEnd,
                course.slnrestrict, course.ger, course.diversity, course.writing, course.courseFee, course.isMultipleFees,
                course.titleAllowed, course.showInstructors, course.ucore, course.coop, course.schedulePrint,
                course.instructionMode, course.session, course.consent, course.minUnits, course.maxUnits, course.gradCaps, course.footnotes,
                JSON.stringify(course.instructors || []), JSON.stringify(course.meetings || [])
              ]);

              // Record initial enrollment state
              await dbRun(`
                INSERT INTO enrollment_history
                (courseId, uniqueId, seatsAvailable, currentEnrollment, waitlistCount)
                VALUES (?, ?, ?, ?, ?)
              `, [
                insertResult.lastID, uniqueId,
                course.seatsAvailable, course.currentEnrollment, course.waitlistCount
              ]);

              added++;
              historyRecorded++;
            }
          } catch (itemErr) {
            failed++;
            failures.push({ error: itemErr.message, course: { prefix: course && course.prefix, courseNumber: course && course.courseNumber, sectionNumber: course && course.sectionNumber } });
            logger.error('Error processing a course in webhook chunk', { meta: { error: itemErr.message, course } });
            // continue processing remaining courses in this chunk
            continue;
          }
        }
      }); // end chunk transaction
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Processed in ${duration}ms (${added} added, ${updated} updated, ${historyRecorded} history records, ${failed} failed)`);

    res.json({
      status: 'success',
      added,
      updated,
      historyRecorded,
      failed,
      sampleFailures: failures.slice(0,5),
      duration: `${duration}ms`
    });

  } catch (error) {
    console.error('❌ Error processing courses:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Webhook for catalog PDFs (archived catalogs)
app.post('/webhook/catalog-pdf', webhookAuth, async (req, res) => {
  try {
    const pdfData = Array.isArray(req.body) ? req.body : [req.body];
    let added = 0;
    let updated = 0;

    for (const pdf of pdfData) {
      try {
        if (!pdf || !pdf.filename || !pdf.catalogYear) {
          console.log('⚠️  Skipping invalid PDF data - missing filename or catalogYear');
          continue;
        }

        // Check if PDF already exists
        const existing = await dbGet('SELECT id FROM catalog_pdfs WHERE filename = ?', [pdf.filename]);

        if (existing) {
          // Update existing PDF
          await dbRun(`
            UPDATE catalog_pdfs SET
              catalogYear = ?,
              description = ?,
              fileSize = ?,
              filePath = ?,
              pdfData = ?,
              updatedAt = CURRENT_TIMESTAMP
            WHERE filename = ?
          `, [
            pdf.catalogYear,
            pdf.description || `WSU Catalog ${pdf.catalogYear}`,
            pdf.fileSize || 0,
            pdf.filePath || null,
            pdf.pdfData ? Buffer.from(pdf.pdfData, 'base64') : null,
            pdf.filename
          ]);
          updated++;
          console.log(`📄 Updated PDF: ${pdf.filename}`);
        } else {
          // Insert new PDF
          await dbRun(`
            INSERT INTO catalog_pdfs (filename, catalogYear, description, fileSize, filePath, pdfData)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            pdf.filename,
            pdf.catalogYear,
            pdf.description || `WSU Catalog ${pdf.catalogYear}`,
            pdf.fileSize || 0,
            pdf.filePath || null,
            pdf.pdfData ? Buffer.from(pdf.pdfData, 'base64') : null
          ]);
          added++;
          console.log(`📄 Added PDF: ${pdf.filename}`);
        }
      } catch (pdfError) {
        console.error(`Error processing PDF ${pdf.filename}:`, pdfError.message);
      }
    }

    res.json({
      status: 'success',
      added,
      updated,
      total: added + updated
    });

  } catch (error) {
    console.error('Error processing catalog PDFs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all catalog PDFs (metadata only)
app.get('/api/catalog-pdfs', async (req, res) => {
  try {
    const pdfs = await dbAll(`
      SELECT id, filename, catalogYear, description, fileSize, filePath, mimeType, createdAt, updatedAt
      FROM catalog_pdfs
      ORDER BY catalogYear DESC
    `);
    res.json({ pdfs, total: pdfs.length });
  } catch (error) {
    console.error('Error fetching catalog PDFs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download a specific catalog PDF
app.get('/api/catalog-pdfs/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const pdf = await dbGet('SELECT * FROM catalog_pdfs WHERE id = ?', [id]);

    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    if (pdf.pdfData) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
      res.send(pdf.pdfData);
    } else if (pdf.filePath) {
      res.download(pdf.filePath, pdf.filename);
    } else {
      res.status(404).json({ error: 'PDF file not available' });
    }
  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook for degrees
app.post('/webhook/degrees', webhookAuth, async (req, res) => {
  try {
    const degreeData = Array.isArray(req.body) ? req.body : [req.body];
    let added = 0;

    for (const degree of degreeData) {
      try {
        if (!degree || !degree.name || !degree.type) {
          continue;
        }

        await dbRun(`
          INSERT INTO degrees (name, degreeType, type, year, catalogType, college, totalCredits, sourceUrl)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          degree.name, degree.degreeType, degree.type, degree.year,
          degree.catalogType, degree.college, degree.totalCredits, degree.sourceUrl
        ]);

        added++;
      } catch (degreeError) {
        console.error(`Error processing degree ${degree.name}:`, degreeError.message);
      }
    }

    res.json({
      status: 'success',
      added
    });

  } catch (error) {
    console.error('Error processing degrees:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK FOR HISTORICAL DEPARTMENT DATA
// Used by both API scraper and PDF parser
// catalogYear is REQUIRED to prevent overwrites
// ============================================
app.post('/webhook/department', webhookAuth, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const data = req.body;
    
    if (!data || !data.catalogYear) {
      return res.status(400).json({
        status: 'error',
        message: 'catalogYear is required to prevent data overwrites'
      });
    }
    
    const catalogYear = data.catalogYear;
    const sourceType = data.sourceType || 'api'; // 'api' or 'pdf'
    const dept = data.department;
    
    if (!dept || !dept.name) {
      return res.status(400).json({
        status: 'error',
        message: 'department.name is required'
      });
    }
    
    let deptId = null;
    let deptAdded = 0;
    let deptUpdated = 0;
    let degreesAdded = 0;
    let degreesUpdated = 0;
    let minorsAdded = 0;
    let minorsUpdated = 0;
    let certsAdded = 0;
    let certsUpdated = 0;
    
    // Create unique ID for department (name + catalogYear)
    const deptUniqueId = `${dept.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${catalogYear}`;
    
    // Use transaction to ensure all department data is saved atomically
    await withTransaction(async () => {
      // 1. UPSERT DEPARTMENT
      const existingDept = await dbGet('SELECT id FROM departments WHERE uniqueId = ?', [deptUniqueId]);
    
    if (existingDept) {
      await dbRun(`
        UPDATE departments SET
          academicUnitId = ?,
          title = ?,
          fullName = ?,
          url = ?,
          location = ?,
          phone = ?,
          facultyList = ?,
          description = ?,
          sourceType = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE uniqueId = ?
      `, [
        dept.academicUnitId, dept.title, dept.fullName, dept.url,
        dept.location, dept.phone, dept.facultyList, dept.description,
        sourceType, deptUniqueId
      ]);
      deptId = existingDept.id;
      deptUpdated = 1;
      console.log(`📝 Updated department: ${dept.name} (${catalogYear})`);
    } else {
      const result = await dbRun(`
        INSERT INTO departments (uniqueId, catalogYear, academicUnitId, name, title, fullName, url, location, phone, facultyList, description, sourceType)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        deptUniqueId, catalogYear, dept.academicUnitId, dept.name, dept.title,
        dept.fullName, dept.url, dept.location, dept.phone, dept.facultyList,
        dept.description, sourceType
      ]);
      deptId = result.lastID;
      deptAdded = 1;
      console.log(`✅ Added department: ${dept.name} (${catalogYear})`);
    }
    
    // 2. UPSERT DEGREE PROGRAMS
    const degreePrograms = data.degreePrograms || [];
    for (const dp of degreePrograms) {
      const dpUniqueId = `${deptUniqueId}-degree-${(dp.title || dp.id).toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      
      const existingDp = await dbGet('SELECT id FROM degree_programs WHERE uniqueId = ?', [dpUniqueId]);
      
      if (existingDp) {
        await dbRun(`
          UPDATE degree_programs SET
            externalId = ?,
            title = ?,
            hours = ?,
            narrative = ?,
            bottomText = ?,
            isHonors = ?,
            isFYDA = ?,
            yearFormat = ?,
            yearEnd = ?,
            termEnd = ?,
            sequenceItems = ?,
            sourceType = ?,
            updatedAt = CURRENT_TIMESTAMP
          WHERE uniqueId = ?
        `, [
          dp.id, dp.title, dp.hours, dp.narrative, dp.bottomText,
          dp.isHonors ? 1 : 0, dp.isFYDA ? 1 : 0, dp.yearFormat,
          dp.yearEnd, dp.termEnd, JSON.stringify(dp.sequenceItems || []),
          sourceType, dpUniqueId
        ]);
        degreesUpdated++;
      } else {
        await dbRun(`
          INSERT INTO degree_programs (uniqueId, catalogYear, departmentId, externalId, title, hours, narrative, bottomText, isHonors, isFYDA, yearFormat, yearEnd, termEnd, sequenceItems, sourceType)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          dpUniqueId, catalogYear, deptId, dp.id, dp.title, dp.hours,
          dp.narrative, dp.bottomText, dp.isHonors ? 1 : 0, dp.isFYDA ? 1 : 0,
          dp.yearFormat, dp.yearEnd, dp.termEnd,
          JSON.stringify(dp.sequenceItems || []), sourceType
        ]);
        degreesAdded++;
      }
    }
    
    // 3. UPSERT MINORS
    const minors = data.minors || [];
    for (const m of minors) {
      const mUniqueId = `${deptUniqueId}-minor-${(m.title || m.id).toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      
      const existingM = await dbGet('SELECT id FROM minors WHERE uniqueId = ?', [mUniqueId]);
      
      if (existingM) {
        await dbRun(`
          UPDATE minors SET
            externalId = ?,
            title = ?,
            narrative = ?,
            yearEnd = ?,
            termEnd = ?,
            sourceType = ?,
            updatedAt = CURRENT_TIMESTAMP
          WHERE uniqueId = ?
        `, [m.id, m.title, m.narrative, m.yearEnd, m.termEnd, sourceType, mUniqueId]);
        minorsUpdated++;
      } else {
        await dbRun(`
          INSERT INTO minors (uniqueId, catalogYear, departmentId, externalId, title, narrative, yearEnd, termEnd, sourceType)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [mUniqueId, catalogYear, deptId, m.id, m.title, m.narrative, m.yearEnd, m.termEnd, sourceType]);
        minorsAdded++;
      }
    }
    
    // 4. UPSERT CERTIFICATES
    const certificates = data.certificates || [];
    for (const c of certificates) {
      const cUniqueId = `${deptUniqueId}-cert-${(c.title || c.id).toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      
      const existingC = await dbGet('SELECT id FROM certificates WHERE uniqueId = ?', [cUniqueId]);
      
      if (existingC) {
        await dbRun(`
          UPDATE certificates SET
            externalId = ?,
            title = ?,
            description = ?,
            sourceType = ?,
            updatedAt = CURRENT_TIMESTAMP
          WHERE uniqueId = ?
        `, [c.id, c.title, c.description, sourceType, cUniqueId]);
        certsUpdated++;
      } else {
        await dbRun(`
          INSERT INTO certificates (uniqueId, catalogYear, departmentId, externalId, title, description, sourceType)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [cUniqueId, catalogYear, deptId, c.id, c.title, c.description, sourceType]);
        certsAdded++;
      }
    }
    }); // End transaction
    
    const duration = Date.now() - startTime;
    
    console.log(`📊 ${dept.name} (${catalogYear}): ${degreesAdded + degreesUpdated} degrees, ${minorsAdded + minorsUpdated} minors, ${certsAdded + certsUpdated} certs [${duration}ms]`);
    
    res.json({
      status: 'success',
      catalogYear,
      sourceType,
      department: {
        name: dept.name,
        id: deptId,
        added: deptAdded,
        updated: deptUpdated
      },
      degreePrograms: { added: degreesAdded, updated: degreesUpdated },
      minors: { added: minorsAdded, updated: minorsUpdated },
      certificates: { added: certsAdded, updated: certsUpdated },
      duration: `${duration}ms`
    });
    
  } catch (error) {
    console.error('❌ Error processing department:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================
// API ENDPOINTS FOR HISTORICAL CATALOG DATA
// ============================================

// Get all catalog years available
app.get('/api/catalog-years', async (req, res) => {
  try {
    const years = await dbAll(`
      SELECT DISTINCT catalogYear, COUNT(*) as departmentCount
      FROM departments
      GROUP BY catalogYear
      ORDER BY catalogYear DESC
    `);
    res.json({ years, total: years.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get departments by catalog year
app.get('/api/departments', async (req, res) => {
  try {
    const { catalogYear } = req.query;
    
    let sql = 'SELECT * FROM departments';
    let params = [];
    
    if (catalogYear) {
      sql += ' WHERE catalogYear = ?';
      params.push(catalogYear);
    }
    sql += ' ORDER BY name';
    
    const departments = await dbAll(sql, params);
    res.json({ departments, total: departments.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get degree programs by catalog year
app.get('/api/degree-programs', async (req, res) => {
  try {
    const { catalogYear, departmentId } = req.query;
    
    let whereClauses = [];
    let params = [];
    
    if (catalogYear) {
      whereClauses.push('catalogYear = ?');
      params.push(catalogYear);
    }
    if (departmentId) {
      whereClauses.push('departmentId = ?');
      params.push(departmentId);
    }
    
    let sql = 'SELECT * FROM degree_programs';
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }
    sql += ' ORDER BY title';
    
    const programs = await dbAll(sql, params);
    res.json({ programs, total: programs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search degree programs across all years
app.get('/api/degree-programs/search', async (req, res) => {
  try {
    const { q, catalogYear } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    
    let sql = `
      SELECT dp.*, d.name as departmentName
      FROM degree_programs dp
      LEFT JOIN departments d ON dp.departmentId = d.id AND dp.catalogYear = d.catalogYear
      WHERE dp.title LIKE ?
    `;
    let params = [`%${q}%`];
    
    if (catalogYear) {
      sql += ' AND dp.catalogYear = ?';
      params.push(catalogYear);
    }
    
    sql += ' ORDER BY dp.catalogYear DESC, dp.title';
    
    const programs = await dbAll(sql, params);
    res.json({ programs, total: programs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear data
app.post('/api/clear', async (req, res) => {
  try {
    const { campus, term, year } = req.body;

    if (term && year) {
      // Delete specific semester (all campuses or specific campus)
      if (campus) {
        // Delete specific campus + term + year
        const result1 = await dbRun('DELETE FROM enrollment_history WHERE uniqueId LIKE ?', [`${campus}-${term}-${year}-%`]);
        const result2 = await dbRun('DELETE FROM courses WHERE campus = ? AND term = ? AND year = ?', [campus, term, year]);
        res.json({
          success: true,
          message: `Cleared ${campus} ${term} ${year}`,
          coursesDeleted: result2.changes || 0
        });
      } else {
        // Delete term + year for ALL campuses
        const result1 = await dbRun('DELETE FROM enrollment_history WHERE uniqueId LIKE ?', [`%-${term}-${year}-%`]);
        const result2 = await dbRun('DELETE FROM courses WHERE term = ? AND year = ?', [term, year]);
        res.json({
          success: true,
          message: `Cleared ${term} ${year} for all campuses`,
          coursesDeleted: result2.changes || 0
        });
      }
    } else if (campus && !term && !year) {
      // Delete all data for a specific campus
      const result1 = await dbRun('DELETE FROM enrollment_history WHERE uniqueId LIKE ?', [`${campus}-%`]);
      const result2 = await dbRun('DELETE FROM courses WHERE campus = ?', [campus]);
      res.json({
        success: true,
        message: `Cleared all data for ${campus}`,
        coursesDeleted: result2.changes || 0
      });
    } else {
      // Clear ALL data
      await dbRun('DELETE FROM courses');
      await dbRun('DELETE FROM enrollment_history');
      res.json({ success: true, message: 'All data cleared' });
    }
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear catalog data (departments, degrees, minors, certificates)
app.post('/api/clear-catalog', async (req, res) => {
  try {
    const { catalogYear } = req.body;

    if (catalogYear) {
      // Delete specific catalog year
      const deptResult = await dbRun('DELETE FROM departments WHERE catalogYear = ?', [catalogYear]);
      const degreeResult = await dbRun('DELETE FROM degree_programs WHERE catalogYear = ?', [catalogYear]);
      const minorResult = await dbRun('DELETE FROM minors WHERE catalogYear = ?', [catalogYear]);
      const certResult = await dbRun('DELETE FROM certificates WHERE catalogYear = ?', [catalogYear]);
      
      res.json({
        success: true,
        message: `Cleared catalog data for ${catalogYear}`,
        deleted: {
          departments: deptResult.changes || 0,
          degreePrograms: degreeResult.changes || 0,
          minors: minorResult.changes || 0,
          certificates: certResult.changes || 0
        }
      });
    } else {
      // Clear ALL catalog data
      await dbRun('DELETE FROM departments');
      await dbRun('DELETE FROM degree_programs');
      await dbRun('DELETE FROM minors');
      await dbRun('DELETE FROM certificates');
      res.json({ success: true, message: 'All catalog data cleared' });
    }
  } catch (error) {
    console.error('Error clearing catalog data:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UNIFIED CATALOG API ENDPOINTS
// For n8n workflow integration
// ============================================

// Get loaded catalog years
app.get('/api/catalog/years', async (req, res) => {
  try {
    const years = await dbAll('SELECT DISTINCT year FROM catalog_years ORDER BY year');
    res.json({
      years: years.map(r => r.year),
      count: years.length
    });
  } catch (error) {
    console.error('Error getting catalog years:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize catalog data from text files (for historical years)
app.post('/api/catalog/init', async (req, res) => {
  try {
    const { years } = req.body;
    const extractCatalog = require('./extract-catalog.js');
    
    const results = { loaded: [], skipped: [], errors: [] };
    const yearsToLoad = years || extractCatalog.SUPPORTED_YEARS;
    
    for (const year of yearsToLoad) {
      try {
        // Check if already loaded
        const existing = await dbGet('SELECT year FROM catalog_years WHERE year = ?', [year]);
        if (existing) {
          results.skipped.push(year);
          continue;
        }
        
        // Extract from text file
        const data = extractCatalog.extractCatalogYear(year);
        if (!data) {
          results.errors.push({ year, error: 'Failed to extract' });
          continue;
        }
        
        // Insert year record
        await dbRun(
          'INSERT INTO catalog_years (year, loaded_at, source) VALUES (?, datetime("now"), ?)',
          [year, 'text_file']
        );
        
        // Insert degrees
        for (const degree of data.degrees) {
          await dbRun(
            `INSERT INTO catalog_degrees (name, credits, catalog_year, source_type) 
             VALUES (?, ?, ?, ?)`,
            [degree.name, degree.credits, year, 'pdf']
          );
        }
        
        // Insert minors
        for (const minor of data.minors) {
          await dbRun(
            `INSERT INTO catalog_minors (name, catalog_year, source_type) 
             VALUES (?, ?, ?)`,
            [minor.name, year, 'pdf']
          );
        }
        
        // Insert certificates
        for (const cert of data.certificates) {
          await dbRun(
            `INSERT INTO catalog_certificates (name, catalog_year, source_type) 
             VALUES (?, ?, ?)`,
            [cert.name, year, 'pdf']
          );
        }
        
        results.loaded.push({
          year,
          degrees: data.degrees.length,
          minors: data.minors.length,
          certificates: data.certificates.length
        });
        
      } catch (yearError) {
        results.errors.push({ year, error: yearError.message });
      }
    }
    
    res.json({
      status: 'completed',
      ...results
    });
    
  } catch (error) {
    console.error('Error initializing catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook to save catalog programs (unified format from HTML or PDF)
app.post('/webhook/catalog-programs', webhookAuth, async (req, res) => {
  try {
    const { catalogYear, degrees = [], minors = [], certificates = [], sourceType = 'html' } = req.body;
    
    if (!catalogYear) {
      return res.status(400).json({ error: 'catalogYear is required' });
    }
    
    const results = { added: { degrees: 0, minors: 0, certificates: 0 }, errors: [] };
    
    // Check if year exists, create if not
    const yearExists = await dbGet('SELECT year FROM catalog_years WHERE year = ?', [catalogYear]);
    if (!yearExists) {
      await dbRun(
        'INSERT INTO catalog_years (year, loaded_at, source) VALUES (?, datetime("now"), ?)',
        [catalogYear, sourceType]
      );
    }
    
    // Insert degrees
    for (const degree of degrees) {
      try {
        const result = await dbRun(
          `INSERT OR REPLACE INTO catalog_degrees 
           (name, credits, catalog_year, degree_type, college, url, source_type, external_id, narrative) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            degree.name, 
            degree.totalCredits || degree.credits || null,
            catalogYear,
            degree.degreeType || null,
            degree.college || null,
            degree.url || null,
            sourceType,
            degree.externalId || null,
            degree.narrative || null
          ]
        );
        
        const degreeId = result.lastID;
        
        // Save course requirements (sequenceItems) if provided
        if (degree.sequenceItems && Array.isArray(degree.sequenceItems)) {
          // Delete existing requirements for this degree
          await dbRun('DELETE FROM degree_requirements WHERE degree_id = ?', [degreeId]);
          
          // Insert new requirements
          for (const item of degree.sequenceItems) {
            await dbRun(
              `INSERT INTO degree_requirements 
               (degree_id, catalog_year, year, term, label, hours, sort_order, footnotes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                degreeId,
                catalogYear,
                item.year || null,
                item.term || null,
                item.label || null,
                item.hours || null,
                item.sortOrder || null,
                item.footnotes ? JSON.stringify(item.footnotes) : null
              ]
            );
          }
        }
        
        results.added.degrees++;
      } catch (err) {
        results.errors.push({ type: 'degree', name: degree.name, error: err.message });
      }
    }
    
    // Insert minors (with narrative support)
    for (const minor of minors) {
      try {
        await dbRun(
          `INSERT OR REPLACE INTO catalog_minors
           (name, catalog_year, url, source_type, narrative)
           VALUES (?, ?, ?, ?, ?)`,
          [minor.name, catalogYear, minor.url || null, sourceType, minor.narrative || null]
        );
        results.added.minors++;
      } catch (err) {
        results.errors.push({ type: 'minor', name: minor.name, error: err.message });
      }
    }

    // Insert certificates (with description support)
    for (const cert of certificates) {
      try {
        await dbRun(
          `INSERT OR REPLACE INTO catalog_certificates
           (name, catalog_year, url, source_type, description)
           VALUES (?, ?, ?, ?, ?)`,
          [cert.name, catalogYear, cert.url || null, sourceType, cert.description || cert.narrative || null]
        );
        results.added.certificates++;
      } catch (err) {
        results.errors.push({ type: 'certificate', name: cert.name, error: err.message });
      }
    }

    // Helper: extract course codes from free text (fallback when prereq arrays are missing)
    const extractCourseCodes = (text) => {
      if (!text || typeof text !== 'string') return [];
      // Find tokens like 'CPTS 121', 'CPT S 121', 'MATH 171', etc.
      // Allow optional spaces inside alpha portion and optional punctuation.
      const re = /([A-Za-z]{1,8}(?:\s+[A-Za-z])?(?:\s*)[-–:]?\s*\d{3})/g;
      const matches = [];
      const blacklist = new Set(['OR', 'AND', 'ONE', 'BY', 'WITH', 'A', 'THE', 'OR,']);
      let m;
      while ((m = re.exec(text)) !== null) {
        let code = m[1].toUpperCase();
        // Normalize spaces inside the alpha part: e.g. 'CPT S 121' -> 'CPTS 121'
        code = code.replace(/([A-Z])\s+(?=[A-Z])/g, '$1');
        // Collapse multiple spaces
        code = code.replace(/\s+/g, ' ');
        // Ensure format PREFIX NUMBER
        const parts = code.split(' ');
        if (parts.length >= 2) {
          const num = parts.pop();
          const prefix = parts.join('').replace(/[^A-Z]/g, '');
          if (!prefix || prefix.length < 2) continue; // ignore tiny prefixes
          if (blacklist.has(prefix)) continue;
          // basic sanity: number should be 3 digits
          if (!/^\d{3}$/.test(num)) continue;
          matches.push(`${prefix} ${num}`);
        }
      }
      // Deduplicate preserving order
      return [...new Set(matches)];
    };

    // Insert catalog courses (normalized course descriptions/prereqs offered by n8n)
    if (req.body.courses && Array.isArray(req.body.courses)) {
      results.added.courses = 0;
      for (const c of req.body.courses) {
        try {
          // Build prerequisite codes fallback: prefer provided array, else parse raw text
          let prereqCodesJson = null;
          if (c.prerequisiteCodes && Array.isArray(c.prerequisiteCodes) && c.prerequisiteCodes.length) {
            prereqCodesJson = JSON.stringify(c.prerequisiteCodes);
          } else if (c.prerequisiteRaw || c.prerequisite_raw) {
            const parsed = extractCourseCodes(c.prerequisiteRaw || c.prerequisite_raw);
            prereqCodesJson = parsed.length ? JSON.stringify(parsed) : null;
            // also set on object for any downstream use
            if (parsed.length) c.prerequisiteCodes = parsed;
          }

          await dbRun(
            `INSERT OR REPLACE INTO catalog_courses
             (unique_id, catalog_year, code, prefix, number, title, description, credits, credits_phrase,
              ucore, prerequisite_raw, prerequisite_codes, offered_raw, offered_terms, attributes, footnotes,
              alternatives, is_non_credit, source_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              c.uniqueId || c.unique_id || c.code || null,
              catalogYear,
              c.code || null,
              c.prefix || null,
              c.number || null,
              c.title || null,
              c.description || null,
              (c.credits !== undefined && c.credits !== null) ? c.credits : null,
              c.creditsPhrase || c.credits_phrase || null,
              c.ucore || null,
              c.prerequisiteRaw || c.prerequisite_raw || null,
              prereqCodesJson,
              c.offeredRaw || c.offered_raw || null,
              c.offeredTerms ? JSON.stringify(c.offeredTerms) : null,
              c.attributes ? JSON.stringify(c.attributes) : null,
              c.footnotes ? JSON.stringify(c.footnotes) : null,
              c.alternatives ? JSON.stringify(c.alternatives) : null,
              c.isNonCredit || c.is_non_credit || 0,
              sourceType
            ]
          );
          results.added.courses++;
        } catch (err) {
          results.errors.push({ type: 'catalog_course', code: c.code || c.uniqueId, error: err.message });
        }
      }
    }

    // Repair existing catalog rows for this year: parse prerequisite_raw for rows
    // where prerequisite_codes is missing, empty, or contains obvious bad tokens.
    const repairCatalogPrereqs = async (year) => {
      try {
        const rows = await dbAll(
          `SELECT id, code, prerequisite_raw, prerequisite_codes FROM catalog_courses
           WHERE catalog_year = ? AND (prerequisite_codes IS NULL OR prerequisite_codes = '[]' OR prerequisite_codes LIKE '%"OR %' OR prerequisite_codes LIKE '%"AND %' OR prerequisite_codes LIKE '%"ONE %')
           AND prerequisite_raw IS NOT NULL AND prerequisite_raw <> ''`,
          [year]
        );

        if (!rows || rows.length === 0) return { updated: 0 };
        let updated = 0;
        for (const r of rows) {
          const parsed = extractCourseCodes(r.prerequisite_raw);
          if (parsed && parsed.length) {
            await dbRun('UPDATE catalog_courses SET prerequisite_codes = ? WHERE id = ?', [JSON.stringify(parsed), r.id]);
            updated++;
          }
        }
        return { updated };
      } catch (err) {
        console.error('Error repairing catalog prereqs:', err);
        return { updated: 0, error: err.message };
      }
    };

    // Run repair for this catalog year so newly posted or pre-existing rows get normalized.
    try {
      const repairResult = await repairCatalogPrereqs(catalogYear);
      if (repairResult && repairResult.updated) {
        console.log(`🔧 Repaired ${repairResult.updated} prerequisite_codes for catalog year ${catalogYear}`);
        results.repaired = repairResult.updated;
      }
    } catch (err) {
      console.error('Repair step failed:', err);
    }
    
    console.log(`📥 Catalog programs saved for ${catalogYear}: ${results.added.degrees} degrees, ${results.added.minors} minors, ${results.added.certificates} certificates`);
    
    res.json({
      status: 'success',
      catalogYear,
      ...results
    });
    
  } catch (error) {
    console.error('Error saving catalog programs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get catalog summary by year
app.get('/api/catalog/summary', async (req, res) => {
  try {
    const summary = await dbAll(`
      SELECT 
        cy.year,
        cy.loaded_at,
        cy.source,
        (SELECT COUNT(*) FROM catalog_degrees WHERE catalog_year = cy.year) as degrees,
        (SELECT COUNT(*) FROM catalog_minors WHERE catalog_year = cy.year) as minors,
        (SELECT COUNT(*) FROM catalog_certificates WHERE catalog_year = cy.year) as certificates
      FROM catalog_years cy
      ORDER BY cy.year DESC
    `);
    
    res.json({
      years: summary,
      totals: {
        degrees: summary.reduce((sum, y) => sum + y.degrees, 0),
        minors: summary.reduce((sum, y) => sum + y.minors, 0),
        certificates: summary.reduce((sum, y) => sum + y.certificates, 0)
      }
    });
  } catch (error) {
    console.error('Error getting catalog summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get catalog courses (parsed fields) for a given year
app.get('/api/catalog/courses', async (req, res) => {
  try {
    // Supported filters: year, code, prefix, ucore, minCredits, maxCredits, term, campus, search, limit
    let { year, code, prefix, ucore, minCredits, maxCredits, term, campus, search, limit } = req.query;
    if (!year) {
      // pick latest year if none provided
      const y = await dbGet('SELECT year FROM catalog_years ORDER BY year DESC LIMIT 1');
      year = y ? y.year : null;
    }
    if (!year) return res.status(400).json({ error: 'year query parameter is required or no catalog years available' });

    const where = ['catalog_year = ?'];
    const params = [year];

    if (code) {
      where.push('code = ?');
      params.push(code);
    }
    if (prefix) {
      where.push('LOWER(prefix) = LOWER(?)');
      params.push(prefix);
    }
    if (ucore) {
      // match token in ucore column (stored as comma-separated or single token)
      where.push("LOWER(ucore) LIKE LOWER(?)");
      params.push(`%${ucore}%`);
    }
    if (minCredits) {
      where.push('credits >= ?');
      params.push(parseFloat(minCredits));
    }
    if (maxCredits) {
      where.push('credits <= ?');
      params.push(parseFloat(maxCredits));
    }
    if (term) {
      // offered_terms stored as JSON/text; do a LIKE match for the term token
      where.push('LOWER(offered_terms) LIKE LOWER(?)');
      params.push(`%${term}%`);
    }
    if (search) {
      where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR LOWER(code) LIKE LOWER(?))');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const limitNum = parseInt(limit, 10) || 100;

    const query = `SELECT id, unique_id, code, prefix, number, title, description, credits, credits_phrase, ucore, prerequisite_raw, prerequisite_codes, offered_terms, footnotes, attributes
      FROM catalog_courses WHERE ${where.join(' AND ')} ORDER BY prefix, number LIMIT ${limitNum}`;

    const rows = await dbAll(query, params);

    // For campus/availability info: query live courses table for matching prefix+courseNumber
    const out = [];
    for (const r of rows) {
      const codeKey = r.code || `${r.prefix} ${r.number}`;
      // find distinct campuses/terms where this course appears in live `courses` table
      const availability = await dbAll(`
        SELECT DISTINCT campus, term, year
        FROM courses
        WHERE LOWER(prefix) = LOWER(?) AND courseNumber = ?
        ORDER BY year DESC, term
        LIMIT 10
      `, [r.prefix || '', String(r.number || '')]);

      out.push({
        id: r.id,
        unique_id: r.unique_id,
        code: r.code || codeKey,
        prefix: r.prefix,
        number: r.number,
        title: r.title,
        description: r.description,
        credits: r.credits,
        credits_phrase: r.credits_phrase,
        ucore: r.ucore,
        prerequisite_raw: r.prerequisite_raw,
        prerequisite_codes: r.prerequisite_codes ? JSON.parse(r.prerequisite_codes) : [],
        offered_terms: r.offered_terms ? JSON.parse(r.offered_terms) : [],
        footnotes: r.footnotes,
        attributes: r.attributes,
        availability // array of { campus, term, year }
      });
    }

    res.json({ year, total: out.length, courses: out });
  } catch (err) {
    console.error('Error fetching catalog courses:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search across all catalog years
app.get('/api/catalog/search', async (req, res) => {
  try {
    const { q, type, year } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const searchTerm = `%${q}%`;
    const results = { degrees: [], minors: [], certificates: [] };
    
    // Search degrees
    if (!type || type === 'degree' || type === 'all') {
      let query = 'SELECT * FROM catalog_degrees WHERE name LIKE ?';
      const params = [searchTerm];
      if (year) {
        query += ' AND catalog_year = ?';
        params.push(year);
      }
      query += ' ORDER BY catalog_year DESC, name';
      results.degrees = await dbAll(query, params);
    }
    
    // Search minors
    if (!type || type === 'minor' || type === 'all') {
      let query = 'SELECT * FROM catalog_minors WHERE name LIKE ?';
      const params = [searchTerm];
      if (year) {
        query += ' AND catalog_year = ?';
        params.push(year);
      }
      query += ' ORDER BY catalog_year DESC, name';
      results.minors = await dbAll(query, params);
    }
    
    // Search certificates
    if (!type || type === 'certificate' || type === 'all') {
      let query = 'SELECT * FROM catalog_certificates WHERE name LIKE ?';
      const params = [searchTerm];
      if (year) {
        query += ' AND catalog_year = ?';
        params.push(year);
      }
      query += ' ORDER BY catalog_year DESC, name';
      results.certificates = await dbAll(query, params);
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error searching catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);

    } else {
      console.log(' Database closed');
    }
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log(' WSU Course Scraper API Server (SQLITE)');
  console.log(` Running on http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log(` Statistics: http://localhost:${PORT}/api/stats`);
  console.log(` Webhook: http://localhost:${PORT}/webhook/courses`);
  console.log('');
  console.log(' SQLite Features:');
  console.log('   - No file locking issues!');
  console.log('   - ACID transactions (atomic, consistent)');
  console.log('   - Concurrent access (WAL mode)');
  console.log('   - Enrollment history tracking');
  console.log('   - Fast queries with indexes');
  console.log('');
});
