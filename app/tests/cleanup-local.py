"""Remove only the exact local records created by api.integration.mjs."""
import json, sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
records=json.loads((root/'work/integration-records.json').read_text())
for db in (root/'.wrangler').rglob('*.sqlite'):
    with sqlite3.connect(db) as connection:
        exists=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").fetchone()
        if not exists: continue
        row=connection.execute('SELECT customer_id FROM orders WHERE id=?',(records['order'],)).fetchone()
        if row and row[0]!=records['customer']: raise RuntimeError('Test ownership mismatch; cleanup stopped')
        connection.execute('DELETE FROM order_events WHERE order_id=?',(records['order'],))
        connection.execute('DELETE FROM orders WHERE id=?',(records['order'],))
        connection.execute('DELETE FROM profiles WHERE id=?',(records['profile'],))
        connection.execute('DELETE FROM beans WHERE id=?',(records['bean'],))
        connection.execute('DELETE FROM customers WHERE id=?',(records['customer'],))
print('Only exact integration-test records removed from local storage.')
