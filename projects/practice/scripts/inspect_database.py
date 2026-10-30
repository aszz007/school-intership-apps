"""Read-only schema and counts for the technical demonstration; no user rows."""
import json
import sqlite3
from pathlib import Path

path = Path(__file__).resolve().parent.parent / '.local/practice.sqlite3'
if not path.exists():
    raise SystemExit('请先启动知练。')
db = sqlite3.connect('file:' + path.as_posix() + '?mode=ro', uri=True)
try:
    tables = ['schema_migrations', 'users', 'sessions', 'questions', 'attempts', 'reviews']
    result = {'schema_version': db.execute('PRAGMA user_version').fetchone()[0],
              'tables': [{'table': name, 'rows': db.execute('SELECT COUNT(*) FROM ' + name).fetchone()[0]} for name in tables],
              'view': db.execute("SELECT name,sql FROM sqlite_master WHERE type='view' AND name='view_user_topic_stats'").fetchone(),
              'integrity': db.execute('PRAGMA integrity_check').fetchone()[0]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
finally:
    db.close()
