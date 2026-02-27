-- ============================================================================
-- Negative Example Memory — Seed Data (35 Anti-Patterns)
-- ============================================================================

-- ===================== SECURITY (10) =====================

-- 1. SQL Injection via String Concatenation (CWE-89)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'sql_injection', 89, 'A03:2021-Injection', 'critical',
    'SQL Injection via String Concatenation',
    'Building SQL queries by concatenating user input allows attackers to inject arbitrary SQL. This can lead to data theft, modification, or complete database compromise. One of the most common and dangerous web vulnerabilities.',
    'Developers use f-strings or string concatenation for convenience, bypassing ORM parameterized query protections.',
    E'# BAD\nquery = f"SELECT * FROM patients WHERE id = ''{user_input}''"  \ncursor.execute(query)\n\n# Also BAD\nquery = "SELECT * FROM users WHERE name = ''" + name + "''"  \ncursor.execute(query)',
    E'# GOOD\nquery = "SELECT * FROM patients WHERE id = %s"\ncursor.execute(query, (user_input,))\n\n# Or with ORM\npatient = session.query(Patient).filter(Patient.id == user_input).first()',
    'Grep for f-strings or .format() inside execute() calls. Look for string concatenation near SQL keywords.',
    'Always use parameterized queries. Never concatenate user input into SQL. Use ORM query builders when possible.',
    ARRAY['python', 'postgresql', 'sql', 'javascript', 'node'], ARRAY['sqlalchemy', 'psycopg2', 'knex', 'sequelize'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 2. Hardcoded Secrets (CWE-798)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'hardcoded_secrets', 798, 'A07:2021-Identification and Authentication Failures', 'critical',
    'Hardcoded Secrets in Source Code',
    'API keys, database passwords, and JWT secrets committed directly in source code are trivially extractable. They persist in git history even after deletion and can be harvested by automated scanners.',
    'Developers hardcode credentials during development and forget to externalize them before committing. Copy-paste from documentation.',
    E'# BAD\nAPI_KEY = "sk-ant-api03-REAL_KEY_HERE"\nDB_PASSWORD = "production_p@ssw0rd!"\nJWT_SECRET = "my-super-secret-jwt-key"',
    E'# GOOD\nimport os\nAPI_KEY = os.environ["ANTHROPIC_API_KEY"]\nDB_PASSWORD = os.environ["DB_PASSWORD"]\nJWT_SECRET = os.environ["JWT_SECRET"]\n\n# Or use a secrets manager\nfrom aws_secretsmanager import get_secret\nAPI_KEY = get_secret("anthropic-api-key")',
    'Grep for patterns: api_key=, password=, secret=, token= with string literal values. Use tools like truffleHog or git-secrets.',
    'Use environment variables or a secrets manager. Add .env to .gitignore. Use pre-commit hooks to scan for secrets.',
    ARRAY['python', 'javascript', 'node', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 3. Missing Input Validation (CWE-20)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'missing_input_validation', 20, 'A03:2021-Injection', 'high',
    'Missing Input Validation on API Endpoints',
    'Accepting unvalidated user input leads to injection attacks, type errors, and data corruption. API endpoints that trust request bodies without schema validation are vulnerable to malformed or malicious data.',
    'Developers access request body fields directly without validation, assuming clients will always send correct data.',
    E'# BAD\n@app.post("/patients")\nasync def create_patient(request: Request):\n    data = await request.json()\n    name = data["name"]  # No validation\n    age = data["age"]    # Could be string, negative, etc.\n    db.execute("INSERT INTO patients VALUES (%s, %s)", (name, age))',
    E'# GOOD\nfrom pydantic import BaseModel, validator\n\nclass PatientCreate(BaseModel):\n    name: str = Field(..., min_length=1, max_length=200)\n    age: int = Field(..., ge=0, le=150)\n\n@app.post("/patients")\nasync def create_patient(patient: PatientCreate):\n    db.execute("INSERT INTO patients VALUES (%s, %s)", (patient.name, patient.age))',
    'Look for direct request.json() or req.body access without Pydantic/Zod/Joi schema validation.',
    'Use schema validation libraries (Pydantic, Zod, Joi) on all API inputs. Define explicit types, ranges, and constraints.',
    ARRAY['python', 'javascript', 'typescript', 'node'], ARRAY['fastapi', 'flask', 'express', 'django'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 4. Insecure Deserialization (CWE-502)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'insecure_deserialization', 502, 'A08:2021-Software and Data Integrity Failures', 'critical',
    'Insecure Deserialization with pickle/eval',
    'Using pickle.loads() or eval() on untrusted data allows arbitrary code execution. An attacker can craft a serialized payload that runs system commands when deserialized.',
    'Developers use pickle for convenience without realizing it can execute arbitrary Python code during deserialization.',
    E'# BAD\nimport pickle\ndata = pickle.loads(request.body)  # Arbitrary code execution!\n\n# Also BAD\nconfig = eval(request.args.get("config"))  # Code injection',
    E'# GOOD\nimport json\ndata = json.loads(request.body)  # Safe: only parses data\n\n# For complex types, use explicit schemas\nfrom pydantic import BaseModel\ndata = MyModel.model_validate_json(request.body)',
    'Grep for pickle.loads, eval(), exec() with external input. Check for yaml.load() without Loader=SafeLoader.',
    'Never deserialize untrusted data with pickle/eval. Use JSON or explicit schema validation. If pickle is needed, use hmac signing.',
    ARRAY['python'], ARRAY['flask', 'django', 'fastapi'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 5. Missing Authentication Check (CWE-306)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'missing_auth', 306, 'A01:2021-Broken Access Control', 'critical',
    'Missing Authentication on Sensitive Endpoints',
    'API endpoints that handle sensitive data or operations without authentication allow any user (or bot) to access them. This is especially dangerous for admin endpoints and data modification routes.',
    'New endpoints are added without auth middleware, or developers assume reverse-proxy auth handles it.',
    E'# BAD\n@app.delete("/api/users/{user_id}")\nasync def delete_user(user_id: str):\n    db.execute("DELETE FROM users WHERE id = %s", (user_id,))\n    return {"status": "deleted"}  # No auth check!',
    E'# GOOD\n@app.delete("/api/users/{user_id}")\nasync def delete_user(user_id: str, current_user: User = Depends(get_current_user)):\n    if not current_user.is_admin:\n        raise HTTPException(status_code=403, detail="Admin required")\n    db.execute("DELETE FROM users WHERE id = %s", (user_id,))\n    return {"status": "deleted"}',
    'Check route definitions for missing auth decorators or middleware. Look for sensitive operations without Depends() or @login_required.',
    'Apply authentication middleware to all routes by default. Use allowlist for public endpoints. Review new endpoints in code review.',
    ARRAY['python', 'javascript', 'node'], ARRAY['fastapi', 'express', 'django'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 6. Cross-Site Scripting (CWE-79)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'xss', 79, 'A03:2021-Injection', 'high',
    'Cross-Site Scripting via Unescaped Output',
    'Rendering user-supplied content without escaping allows attackers to inject JavaScript that executes in other users'' browsers. This enables session hijacking, credential theft, and defacement.',
    'Developers use dangerouslySetInnerHTML, innerHTML, or template literal injection without sanitization.',
    E'// BAD (React)\nreturn <div dangerouslySetInnerHTML={{__html: userComment}} />\n\n// BAD (vanilla JS)\nelement.innerHTML = userInput;\n\n// BAD (template)\nreturn `<p>${userBio}</p>`',
    E'// GOOD (React — auto-escapes by default)\nreturn <div>{userComment}</div>\n\n// GOOD (if HTML needed, sanitize first)\nimport DOMPurify from "dompurify";\nreturn <div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userComment)}} />',
    'Grep for dangerouslySetInnerHTML, innerHTML, v-html. Look for template literals building HTML with user data.',
    'Use framework auto-escaping (React JSX, Django templates). When raw HTML is needed, sanitize with DOMPurify or bleach.',
    ARRAY['javascript', 'typescript', 'html'], ARRAY['react', 'vue', 'angular', 'express'], ARRAY['web'],
    'curated_seed', 0.90
);

-- 7. Weak Random Number Generation (CWE-330)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'weak_random', 330, 'A02:2021-Cryptographic Failures', 'high',
    'Weak Random Number Generation for Security Tokens',
    'Using Math.random() or Python''s random module for security-sensitive values (tokens, session IDs, passwords) produces predictable output. These PRNGs are not cryptographically secure and can be predicted by attackers.',
    'Developers reach for the familiar random module without realizing it is not suitable for security-critical randomness.',
    E'# BAD (Python)\nimport random\ntoken = "".join(random.choices("abcdef0123456789", k=32))\n\n// BAD (JavaScript)\nconst token = Math.random().toString(36).substring(2);',
    E'# GOOD (Python)\nimport secrets\ntoken = secrets.token_hex(32)\n\n// GOOD (JavaScript)\nimport crypto from "crypto";\nconst token = crypto.randomBytes(32).toString("hex");',
    'Grep for Math.random() or import random in security contexts (token generation, session IDs, nonces).',
    'Use secrets module (Python) or crypto.randomBytes (Node.js) for all security-sensitive random values.',
    ARRAY['python', 'javascript', 'node'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 8. PHI/PII in Log Files (HIPAA)
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'phi_in_logs', 532, 'A09:2021-Security Logging and Monitoring Failures', 'critical',
    'Protected Health Information (PHI) Leaked in Log Files',
    'Logging full request bodies, patient records, or PII/PHI violates HIPAA and GDPR. Log files are often stored unencrypted, retained indefinitely, and accessible to operations teams without need-to-know.',
    'Developers log request/response bodies for debugging without filtering sensitive fields. Debug logging left enabled in production.',
    E'# BAD\nlogger.info(f"Received billing data: {request.body}")\nlogger.debug(f"Patient record: {patient.to_dict()}")\nlogger.error(f"Failed to process SSN: {ssn}")',
    E'# GOOD\nlogger.info(f"Received billing request for patient_id={request.patient_id}")\nlogger.debug(f"Processing record id={patient.id}, type={patient.record_type}")\nlogger.error(f"Failed to process identity verification for patient_id={patient_id}")',
    'Grep for logging calls that include request.body, patient, ssn, dob, address, or .to_dict() in log messages.',
    'Log only IDs and metadata, never raw PII/PHI. Use structured logging with explicit field allowlists. Audit log statements in code review.',
    ARRAY['python', 'javascript', 'node', 'any'], ARRAY['any'], ARRAY['healthcare', 'fintech', 'any'],
    'curated_seed', 0.90
);

-- 9. Permissive CORS Configuration
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'permissive_cors', 942, 'A05:2021-Security Misconfiguration', 'high',
    'Permissive CORS Allowing All Origins',
    'Setting Access-Control-Allow-Origin to * or reflecting the Origin header without validation allows any website to make authenticated requests to your API, enabling CSRF-like attacks and data theft.',
    'Developers set allow_origins=["*"] to fix CORS errors during development and ship it to production.',
    E'# BAD\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=["*"],\n    allow_credentials=True,  # Especially dangerous with *\n    allow_methods=["*"],\n)\n\n// BAD (Express)\napp.use(cors({ origin: true, credentials: true }));',
    E'# GOOD\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=["https://app.example.com", "https://admin.example.com"],\n    allow_credentials=True,\n    allow_methods=["GET", "POST", "PUT", "DELETE"],\n    allow_headers=["Authorization", "Content-Type"],\n)\n\n// GOOD (Express)\napp.use(cors({ origin: ["https://app.example.com"], credentials: true }));',
    'Grep for allow_origins=["*"], origin: true, or Access-Control-Allow-Origin: * in middleware config.',
    'Explicitly list allowed origins. Never use * with credentials. Use environment-specific CORS configs.',
    ARRAY['python', 'javascript', 'node'], ARRAY['fastapi', 'express', 'django', 'flask'], ARRAY['web'],
    'curated_seed', 0.90
);

-- 10. JWT Without Expiration
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'security_vulnerability', 'jwt_no_expiry', 613, 'A07:2021-Identification and Authentication Failures', 'high',
    'JWT Tokens Without Expiration',
    'Issuing JWTs without an expiration claim means tokens are valid forever. If a token is leaked, there is no way to invalidate it without implementing a blocklist, which defeats the purpose of stateless JWTs.',
    'Developers omit the exp claim for convenience or because they plan to add token refresh "later" but never do.',
    E'# BAD\ntoken = jwt.encode({"sub": user_id}, SECRET_KEY, algorithm="HS256")\n# No exp claim — token valid forever\n\n// BAD (Node)\nconst token = jwt.sign({ sub: userId }, SECRET, { /* no expiresIn */ });',
    E'# GOOD\nfrom datetime import datetime, timedelta\ntoken = jwt.encode(\n    {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=1)},\n    SECRET_KEY,\n    algorithm="HS256"\n)\n\n// GOOD (Node)\nconst token = jwt.sign({ sub: userId }, SECRET, { expiresIn: "1h" });',
    'Grep for jwt.encode or jwt.sign calls without exp or expiresIn. Check JWT creation utility functions.',
    'Always set exp claim. Use short-lived access tokens (15m-1h) with refresh tokens. Implement token rotation.',
    ARRAY['python', 'javascript', 'node'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- ===================== PERFORMANCE (8) =====================

-- 11. N+1 Query Problem
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'n_plus_one_queries', NULL, NULL, 'high',
    'N+1 Query Problem in ORM Loops',
    'Fetching a list of parent records and then lazily loading related records in a loop causes N+1 database queries instead of 1-2. For 1000 records, this means 1001 queries, causing severe latency and database load.',
    'ORM lazy loading makes it invisible — each attribute access triggers a hidden query. Developers don''t see the queries being generated.',
    E'# BAD (SQLAlchemy)\norders = session.query(Order).all()\nfor order in orders:\n    print(order.customer.name)  # Each .customer triggers a query!\n    for item in order.items:     # Each .items triggers another query!\n        print(item.product.name)',
    E'# GOOD (SQLAlchemy — eager loading)\nfrom sqlalchemy.orm import joinedload\norders = session.query(Order).options(\n    joinedload(Order.customer),\n    joinedload(Order.items).joinedload(OrderItem.product)\n).all()\n\n# GOOD (Django)\norders = Order.objects.select_related("customer").prefetch_related("items__product").all()',
    'Enable SQL query logging and count queries per request. Look for loops iterating ORM objects and accessing relationships.',
    'Use eager loading (joinedload/selectinload in SQLAlchemy, select_related/prefetch_related in Django). Monitor query counts per request.',
    ARRAY['python', 'javascript', 'node'], ARRAY['sqlalchemy', 'django', 'sequelize', 'typeorm'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 12. Missing Database Indexes
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'missing_indexes', NULL, NULL, 'high',
    'Missing Database Indexes on Frequently Queried Columns',
    'Queries filtering or joining on unindexed columns cause full table scans. Performance degrades linearly with table size — what works with 1000 rows becomes unusable at 1 million.',
    'Developers create tables and queries but forget to add indexes for WHERE clause columns, foreign keys, and ORDER BY columns.',
    E'-- BAD: No index on patient_id, query scans entire table\nSELECT * FROM billing_records WHERE patient_id = ''abc-123'';\nSELECT * FROM appointments WHERE doctor_id = 42 ORDER BY appointment_date;\n-- With 10M rows, these take seconds instead of milliseconds',
    E'-- GOOD: Add indexes for query patterns\nCREATE INDEX idx_billing_patient ON billing_records(patient_id);\nCREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date);\n\n-- Use EXPLAIN to verify\nEXPLAIN ANALYZE SELECT * FROM billing_records WHERE patient_id = ''abc-123'';',
    'Run EXPLAIN ANALYZE on slow queries. Check for Seq Scan on large tables. Review WHERE, JOIN ON, and ORDER BY columns.',
    'Add indexes for all foreign keys, frequently filtered columns, and sort columns. Use composite indexes for multi-column queries. Monitor slow query log.',
    ARRAY['postgresql', 'mysql', 'sql', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 13. Unbounded SELECT Queries
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'unbounded_select', NULL, NULL, 'high',
    'Unbounded SELECT Without LIMIT',
    'Queries without LIMIT can return millions of rows, consuming memory, saturating network bandwidth, and crashing the application. A table that starts small can grow silently until the query becomes a ticking time bomb.',
    'Developers write SELECT * during development with small datasets. No LIMIT is added because it works fine initially.',
    E'# BAD\nresults = db.execute("SELECT * FROM audit_log").fetchall()\n# Works with 100 rows, OOM-kills with 10 million\n\n# Also BAD\nall_users = User.objects.all()  # No limit',
    E'# GOOD\nresults = db.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100 OFFSET 0").fetchall()\n\n# GOOD (Django)\nrecent_users = User.objects.all().order_by("-created_at")[:100]\n\n# GOOD (cursor-based pagination)\nresults = db.execute(\n    "SELECT * FROM audit_log WHERE created_at < %s ORDER BY created_at DESC LIMIT 100",\n    (last_seen_timestamp,)\n).fetchall()',
    'Grep for SELECT * or .all() without LIMIT or slicing. Check API endpoints that return lists.',
    'Always add LIMIT to queries. Use cursor-based pagination for large datasets. Set default and maximum page sizes in API config.',
    ARRAY['python', 'javascript', 'sql', 'any'], ARRAY['sqlalchemy', 'django', 'sequelize', 'typeorm'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 14. Synchronous I/O in Async Handlers
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'sync_in_async', NULL, NULL, 'high',
    'Synchronous I/O in Async Request Handlers',
    'Calling blocking I/O functions (file reads, synchronous HTTP requests, time.sleep) inside async handlers blocks the event loop, preventing all other requests from being processed. A single slow call blocks the entire server.',
    'Developers mix sync and async code, using familiar sync libraries (requests, open()) inside async def handlers.',
    E'# BAD (FastAPI)\n@app.get("/report")\nasync def get_report():\n    data = requests.get("https://api.example.com/data")  # Blocks event loop!\n    content = open("large_file.csv").read()  # Blocks event loop!\n    time.sleep(5)  # Blocks everything for 5 seconds',
    E'# GOOD (FastAPI)\nimport httpx\nimport aiofiles\n\n@app.get("/report")\nasync def get_report():\n    async with httpx.AsyncClient() as client:\n        data = await client.get("https://api.example.com/data")\n    async with aiofiles.open("large_file.csv") as f:\n        content = await f.read()\n    await asyncio.sleep(5)  # Non-blocking',
    'Grep for requests.get, open(), time.sleep inside async def functions. Look for sync library imports in async modules.',
    'Use async libraries (httpx, aiofiles, asyncio.sleep) in async handlers. Run sync code in executor: await asyncio.to_thread(blocking_fn).',
    ARRAY['python', 'javascript', 'node'], ARRAY['fastapi', 'express', 'aiohttp'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 15. Loading Full Dataset into Memory
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'full_dataset_in_memory', NULL, NULL, 'high',
    'Loading Full Dataset into Memory for Processing',
    'Reading an entire file or query result into memory before processing causes OOM errors on large datasets. Memory usage spikes to the full dataset size plus processing overhead.',
    'Developers use .read(), .fetchall(), or list comprehensions that materialize the entire dataset.',
    E'# BAD\nwith open("10gb_file.csv") as f:\n    data = f.readlines()  # 10GB in memory\n    for line in data:\n        process(line)\n\n# Also BAD\nrows = cursor.fetchall()  # Millions of rows in memory\nfor row in rows:\n    transform(row)',
    E'# GOOD (streaming)\nwith open("10gb_file.csv") as f:\n    for line in f:  # Streams line by line\n        process(line)\n\n# GOOD (server-side cursor)\ncursor = conn.cursor("streaming_cursor")\ncursor.execute("SELECT * FROM huge_table")\nwhile batch := cursor.fetchmany(1000):\n    for row in batch:\n        transform(row)',
    'Look for .readlines(), .read(), .fetchall() on potentially large data sources. Check memory profiling for spikes.',
    'Use streaming/iterators for files. Use server-side cursors with fetchmany() for DB queries. Process in chunks.',
    ARRAY['python', 'javascript', 'node', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 16. No Database Connection Pooling
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'no_connection_pooling', NULL, NULL, 'medium',
    'Creating New Database Connections Per Request',
    'Opening a new database connection for each request adds 20-100ms of latency per query and can exhaust database connection limits under load. Connection creation is expensive: TCP handshake + TLS + authentication.',
    'Developers create connections inline without realizing connection establishment cost. Default examples often show single-connection patterns.',
    E'# BAD\n@app.get("/users/{id}")\nasync def get_user(id: str):\n    conn = psycopg2.connect(DATABASE_URL)  # New connection every request!\n    cursor = conn.cursor()\n    cursor.execute("SELECT * FROM users WHERE id = %s", (id,))\n    result = cursor.fetchone()\n    conn.close()\n    return result',
    E'# GOOD\nfrom psycopg2.pool import ThreadedConnectionPool\npool = ThreadedConnectionPool(minconn=5, maxconn=20, dsn=DATABASE_URL)\n\n@app.get("/users/{id}")\nasync def get_user(id: str):\n    conn = pool.getconn()\n    try:\n        cursor = conn.cursor()\n        cursor.execute("SELECT * FROM users WHERE id = %s", (id,))\n        return cursor.fetchone()\n    finally:\n        pool.putconn(conn)',
    'Look for connection creation (psycopg2.connect, mysql.connector.connect, new Client()) inside request handlers instead of at module level.',
    'Use connection pooling (pgBouncer, pool objects). Create pool at startup. Configure pool size based on expected concurrency.',
    ARRAY['python', 'javascript', 'node', 'postgresql'], ARRAY['psycopg2', 'pg', 'sqlalchemy'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 17. Uncompressed API Responses
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'uncompressed_responses', NULL, NULL, 'medium',
    'Uncompressed API Responses for Large Payloads',
    'Serving large JSON/text responses without gzip/brotli compression wastes bandwidth and increases latency. A 1MB JSON response compresses to ~100KB — a 10x reduction. Critical for mobile clients and metered connections.',
    'Compression middleware is not enabled by default in many frameworks and developers forget to add it.',
    E'// BAD (Express)\nconst app = express();\n// No compression middleware\napp.get("/api/data", (req, res) => {\n    res.json(largeDataset);  // 2MB uncompressed\n});\n\n# BAD (FastAPI)\napp = FastAPI()  # No GZip middleware',
    E'// GOOD (Express)\nimport compression from "compression";\nconst app = express();\napp.use(compression());  // Compresses all responses > 1KB\n\n# GOOD (FastAPI)\nfrom fastapi.middleware.gzip import GZipMiddleware\napp = FastAPI()\napp.add_middleware(GZipMiddleware, minimum_size=1000)',
    'Check middleware stack for compression. Test with curl -H "Accept-Encoding: gzip" and check Content-Encoding header.',
    'Add compression middleware to all API servers. Set minimum_size to avoid compressing tiny responses. Use CDN for static assets.',
    ARRAY['javascript', 'python', 'node'], ARRAY['express', 'fastapi', 'flask', 'django'], ARRAY['web'],
    'curated_seed', 0.90
);

-- 18. Duplicate Queries Without Caching
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'performance_issue', 'duplicate_queries_no_cache', NULL, NULL, 'medium',
    'Duplicate Expensive Queries Without Caching',
    'Executing the same expensive database query or API call multiple times within a request or across rapid requests wastes resources. Without caching, identical computations are repeated needlessly.',
    'Different parts of the codebase independently query the same data. No caching layer exists between the application and data source.',
    E'# BAD — same query executed 3 times in one request\ndef get_dashboard(user_id):\n    user = db.query("SELECT * FROM users WHERE id = %s", (user_id,))\n    settings = get_user_settings(user_id)  # Queries user again internally\n    permissions = check_permissions(user_id)  # Queries user again!',
    E'# GOOD — query once, pass the result\ndef get_dashboard(user_id):\n    user = db.query("SELECT * FROM users WHERE id = %s", (user_id,))\n    settings = get_user_settings(user)  # Accepts user object\n    permissions = check_permissions(user)  # Accepts user object\n\n# GOOD — add caching for cross-request dedup\nfrom functools import lru_cache\n\n@lru_cache(maxsize=1000)\ndef get_config(key: str) -> str:\n    return db.query("SELECT value FROM config WHERE key = %s", (key,)).fetchone()',
    'Enable SQL query logging and look for duplicate queries. Count queries per request. Profile with tools like django-debug-toolbar.',
    'Pass fetched objects between functions. Use request-scoped caching. Add TTL caches (Redis, lru_cache) for frequently accessed data.',
    ARRAY['python', 'javascript', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- ===================== ARCHITECTURE (7) =====================

-- 19. God Module
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'god_module', NULL, NULL, 'medium',
    'God Module with Too Many Responsibilities',
    'A single module that handles authentication, database queries, business logic, email sending, and error handling becomes impossible to test, maintain, or reason about. Changes in one area break unrelated features.',
    'Incremental feature additions to the most convenient file. No upfront separation of concerns. "It''s faster to add it here."',
    E'# BAD — utils.py that does everything\ndef authenticate(token): ...\ndef send_email(to, subject, body): ...\ndef calculate_billing(patient_id): ...\ndef format_fhir_resource(data): ...\ndef validate_insurance(policy_id): ...\ndef generate_pdf_report(data): ...\ndef connect_to_database(): ...\n# 2000+ lines, 40+ functions',
    E'# GOOD — separated by domain\n# auth/service.py\ndef authenticate(token): ...\n\n# billing/calculator.py\ndef calculate_billing(patient_id): ...\n\n# notifications/email.py\ndef send_email(to, subject, body): ...\n\n# fhir/formatter.py\ndef format_fhir_resource(data): ...',
    'Check file line counts (>500 lines is a smell). Count imports — god modules import everything. Look for files named utils.py or helpers.js.',
    'Follow single responsibility principle. Split by domain/feature. Each module should have one reason to change.',
    ARRAY['python', 'javascript', 'typescript', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 20. Circular Imports
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'circular_imports', NULL, NULL, 'medium',
    'Circular Import Dependencies Between Modules',
    'Module A imports module B which imports module A. This causes ImportError, partially initialized modules, or subtle runtime bugs where attributes are None when accessed.',
    'Bidirectional dependencies emerge when modules are tightly coupled. Type hints referencing other modules often trigger this.',
    E'# BAD\n# models.py\nfrom services import calculate_total\nclass Order:\n    def get_total(self):\n        return calculate_total(self)\n\n# services.py\nfrom models import Order  # Circular!\ndef calculate_total(order: Order):\n    return sum(item.price for item in order.items)',
    E'# GOOD — break the cycle with dependency inversion\n# models.py\nclass Order:\n    def get_total(self, calculator):\n        return calculator(self)\n\n# services.py\nfrom models import Order\ndef calculate_total(order: Order):\n    return sum(item.price for item in order.items)\n\n# Or use TYPE_CHECKING for type hints only\nfrom __future__ import annotations\nfrom typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from models import Order',
    'Check for ImportError at startup. Use tools like pydeps or madge to visualize import graphs.',
    'Use dependency inversion. Pass dependencies as parameters. Use TYPE_CHECKING for type-only imports. Create interface/protocol modules.',
    ARRAY['python', 'javascript', 'typescript'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 21. Business Logic in Route Handlers
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'logic_in_handlers', NULL, NULL, 'medium',
    'Business Logic Embedded in Route Handlers',
    'Putting validation, computation, database queries, and business rules directly in route handlers makes the logic untestable without HTTP and creates duplication when the same logic is needed in CLI tools, background jobs, or other endpoints.',
    'Route handlers are the natural starting point for implementing features. Extracting to services feels like premature abstraction.',
    E'# BAD — everything in the handler\n@app.post("/api/billing")\nasync def create_bill(request: Request):\n    data = await request.json()\n    if data["amount"] < 0:\n        raise HTTPException(400, "Invalid amount")\n    tax = data["amount"] * 0.08\n    total = data["amount"] + tax\n    db.execute("INSERT INTO bills ...", (data["patient_id"], total))\n    send_email(data["patient_email"], f"Bill: ${total}")\n    return {"total": total}',
    E'# GOOD — thin handler, logic in service\n@app.post("/api/billing")\nasync def create_bill(bill_input: BillCreate):\n    result = await billing_service.create_bill(bill_input)\n    return result\n\n# billing/service.py\nclass BillingService:\n    async def create_bill(self, input: BillCreate) -> BillResult:\n        validated = self.validate(input)\n        total = self.calculate_total(validated)\n        record = await self.repo.save(validated, total)\n        await self.notifier.send_bill(record)\n        return BillResult(total=total, id=record.id)',
    'Check handler functions for >20 lines, direct DB calls, or business calculations. Route files should be thin.',
    'Use service layer pattern. Handlers handle HTTP; services handle logic. Makes logic testable and reusable.',
    ARRAY['python', 'javascript', 'typescript', 'node'], ARRAY['fastapi', 'express', 'flask', 'django'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 22. Bare Except / Pokemon Exception Handling
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'bare_except', NULL, NULL, 'high',
    'Bare Except Catching All Exceptions Silently',
    'Using bare except: or catch(e) {} without re-raising or logging swallows errors silently. Bugs become invisible — the code appears to work but produces wrong results. KeyboardInterrupt and SystemExit are also caught.',
    'Developers add broad exception handling to "prevent crashes" without considering that hiding errors is worse than crashing.',
    E'# BAD (Python)\ntry:\n    process_payment(order)\nexcept:\n    pass  # Swallows ALL errors including SystemExit\n\n# BAD (Python)\ntry:\n    result = api_call()\nexcept Exception:\n    result = None  # Silently returns None on ANY error\n\n// BAD (JavaScript)\ntry { await processPayment(order); } catch(e) { /* ignore */ }',
    E'# GOOD (Python)\ntry:\n    process_payment(order)\nexcept PaymentDeclinedError as e:\n    logger.warning(f"Payment declined: {e}")\n    return PaymentResult(status="declined", reason=str(e))\nexcept PaymentGatewayError as e:\n    logger.error(f"Gateway error: {e}")\n    raise  # Re-raise for retry handler\n\n// GOOD (JavaScript)\ntry {\n    await processPayment(order);\n} catch(e) {\n    if (e instanceof PaymentDeclinedError) {\n        return { status: "declined" };\n    }\n    throw e;  // Re-raise unknown errors\n}',
    'Grep for "except:" (bare), "except Exception", "catch(e) {}" with empty or pass body.',
    'Catch specific exceptions. Always log or re-raise. Never use bare except. Use except Exception only with logging.',
    ARRAY['python', 'javascript', 'typescript', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 23. Tight Coupling to External API
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'tight_coupling_external_api', NULL, NULL, 'medium',
    'Tight Coupling to External API Without Abstraction',
    'Calling external APIs directly throughout the codebase means every API change requires modifying multiple files. Testing requires mocking HTTP calls everywhere. Switching providers requires a full rewrite.',
    'Developers call APIs directly where needed. "We''ll only ever use this one provider." Provider lock-in happens gradually.',
    E'# BAD — Stripe calls scattered across codebase\n# billing/handler.py\nimport stripe\nresult = stripe.Charge.create(amount=1000, currency="usd", source=token)\n\n# refunds/handler.py\nimport stripe\nrefund = stripe.Refund.create(charge=charge_id)\n\n# reports/handler.py\nimport stripe\ncharges = stripe.Charge.list(limit=100)',
    E'# GOOD — abstraction layer\n# payments/interface.py\nclass PaymentProvider(Protocol):\n    def charge(self, amount: int, currency: str, token: str) -> ChargeResult: ...\n    def refund(self, charge_id: str) -> RefundResult: ...\n\n# payments/stripe_provider.py\nclass StripeProvider(PaymentProvider):\n    def charge(self, amount, currency, token):\n        return stripe.Charge.create(amount=amount, currency=currency, source=token)\n\n# Easy to swap: payments/braintree_provider.py\nclass BraintreeProvider(PaymentProvider): ...',
    'Count import statements for external SDK across files. If >3 files import the same SDK, it needs an abstraction.',
    'Create wrapper/adapter classes for external APIs. Program to interfaces. Centralize API configuration.',
    ARRAY['python', 'javascript', 'typescript', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 24. Missing Retry Logic for External Calls
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'missing_retry_logic', NULL, NULL, 'medium',
    'Missing Retry Logic for External Service Calls',
    'External APIs, databases, and services have transient failures (network blips, rate limits, temporary overload). Without retry logic with backoff, these transient errors become permanent failures.',
    'Developers assume external calls will succeed or add simple try/catch that gives up after one failure.',
    E'# BAD — single attempt, fails on transient errors\ndef send_notification(user_id, message):\n    response = requests.post(NOTIFICATION_API, json={"user": user_id, "msg": message})\n    response.raise_for_status()  # Fails on 503, even if next attempt would succeed',
    E'# GOOD — retry with exponential backoff\nfrom tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type\n\n@retry(\n    stop=stop_after_attempt(3),\n    wait=wait_exponential(multiplier=1, min=2, max=10),\n    retry=retry_if_exception_type(requests.exceptions.RequestException)\n)\ndef send_notification(user_id, message):\n    response = requests.post(NOTIFICATION_API, json={"user": user_id, "msg": message})\n    response.raise_for_status()\n\n# Or manual implementation\nasync def with_retry(fn, max_attempts=3, base_delay=1):\n    for attempt in range(max_attempts):\n        try:\n            return await fn()\n        except TransientError:\n            if attempt == max_attempts - 1: raise\n            await asyncio.sleep(base_delay * (2 ** attempt))',
    'Look for bare HTTP calls (requests.post, fetch, axios) without retry wrappers. Check for error handling that gives up after one try.',
    'Use retry libraries (tenacity, retry). Implement exponential backoff. Add circuit breakers for persistent failures.',
    ARRAY['python', 'javascript', 'node', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 25. Mutable Default Arguments
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'architecture_smell', 'mutable_default_args', NULL, NULL, 'medium',
    'Mutable Default Arguments in Python Functions',
    'Using mutable objects (lists, dicts) as default parameter values causes them to be shared across all function calls. Modifications persist between calls, leading to subtle and hard-to-debug data corruption.',
    'Python evaluates default arguments once at function definition time, not at each call. This is a common Python gotcha.',
    E'# BAD\ndef add_item(item, items=[]):\n    items.append(item)\n    return items\n\nprint(add_item("a"))  # ["a"]\nprint(add_item("b"))  # ["a", "b"]  — Unexpected!\n\n# BAD\ndef create_config(overrides={}):\n    config = {"debug": False}\n    config.update(overrides)\n    return config',
    E'# GOOD\ndef add_item(item, items=None):\n    if items is None:\n        items = []\n    items.append(item)\n    return items\n\nprint(add_item("a"))  # ["a"]\nprint(add_item("b"))  # ["b"]  — Correct!\n\n# GOOD\ndef create_config(overrides=None):\n    config = {"debug": False}\n    if overrides:\n        config.update(overrides)\n    return config',
    'Grep for def.*=\\[\\] or def.*=\\{\\} in Python files. Pylint W0102 catches this.',
    'Use None as default and create mutable objects inside the function body. Enable pylint W0102.',
    ARRAY['python'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- ===================== DATABASE (6) =====================

-- 26. Timestamp Without Timezone
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'database_antipattern', 'timestamp_no_tz', NULL, NULL, 'medium',
    'Using TIMESTAMP WITHOUT TIME ZONE in PostgreSQL',
    'TIMESTAMP WITHOUT TIME ZONE stores a "wall clock time" with no timezone context. When servers are in different zones or DST changes occur, timestamps become ambiguous and comparisons produce wrong results.',
    'Developers use TIMESTAMP (which defaults to WITHOUT TIME ZONE in PostgreSQL) without understanding the difference.',
    E'-- BAD\nCREATE TABLE events (\n    id SERIAL PRIMARY KEY,\n    event_time TIMESTAMP NOT NULL DEFAULT NOW(),  -- No timezone!\n    description TEXT\n);\n-- What timezone is this? Server local? UTC? Nobody knows.',
    E'-- GOOD\nCREATE TABLE events (\n    id SERIAL PRIMARY KEY,\n    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- With timezone!\n    description TEXT\n);\n-- Always stores in UTC, converts to client timezone on retrieval.\n\n-- Also set session timezone\nSET timezone = ''UTC'';',
    'Grep for TIMESTAMP in CREATE TABLE without TZ or TIMESTAMPTZ. Check existing columns with: SELECT column_name, data_type FROM information_schema.columns.',
    'Always use TIMESTAMPTZ. Set server and session timezone to UTC. Store all times in UTC.',
    ARRAY['postgresql', 'sql'], ARRAY['sqlalchemy', 'django', 'typeorm'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 27. Using CHAR(n) Instead of VARCHAR or TEXT
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'database_antipattern', 'char_misuse', NULL, NULL, 'low',
    'Using CHAR(n) Instead of VARCHAR or TEXT in PostgreSQL',
    'CHAR(n) pads strings with spaces to the fixed length, wasting storage and causing comparison bugs. In PostgreSQL, there is no performance benefit to CHAR(n) over VARCHAR or TEXT.',
    'Habit from other databases (Oracle, MySQL) where CHAR has performance benefits. Fixed-length assumption for fields like country codes.',
    E'-- BAD\nCREATE TABLE patients (\n    id SERIAL PRIMARY KEY,\n    name CHAR(100),           -- Padded with 80+ spaces for short names\n    country_code CHAR(2),     -- Comparison: ''US'' != ''US '' \n    phone CHAR(20)            -- Wastes space for shorter numbers\n);',
    E'-- GOOD\nCREATE TABLE patients (\n    id SERIAL PRIMARY KEY,\n    name TEXT NOT NULL,                    -- No arbitrary limit\n    country_code VARCHAR(2) NOT NULL,      -- Enforced max without padding\n    phone VARCHAR(20)                      -- Or TEXT with CHECK constraint\n);\n-- For strict length validation:\n-- country_code TEXT NOT NULL CHECK (length(country_code) = 2)',
    'Grep for CHAR( in CREATE TABLE and ALTER TABLE statements. Check schema for CHAR columns.',
    'Use TEXT or VARCHAR in PostgreSQL. Use CHECK constraints for length validation. Never use CHAR(n).',
    ARRAY['postgresql', 'sql'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 28. Missing Foreign Key Constraints
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'database_antipattern', 'missing_foreign_keys', NULL, NULL, 'high',
    'Missing Foreign Key Constraints Between Related Tables',
    'Without foreign key constraints, the database cannot enforce referential integrity. Orphaned records accumulate, JOINs return unexpected NULLs, and data corruption goes undetected until it causes application errors.',
    'Developers skip FKs for "performance" (negligible impact) or because the ORM handles relationships. But ORMs don''t prevent direct SQL or migration errors.',
    E'-- BAD\nCREATE TABLE orders (\n    id SERIAL PRIMARY KEY,\n    customer_id INTEGER,  -- No FK! Can reference nonexistent customer\n    product_id INTEGER,   -- No FK! Product could be deleted\n    amount DECIMAL\n);',
    E'-- GOOD\nCREATE TABLE orders (\n    id SERIAL PRIMARY KEY,\n    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,\n    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,\n    amount DECIMAL NOT NULL CHECK (amount > 0)\n);\n-- ON DELETE RESTRICT prevents deleting customers/products with orders\n-- ON DELETE CASCADE for child records that should be cleaned up',
    'Query information_schema for tables with _id columns that lack foreign key constraints. Review CREATE TABLE for missing REFERENCES.',
    'Always define FK constraints. Choose appropriate ON DELETE policy (RESTRICT, CASCADE, SET NULL). Test cascading deletes.',
    ARRAY['postgresql', 'mysql', 'sql'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 29. Using FLOAT for Money
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'database_antipattern', 'float_for_money', NULL, NULL, 'high',
    'Using FLOAT or DOUBLE for Monetary Values',
    'Floating-point arithmetic has rounding errors that accumulate in financial calculations. 0.1 + 0.2 != 0.3 in IEEE 754. Over thousands of transactions, these errors can cause significant discrepancies in financial reports.',
    'FLOAT is the "obvious" numeric type. Developers don''t know about DECIMAL/NUMERIC or integer-cents representation.',
    E'-- BAD\nCREATE TABLE invoices (\n    id SERIAL PRIMARY KEY,\n    amount FLOAT,        -- 0.1 + 0.2 = 0.30000000000000004\n    tax FLOAT,\n    total FLOAT\n);\n\n# BAD (Python)\nprice = 19.99  # float\ntax = price * 0.08  # Rounding errors accumulate',
    E'-- GOOD\nCREATE TABLE invoices (\n    id SERIAL PRIMARY KEY,\n    amount_cents INTEGER NOT NULL,  -- Store as cents: $19.99 = 1999\n    tax_cents INTEGER NOT NULL,\n    total_cents INTEGER NOT NULL\n);\n\n-- Or use NUMERIC\nCREATE TABLE invoices (\n    id SERIAL PRIMARY KEY,\n    amount NUMERIC(12,2) NOT NULL,  -- Exact decimal arithmetic\n    tax NUMERIC(12,2) NOT NULL,\n    total NUMERIC(12,2) NOT NULL\n);\n\n# GOOD (Python)\nfrom decimal import Decimal\nprice = Decimal("19.99")\ntax = price * Decimal("0.08")',
    'Grep for FLOAT, DOUBLE, REAL in table definitions involving money, price, amount, cost, balance columns.',
    'Use NUMERIC(precision,scale) or store as integer cents. Use Decimal type in application code. Never use float for money.',
    ARRAY['postgresql', 'mysql', 'python', 'javascript', 'sql'], ARRAY['any'], ARRAY['fintech', 'healthcare', 'any'],
    'curated_seed', 0.90
);

-- 30. Missing ON DELETE Policy
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'database_antipattern', 'missing_on_delete', NULL, NULL, 'medium',
    'Missing ON DELETE Policy on Foreign Keys',
    'Foreign keys without explicit ON DELETE behavior default to NO ACTION (or RESTRICT), which can cause unexpected constraint violations when deleting parent records. Worse, using CASCADE carelessly can delete data you want to keep.',
    'Developers add REFERENCES but don''t think about what happens when the referenced row is deleted.',
    E'-- BAD — no ON DELETE, deletions fail unexpectedly\nCREATE TABLE appointments (\n    id SERIAL PRIMARY KEY,\n    patient_id INTEGER REFERENCES patients(id),  -- Default NO ACTION\n    doctor_id INTEGER REFERENCES doctors(id)     -- Default NO ACTION\n);\n-- DELETE FROM patients WHERE id = 1;  → ERROR: violates FK',
    E'-- GOOD — explicit policy for each relationship\nCREATE TABLE appointments (\n    id SERIAL PRIMARY KEY,\n    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,\n        -- Deleting patient deletes their appointments\n    doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT\n        -- Cannot delete doctor who has appointments\n);\n\n-- For audit trails:\n-- user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
    'Review FK definitions for missing ON DELETE clauses. Query pg_constraint for FK constraints without explicit actions.',
    'Explicitly define ON DELETE for every FK. Use RESTRICT for important references, CASCADE for owned children, SET NULL for optional references.',
    ARRAY['postgresql', 'mysql', 'sql'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 31. SELECT * in Production Queries
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'database_antipattern', 'select_star', NULL, NULL, 'medium',
    'Using SELECT * in Production Application Queries',
    'SELECT * fetches all columns including large text/blob fields you don''t need, wastes bandwidth, breaks when columns are added/renamed, and prevents covering index optimizations. Fine for debugging, harmful in production.',
    'SELECT * is the fastest to type during development. Column lists feel tedious. "We might need those columns later."',
    E'-- BAD\nSELECT * FROM patients;  -- Includes medical_history BLOB, 50+ columns\n\n# BAD (ORM)\npatients = Patient.objects.all()  # Loads all fields\nfor p in patients:\n    print(p.name)  # Only needed name, loaded everything',
    E'-- GOOD\nSELECT id, name, date_of_birth, insurance_id FROM patients;\n\n# GOOD (Django)\npatients = Patient.objects.only("id", "name", "date_of_birth")\n# Or\npatients = Patient.objects.values("id", "name", "date_of_birth")\n\n# GOOD (SQLAlchemy)\nresults = session.query(Patient.id, Patient.name, Patient.dob).all()',
    'Grep for SELECT * in .sql files and query strings. Check ORM queries for missing .only() or .values().',
    'Always specify column lists. Use ORM .only()/.defer() to exclude heavy columns. Review query patterns in code review.',
    ARRAY['postgresql', 'mysql', 'sql', 'python', 'javascript'], ARRAY['sqlalchemy', 'django', 'sequelize'], ARRAY['any'],
    'curated_seed', 0.90
);

-- ===================== DEVOPS (4) =====================

-- 32. No Health Check Endpoint
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'devops_misconfiguration', 'no_health_check', NULL, NULL, 'medium',
    'No Health Check Endpoint for Container/Service',
    'Without a health check endpoint, orchestrators (Kubernetes, ECS, Docker) cannot detect when your service is unhealthy. Failed instances continue receiving traffic, causing cascading failures. Rolling deployments cannot verify new versions work.',
    'Health checks are "infrastructure concerns" that developers defer. The app starts and serves requests, so it must be healthy, right?',
    E'# BAD — no health check, orchestrator can''t verify health\napp = FastAPI()\n\n@app.post("/api/process")\nasync def process():\n    ...  # If DB connection dies, this still "runs" but all requests fail',
    E'# GOOD — health check with dependency verification\n@app.get("/health")\nasync def health_check():\n    checks = {}\n    try:\n        await db.execute("SELECT 1")\n        checks["database"] = "ok"\n    except Exception as e:\n        checks["database"] = f"error: {str(e)}"\n    try:\n        await redis.ping()\n        checks["cache"] = "ok"\n    except Exception as e:\n        checks["cache"] = f"error: {str(e)}"\n    \n    all_ok = all(v == "ok" for v in checks.values())\n    return JSONResponse(\n        status_code=200 if all_ok else 503,\n        content={"status": "healthy" if all_ok else "degraded", "checks": checks}\n    )',
    'Check for /health or /healthz endpoint in route definitions. Review Dockerfile for HEALTHCHECK instruction.',
    'Add /health endpoint that checks all dependencies (DB, cache, queues). Include HEALTHCHECK in Dockerfile. Configure liveness/readiness probes.',
    ARRAY['python', 'javascript', 'node', 'any'], ARRAY['fastapi', 'express', 'flask', 'django'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 33. Secrets in Dockerfile
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'devops_misconfiguration', 'secrets_in_dockerfile', 798, 'A05:2021-Security Misconfiguration', 'critical',
    'Secrets Hardcoded or Copied into Docker Images',
    'Secrets in Dockerfiles or copied .env files persist in image layers. Anyone with access to the image (registry, cache, CI logs) can extract them. Docker layer history is immutable — even if deleted in a later layer, secrets remain.',
    'Developers copy .env or set ENV with real secrets to make the build work. "I''ll fix it later."',
    E'# BAD — secrets visible in docker history\nFROM python:3.11\nENV DATABASE_URL=postgresql://admin:realpassword@prod-db:5432/app\nENV API_KEY=sk-ant-real-key-here\nCOPY .env /app/.env\nCOPY . /app',
    E'# GOOD — secrets injected at runtime\nFROM python:3.11\nCOPY requirements.txt /app/\nRUN pip install -r /app/requirements.txt\nCOPY . /app\n# No ENV with secrets, no .env copied\n\n# Run with secrets:\n# docker run --env-file .env myapp\n# Or with secrets manager:\n# docker run -e DATABASE_URL=$(vault kv get -field=url secret/db) myapp\n\n# Add .dockerignore\n# .env\n# .env.local\n# *.pem\n# *.key',
    'Check Dockerfiles for ENV with passwords/keys. Look for COPY .env. Run: docker history --no-trunc <image>.',
    'Never put secrets in Dockerfiles. Use .dockerignore for .env files. Inject secrets at runtime via environment variables or secrets managers.',
    ARRAY['docker', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 34. Running Container as Root
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'devops_misconfiguration', 'running_as_root', 250, 'A05:2021-Security Misconfiguration', 'high',
    'Running Container Process as Root User',
    'Containers running as root give an attacker who achieves code execution full control over the container filesystem and potentially the host. Container escape vulnerabilities are far more dangerous when the process is root.',
    'Docker defaults to root. Many base images require root for package installation. Developers don''t add USER directive after setup.',
    E'# BAD — runs as root\nFROM python:3.11\nCOPY . /app\nWORKDIR /app\nRUN pip install -r requirements.txt\nCMD ["python", "app.py"]\n# Process runs as root inside container',
    E'# GOOD — non-root user\nFROM python:3.11\nRUN groupadd -r appuser && useradd -r -g appuser -d /app appuser\nCOPY --chown=appuser:appuser . /app\nWORKDIR /app\nRUN pip install -r requirements.txt\nUSER appuser\nCMD ["python", "app.py"]\n# Process runs as appuser, minimal privileges',
    'Check Dockerfiles for missing USER directive. Run: docker inspect --format="{{.Config.User}}" <image>.',
    'Always add USER directive after RUN commands. Use non-root base images when available. Set filesystem permissions explicitly.',
    ARRAY['docker', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);

-- 35. Missing Resource Limits on Containers
INSERT INTO anti_patterns (
    category, subcategory, cwe_id, owasp_category, severity,
    title, description, root_cause, bad_code, good_code,
    detection_hint, prevention_strategy,
    tech_stack, frameworks, domains, source, confidence_score
) VALUES (
    'devops_misconfiguration', 'missing_resource_limits', NULL, NULL, 'medium',
    'Missing CPU and Memory Resource Limits on Containers',
    'Containers without resource limits can consume all available host resources during traffic spikes or memory leaks, starving other containers and causing cascading failures across the entire host.',
    'Resource limits require benchmarking to set correctly. Developers skip them because the defaults "work fine" in development.',
    E'# BAD — no limits, can consume entire host\nservices:\n  api:\n    image: myapp:latest\n    # No resource limits defined\n\n# BAD (Kubernetes)\napiVersion: apps/v1\nkind: Deployment\nspec:\n  containers:\n  - name: api\n    image: myapp:latest\n    # No resources block',
    E'# GOOD (docker-compose)\nservices:\n  api:\n    image: myapp:latest\n    deploy:\n      resources:\n        limits:\n          cpus: "1.0"\n          memory: 512M\n        reservations:\n          cpus: "0.25"\n          memory: 128M\n\n# GOOD (Kubernetes)\ncontainers:\n- name: api\n  image: myapp:latest\n  resources:\n    limits:\n      cpu: "1000m"\n      memory: "512Mi"\n    requests:\n      cpu: "250m"\n      memory: "128Mi"',
    'Check docker-compose.yml for missing deploy.resources. Check Kubernetes manifests for missing resources.limits.',
    'Set CPU and memory limits on all containers. Monitor actual usage and adjust. Use requests for scheduling, limits for hard caps.',
    ARRAY['docker', 'kubernetes', 'any'], ARRAY['any'], ARRAY['any'],
    'curated_seed', 0.90
);
