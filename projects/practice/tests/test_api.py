import concurrent.futures
import json
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path

from fastapi.testclient import TestClient
from server.app import COOKIE, ROOT, create_app


class PracticeAPI(unittest.TestCase):
    def setUp(self):
        (ROOT / '.local/tests').mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / '.local/tests')
        self.path = Path(self.temp.name) / 'test.sqlite3'
        self.app = create_app(self.path)
        self.client = TestClient(self.app)
        data = self.client.post('/api/register', json={'username': 'learner_a', 'password': 'Test-only-Password-2026'}).json()
        self.client.headers['x-csrf-token'] = data['csrf']

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def second(self):
        client = TestClient(self.app)
        data = client.post('/api/register', json={'username': 'learner_b', 'password': 'Test-only-Password-2026'}).json()
        client.headers['x-csrf-token'] = data['csrf']
        self.addCleanup(client.close)
        return client

    def answer(self, qid=1, answers=None, key=None, client=None):
        return (client or self.client).post('/api/attempts', json={'question_id': qid, 'answers': [1] if answers is None else answers, 'request_id': key or str(uuid.uuid4())})

    def own(self):
        return {'topic': '自编测试', 'difficulty': '基础', 'kind': 'single', 'prompt': '这是一道持久化测试题目，正确选项是什么？', 'options': ['甲选项', '乙选项'], 'correct': [0], 'explanation': '本题是自编测试，正确选项为甲。', 'version': 1, 'archived': False}

    def test_01_session_boundary_and_no_early_answers(self):
        anon = TestClient(self.app)
        self.addCleanup(anon.close)
        self.assertIsNone(anon.get('/api/session').json()['user'])
        self.assertEqual(anon.get('/api/questions').status_code, 401)
        data = self.client.get('/api/questions').json()
        self.assertEqual(data['total'], 18)
        self.assertNotIn('correct', data['items'][0])
        self.assertNotIn('explanation', data['items'][0])
        self.assertEqual(self.client.post('/api/attempts', json={'question_id': 1, 'answers': [0], 'request_id': 'abcdefgh'}, headers={'x-csrf-token': ''}).status_code, 403)
        self.assertEqual(self.client.post('/api/logout', json={}, headers={'Origin': 'https://elsewhere.invalid'}).status_code, 403)
        self.assertEqual(self.client.get('/.local/practice.sqlite3').status_code, 404)
        self.assertEqual(self.client.get('/server/seed.json').status_code, 404)
        self.assertIn('HttpOnly', self.client.cookies.jar._cookies['testserver.local']['/'][COOKIE]._rest)

    def test_02_scoring_idempotence_and_isolation(self):
        key = str(uuid.uuid4())
        wrong = self.answer(key=key)
        self.assertEqual(wrong.status_code, 200)
        self.assertFalse(wrong.json()['correct'])
        self.assertEqual(wrong.json()['correct_answers'], [0])
        self.assertEqual(self.answer(key=key).json()['id'], wrong.json()['id'])
        self.assertEqual(self.answer(answers=[0], key=key).status_code, 409)
        self.assertTrue(self.answer(answers=[0]).json()['correct'])
        stats = self.client.get('/api/stats').json()
        self.assertEqual((stats['attempts'], stats['correct'], stats['covered'], stats['pending']), (2, 1, 1, 1))
        other = self.second()
        self.assertEqual(other.get('/api/stats').json()['attempts'], 0)
        self.assertEqual(other.get('/api/reviews').json()['items'], [])

    def test_03_multiple_choice_exact_match_and_input_validation(self):
        self.assertFalse(self.answer(3, [0]).json()['correct'])
        self.assertTrue(self.answer(3, [1, 0]).json()['correct'])
        self.assertEqual(self.answer(3, [0, 0]).status_code, 422)
        self.assertEqual(self.answer(3, [8]).status_code, 422)
        self.assertEqual(self.answer(1, [0, 1]).status_code, 422)
        self.assertEqual(self.client.get('/api/stats').json()['attempts'], 2)

    def test_04_review_notes_mastery_and_wrong_answer_reopens(self):
        self.answer()
        self.assertEqual(self.client.put('/api/reviews/1', json={'note': '单选使用同名radio', 'mastered': True}).status_code, 200)
        self.assertEqual(self.client.get('/api/questions?mode=wrong').json()['total'], 0)
        self.assertEqual(self.client.get('/api/questions?mode=wrong&mastery=mastered').json()['total'], 1)
        self.answer()
        review = self.client.get('/api/reviews').json()['items'][0]
        self.assertEqual(review['note'], '单选使用同名radio')
        self.assertEqual(review['mastered'], 0)
        self.assertEqual(self.second().put('/api/reviews/1', json={'note': '不应修改其他人', 'mastered': True}).status_code, 404)

    def test_05_own_question_permissions_history_conflict_and_restore(self):
        body = self.own()
        q = self.client.post('/api/questions', json=body).json()
        qid = q['id']
        other = self.second()
        self.assertEqual(other.get('/api/questions?mode=own').json()['total'], 0)
        self.assertEqual(other.put(f'/api/questions/{qid}', json=body).status_code, 404)
        self.assertEqual(self.answer(qid, [0], client=other).status_code, 404)
        self.assertEqual(self.client.put('/api/questions/1', json=body).status_code, 404)
        attempt = self.answer(qid, [0]).json()
        body.update(prompt='这是修改后的测试题目，新的正确选项是什么？', correct=[1])
        self.assertEqual(self.client.put(f'/api/questions/{qid}', json=body).json()['version'], 2)
        self.assertEqual(self.client.put(f'/api/questions/{qid}', json=body).status_code, 409)
        historical = self.client.get('/api/export').json()['attempts'][0]
        self.assertEqual(historical['question']['correct'], [0])
        self.assertEqual(historical['question']['version'], 1)
        self.assertEqual(historical['id'], attempt['id'])
        body.update(version=2, archived=True)
        self.assertEqual(self.client.put(f'/api/questions/{qid}', json=body).status_code, 200)
        self.assertEqual(self.answer(qid, [0]).status_code, 404)
        archived = self.client.get('/api/questions?mode=own&include_archived=true').json()['items'][0]
        self.assertTrue(archived['archived'])
        body.update(version=3, archived=False)
        self.assertEqual(self.client.put(f'/api/questions/{qid}', json=body).status_code, 200)
        self.assertTrue(self.answer(qid, [1]).json()['correct'])

    def test_06_reopen_database_preserves_records_and_migration(self):
        self.answer()
        self.client.put('/api/reviews/1', json={'note': '重开仍应保留', 'mastered': False})
        restarted = TestClient(create_app(self.path))
        self.addCleanup(restarted.close)
        restarted.cookies.update(self.client.cookies)
        self.assertEqual(restarted.get('/api/questions').json()['total'], 18)
        self.assertEqual(restarted.get('/api/stats').json()['attempts'], 1)
        self.assertEqual(restarted.get('/api/reviews').json()['items'][0]['note'], '重开仍应保留')
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM schema_migrations').fetchone()[0], 1)
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_07_exports_do_not_include_credentials_or_other_users(self):
        self.answer()
        self.second()
        export = self.client.get('/api/export')
        self.assertEqual(export.status_code, 200)
        self.assertNotIn('password_hash', export.text)
        self.assertNotIn('token_hash', export.text)
        self.assertNotIn('csrf', export.text)
        self.assertNotIn('learner_b', export.text)
        self.assertEqual(len(export.json()['attempts']), 1)
        self.assertEqual(sum(d['attempts'] for d in self.client.get('/api/stats').json()['days']), 1)

    def test_08_question_validation_and_request_size(self):
        body = self.own()
        body['correct'] = [5]
        self.assertEqual(self.client.post('/api/questions', json=body).status_code, 422)
        body['correct'] = [0, 0]
        self.assertEqual(self.client.post('/api/questions', json=body).status_code, 422)
        blank = self.own()
        blank['explanation'] = '     '
        self.assertEqual(self.client.post('/api/questions', json=blank).status_code, 422)
        blank = self.own()
        blank['options'] = ['相同选项', ' 相同选项 ']
        self.assertEqual(self.client.post('/api/questions', json=blank).status_code, 422)
        self.assertEqual(self.answer(2 ** 80).status_code, 422)
        self.assertEqual(self.client.put('/api/reviews/' + str(2 ** 80), json={'note': '', 'mastered': False}).status_code, 422)
        self.assertEqual(self.client.put('/api/reviews/1', json={'note': 'a' * 70000, 'mastered': False}).status_code, 413)
        self.assertEqual(self.client.post('/api/logout', content='{}', headers={'content-type': 'text/plain'}).status_code, 415)

    def test_09_login_logout_and_case_insensitive_username(self):
        self.assertEqual(self.client.post('/api/register', json={'username': 'LEARNER_A', 'password': 'Test-only-Password-2026'}).status_code, 409)
        self.assertEqual(self.client.post('/api/logout', json={}).status_code, 200)
        self.assertIsNone(self.client.get('/api/session').json()['user'])
        self.assertEqual(self.client.post('/api/login', json={'username': 'learner_a', 'password': 'wrong-password'}).status_code, 401)
        login = self.client.post('/api/login', json={'username': 'LEARNER_A', 'password': 'Test-only-Password-2026'})
        self.assertEqual(login.status_code, 200)
        self.client.headers['x-csrf-token'] = login.json()['csrf']
        self.assertEqual(self.client.get('/api/questions').status_code, 200)

    def test_10_concurrent_retries_only_insert_one_attempt(self):
        key = str(uuid.uuid4())
        def submit(_):
            with TestClient(self.app) as client:
                client.cookies.update(self.client.cookies)
                client.headers['x-csrf-token'] = self.client.headers['x-csrf-token']
                return self.answer(1, [0], key, client).json()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(submit, range(2)))
        self.assertEqual(results[0]['id'], results[1]['id'])
        self.assertEqual(self.client.get('/api/stats').json()['attempts'], 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
