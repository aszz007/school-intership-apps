"""Local, same-origin practice API. All learning data is persisted in SQLite."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Request, Response, Path as APIPath
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

ROOT = Path(__file__).resolve().parent.parent
COOKIE = 'zhilian_session'
CST = timezone(timedelta(hours=8))
QuestionID = Annotated[int, APIPath(ge=1, le=9223372036854775807)]


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def pack(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()


@contextmanager
def connection(path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connection(path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        version = db.execute('PRAGMA user_version').fetchone()[0]
        if version > 1:
            raise RuntimeError('数据库版本较新，请使用对应版本程序；未修改数据库。')
        if version == 0:
            schema = (ROOT / 'server/schema.sql').read_text(encoding='utf8')
            db.executescript('BEGIN IMMEDIATE;\n' + schema)
            db.execute('INSERT INTO schema_migrations VALUES(1,?)', (stamp(),))
            db.execute('PRAGMA user_version=1')
            for q in json.loads((ROOT / 'server/seed.json').read_text(encoding='utf8')):
                db.execute('INSERT INTO questions(topic,difficulty,kind,prompt,options_json,correct_json,explanation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                           (q['topic'], q['difficulty'], q['kind'], q['prompt'], pack(q['options']), pack(q['correct']), q['explanation'], stamp(), stamp()))


class StrictBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)


class Credentials(StrictBody):
    username: str = Field(min_length=3, max_length=24, pattern=r'^[A-Za-z0-9_]+$')
    password: str = Field(min_length=10, max_length=128)


class Registration(Credentials):
    display_name: str = Field(default='', max_length=30)


class QuestionBody(StrictBody):
    topic: str = Field(min_length=1, max_length=24)
    difficulty: str = Field(pattern=r'^(基础|进阶)$')
    kind: str = Field(pattern=r'^(single|multiple)$')
    prompt: str = Field(min_length=5, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=6)
    correct: list[StrictInt] = Field(min_length=1, max_length=6)
    explanation: str = Field(min_length=5, max_length=4000)
    version: StrictInt = Field(default=1, ge=1, le=9223372036854775806)
    archived: bool = False

    @model_validator(mode='after')
    def validate_question(self):
        self.topic, self.prompt, self.explanation = self.topic.strip(), self.prompt.strip(), self.explanation.strip()
        self.options = [x.strip() for x in self.options]
        if not self.topic.strip() or not self.prompt.strip():
            raise ValueError('主题和题目不能为空')
        if len(self.prompt) < 5 or len(self.explanation) < 5:
            raise ValueError('题干与解析至少需要5个有效字符')
        if any(not x.strip() or len(x) > 800 for x in self.options):
            raise ValueError('选项不能为空且不得超过800字')
        if len(set(self.options)) != len(self.options):
            raise ValueError('选项不能重复')
        if len(set(self.correct)) != len(self.correct) or any(x < 0 or x >= len(self.options) for x in self.correct):
            raise ValueError('正确答案需要对应有效选项，且不能重复')
        if (self.kind == 'single' and len(self.correct) != 1) or (self.kind == 'multiple' and len(self.correct) < 2):
            raise ValueError('单选需要一个答案，多选至少两个答案')
        return self


class AttemptBody(StrictBody):
    question_id: StrictInt = Field(ge=1, le=9223372036854775807)
    answers: list[StrictInt] = Field(min_length=1, max_length=6)
    request_id: str = Field(min_length=8, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')


class ReviewBody(StrictBody):
    note: str = Field(max_length=2000)
    mastered: bool


def question(row, with_answer=False):
    q = {k: row[k] for k in ('id', 'topic', 'difficulty', 'kind', 'prompt', 'version', 'archived')}
    q['options'] = json.loads(row['options_json'])
    q['own'] = row['owner_id'] is not None
    if with_answer:
        q.update(correct=json.loads(row['correct_json']), explanation=row['explanation'])
    return q


def attempt_result(row):
    snap = json.loads(row['snapshot_json'])
    return {'id': row['id'], 'question_id': row['question_id'], 'answers': json.loads(row['answers_json']),
            'correct': bool(row['correct']), 'correct_answers': snap['correct'], 'explanation': snap['explanation'],
            'question_version': row['question_version'], 'created_at': row['created_at']}


def create_app(db_path=None):
    path = Path(db_path or os.environ.get('ZHILIAN_DB', ROOT / '.local/practice.sqlite3')).resolve()
    initialize(path)
    app = FastAPI(title='知练学习练习 API', version='0.1.1')
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])
    login_failures = {}

    @app.middleware('http')
    async def boundary(request, call_next):
        if request.url.path.startswith('/api/') and request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            origin = request.headers.get('origin')
            expected = f'{request.url.scheme}://{request.url.netloc}'
            if origin and origin != expected:
                return JSONResponse({'detail': '请从当前网站操作。'}, status_code=403)
            if request.headers.get('content-type', '').split(';')[0] != 'application/json':
                return JSONResponse({'detail': '请发送JSON内容。'}, status_code=415)
            if len(await request.body()) > 65536:
                return JSONResponse({'detail': '内容过长，请缩短后重试。'}, status_code=413)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'DENY'
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    def authenticated(request, db, write=False):
        token = request.cookies.get(COOKIE, '')
        row = db.execute('SELECT s.*,u.username,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?', (digest(token), stamp())).fetchone()
        if not row:
            raise HTTPException(401, '请先登录。')
        if write and not hmac.compare_digest(request.headers.get('x-csrf-token', ''), row['csrf']):
            raise HTTPException(403, '登录状态已更新，请刷新页面后再试。')
        return row

    def new_session(db, user, response, request):
        # Login and registration replace an existing session from this browser.
        db.execute('DELETE FROM sessions WHERE token_hash=? OR expires_at<=?', (digest(request.cookies.get(COOKIE, '')), stamp()))
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (digest(token), user['id'], csrf, (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(timespec='seconds')))
        response.set_cookie(COOKIE, token, max_age=86400, httponly=True, samesite='lax', secure=request.url.scheme == 'https')
        return {'user': {'username': user['username'], 'display_name': user['display_name']}, 'csrf': csrf}

    def accessible(db, qid, uid):
        q = db.execute('SELECT * FROM questions WHERE id=? AND archived=0 AND (owner_id IS NULL OR owner_id=?)', (qid, uid)).fetchone()
        if not q:
            raise HTTPException(404, '题目不存在或已归档。')
        return q

    @app.get('/api/health')
    def health():
        with connection(path) as db:
            return {'status': 'ok', 'product': 'zhilian', 'database': 'SQLite', 'schema_version': db.execute('PRAGMA user_version').fetchone()[0], 'version': '0.1.1'}

    @app.get('/api/session')
    def session(request: Request):
        with connection(path) as db:
            try:
                u = authenticated(request, db)
            except HTTPException:
                return {'user': None, 'csrf': None}
            return {'user': {'username': u['username'], 'display_name': u['display_name']}, 'csrf': u['csrf']}

    @app.post('/api/register', status_code=201)
    def register(body: Registration, request: Request, response: Response):
        with connection(path) as db:
            try:
                cursor = db.execute('INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)', (body.username, body.display_name.strip() or body.username, password_hash(body.password), stamp()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, '这个用户名已被使用，请换一个。') from None
            user = db.execute('SELECT * FROM users WHERE id=?', (cursor.lastrowid,)).fetchone()
            return new_session(db, user, response, request)

    @app.post('/api/login')
    def login(body: Credentials, request: Request, response: Response):
        key = (request.client.host if request.client else '', body.username.lower())
        failures = [t for t in login_failures.get(key, []) if t > time.monotonic() - 300]
        if len(failures) >= 8:
            raise HTTPException(429, '尝试次数较多，请五分钟后再试。')
        with connection(path) as db:
            u = db.execute('SELECT * FROM users WHERE username=?', (body.username,)).fetchone()
            encoded = u['password_hash'] if u else password_hash('unused-dummy-password', '0' * 32)
            valid = hmac.compare_digest(password_hash(body.password, encoded.split(':')[0]), encoded)
            if not u or not valid:
                login_failures[key] = failures + [time.monotonic()]
                raise HTTPException(401, '用户名或密码不正确。')
            login_failures.pop(key, None)
            return new_session(db, u, response, request)

    @app.post('/api/logout')
    def logout(request: Request, response: Response):
        with connection(path) as db:
            u = authenticated(request, db, True)
            db.execute('DELETE FROM sessions WHERE token_hash=?', (u['token_hash'],))
        response.delete_cookie(COOKIE)
        return {'ok': True}

    @app.get('/api/questions')
    def questions(request: Request, topic: str = '', difficulty: str = '', q: str = '', mode: str = 'all', mastery: str = 'pending', include_archived: bool = False):
        if mode not in ('all', 'wrong', 'own') or mastery not in ('pending', 'all', 'mastered') or len(q) > 100:
            raise HTTPException(422, '筛选条件不正确。')
        with connection(path) as db:
            u = authenticated(request, db)
            uid = u['user_id']
            rows = db.execute('SELECT q.* FROM questions q WHERE (q.archived=0 OR (? AND q.owner_id=?)) AND (q.owner_id IS NULL OR q.owner_id=?) ORDER BY q.id', (int(mode == 'own' and include_archived), uid, uid)).fetchall()
            topics = sorted({r['topic'] for r in rows})
            if mode == 'wrong':
                reviews = {r['question_id']: r for r in db.execute('SELECT * FROM reviews WHERE user_id=?', (uid,))}
                rows = [r for r in rows if r['id'] in reviews and (mastery == 'all' or bool(reviews[r['id']]['mastered']) == (mastery == 'mastered'))]
            if mode == 'own':
                rows = [r for r in rows if r['owner_id'] == uid]
            rows = [r for r in rows if (not topic or r['topic'] == topic) and (not difficulty or r['difficulty'] == difficulty) and (not q or q.casefold() in r['prompt'].casefold())]
            return {'items': [question(r, mode == 'own') for r in rows], 'topics': topics, 'total': len(rows), 'source': '公共题目为本项目自编示例，不是考试真题。'}

    @app.post('/api/questions', status_code=201)
    def add_question(body: QuestionBody, request: Request):
        with connection(path) as db:
            uid = authenticated(request, db, True)['user_id']
            if db.execute('SELECT COUNT(*) FROM questions WHERE owner_id=?', (uid,)).fetchone()[0] >= 200:
                raise HTTPException(409, '个人题目已达200条，请先整理现有题目。')
            cursor = db.execute('INSERT INTO questions(owner_id,topic,difficulty,kind,prompt,options_json,correct_json,explanation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', (uid, body.topic.strip(), body.difficulty, body.kind, body.prompt.strip(), pack(body.options), pack(sorted(body.correct)), body.explanation.strip(), stamp(), stamp()))
            return question(db.execute('SELECT * FROM questions WHERE id=?', (cursor.lastrowid,)).fetchone(), True)

    @app.put('/api/questions/{qid}')
    def edit_question(qid: QuestionID, body: QuestionBody, request: Request):
        with connection(path) as db:
            uid = authenticated(request, db, True)['user_id']
            row = db.execute('SELECT * FROM questions WHERE id=? AND owner_id=?', (qid, uid)).fetchone()
            if not row:
                raise HTTPException(404, '只能修改自己的题目。')
            cursor = db.execute('UPDATE questions SET topic=?,difficulty=?,kind=?,prompt=?,options_json=?,correct_json=?,explanation=?,archived=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=?', (body.topic.strip(), body.difficulty, body.kind, body.prompt.strip(), pack(body.options), pack(sorted(body.correct)), body.explanation.strip(), int(body.archived), stamp(), qid, uid, body.version))
            if cursor.rowcount != 1:
                raise HTTPException(409, '题目已在别处修改，请重新打开后编辑。')
            return question(db.execute('SELECT * FROM questions WHERE id=?', (qid,)).fetchone(), True)

    @app.post('/api/attempts')
    def attempt(body: AttemptBody, request: Request):
        answers = sorted(body.answers)
        with connection(path) as db:
            uid = authenticated(request, db, True)['user_id']
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT * FROM attempts WHERE user_id=? AND request_id=?', (uid, body.request_id)).fetchone()
            if previous:
                if previous['question_id'] != body.question_id or previous['answers_json'] != pack(answers):
                    raise HTTPException(409, '该提交编号已用于另一份答案。')
                return attempt_result(previous)
            row = accessible(db, body.question_id, uid)
            snap = question(row, True)
            if len(set(answers)) != len(answers) or any(a < 0 or a >= len(snap['options']) for a in answers) or (snap['kind'] == 'single' and len(answers) != 1):
                raise HTTPException(422, '请选择有效的答案。')
            correct = answers == sorted(snap['correct'])
            cursor = db.execute('INSERT INTO attempts(user_id,question_id,request_id,answers_json,correct,question_version,snapshot_json,created_at,study_day) VALUES(?,?,?,?,?,?,?,?,?)', (uid, row['id'], body.request_id, pack(answers), int(correct), row['version'], pack(snap), stamp(), datetime.now(CST).date().isoformat()))
            if not correct:
                db.execute('INSERT INTO reviews(user_id,question_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_id,question_id) DO UPDATE SET mastered=0,updated_at=excluded.updated_at', (uid, row['id'], stamp()))
            return attempt_result(db.execute('SELECT * FROM attempts WHERE id=?', (cursor.lastrowid,)).fetchone())

    @app.get('/api/reviews')
    def reviews(request: Request):
        with connection(path) as db:
            uid = authenticated(request, db)['user_id']
            rows = db.execute('SELECT r.*,q.prompt,q.topic,q.archived FROM reviews r JOIN questions q ON q.id=r.question_id WHERE r.user_id=? ORDER BY r.updated_at DESC', (uid,)).fetchall()
            return {'items': [dict(r) for r in rows]}

    @app.put('/api/reviews/{qid}')
    def update_review(qid: QuestionID, body: ReviewBody, request: Request):
        with connection(path) as db:
            uid = authenticated(request, db, True)['user_id']
            cursor = db.execute('UPDATE reviews SET note=?,mastered=?,updated_at=? WHERE user_id=? AND question_id=?', (body.note, int(body.mastered), stamp(), uid, qid))
            if cursor.rowcount != 1:
                raise HTTPException(404, '还没有这道题的复习记录。')
            return {'ok': True}

    @app.get('/api/stats')
    def stats(request: Request):
        with connection(path) as db:
            uid = authenticated(request, db)['user_id']
            totals = dict(db.execute('SELECT COUNT(*) AS attempts,COALESCE(SUM(correct),0) AS correct,COUNT(DISTINCT question_id) AS covered FROM attempts WHERE user_id=?', (uid,)).fetchone())
            totals['pending'] = db.execute('SELECT COUNT(*) FROM reviews r JOIN questions q ON q.id=r.question_id WHERE user_id=? AND mastered=0 AND archived=0', (uid,)).fetchone()[0]
            topics = [dict(r) for r in db.execute('SELECT topic,attempts,correct,covered FROM view_user_topic_stats WHERE user_id=? ORDER BY topic', (uid,))]
            days = {(datetime.now(CST).date() - timedelta(days=i)).isoformat(): {'attempts': 0, 'correct': 0} for i in range(6, -1, -1)}
            for r in db.execute('SELECT study_day,COUNT(*) AS attempts,SUM(correct) AS correct FROM attempts WHERE user_id=? AND study_day>=? GROUP BY study_day', (uid, min(days))):
                if r['study_day'] in days:
                    days[r['study_day']] = {'attempts': r['attempts'], 'correct': r['correct']}
            return {**totals, 'topics': topics, 'days': [{'day': d, **v} for d, v in days.items()]}

    @app.get('/api/export')
    def export(request: Request):
        with connection(path) as db:
            u = authenticated(request, db)
            uid = u['user_id']
            data = {'format': 'zhilian-learning-v1', 'exported_at': stamp(), 'username': u['username'],
                    'questions': [question(r, True) for r in db.execute('SELECT * FROM questions WHERE owner_id=?', (uid,))],
                    'attempts': [{**attempt_result(r), 'question': json.loads(r['snapshot_json'])} for r in db.execute('SELECT * FROM attempts WHERE user_id=? ORDER BY id', (uid,))],
                    'reviews': [dict(r) for r in db.execute('SELECT question_id,note,mastered,updated_at FROM reviews WHERE user_id=?', (uid,))]}
            return JSONResponse(data, headers={'Content-Disposition': 'attachment; filename="zhilian-learning.json"'})

    dist = ROOT / 'dist'
    if (dist / 'assets').exists():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

    @app.get('/')
    def home():
        if not (dist / 'index.html').exists():
            raise HTTPException(503, '请先运行 npm run build 构建前端。')
        return FileResponse(dist / 'index.html')

    return app
