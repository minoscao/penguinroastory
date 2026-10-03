"""Delete only recorded synthetic accounts in an isolated account-audit database."""
import json, sqlite3, sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
target = (root / sys.argv[1]).resolve()
if not target.is_relative_to(root / '.wrangler') or not target.name.startswith('account-audit'):
    raise RuntimeError('Only isolated account-audit directories are permitted')
fixture = json.loads((root / sys.argv[2]).read_text(encoding='utf-8'))
ids = set(fixture['accounts'])
if not ids or len(ids) > 10:
    raise RuntimeError('Missing exact test account IDs')
for path in target.rglob('*.sqlite'):
    with sqlite3.connect(path) as db:
        if not db.execute("SELECT name FROM sqlite_master WHERE name='accounts'").fetchone():
            continue
        accounts = db.execute('SELECT id,username FROM accounts').fetchall()
        if any(i not in ids or not n.startswith(('admin-', 'staff-')) for i,n in accounts):
            raise RuntimeError('Non-test account found; cleanup stopped')
        trigger = db.execute("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='accounts_last_admin_delete'").fetchone()
        db.execute('BEGIN')
        db.execute('DROP TRIGGER IF EXISTS accounts_last_admin_delete')
        for account_id in ids:
            db.execute('DELETE FROM auth_sessions WHERE account_id=?',(account_id,))
            db.execute('DELETE FROM account_audit WHERE actor_id=? OR target_id=?',(account_id,account_id))
            db.execute('DELETE FROM accounts WHERE id=?',(account_id,))
        if not db.execute('SELECT 1 FROM accounts LIMIT 1').fetchone():
            db.execute('DELETE FROM auth_bootstrap WHERE id=1')
        if trigger:
            db.execute(trigger[0])
print('Removed exact synthetic accounts from the specified local test directory.')
