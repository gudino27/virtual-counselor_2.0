import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(BASE_DIR, "data", "courses.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create the table exactly as your Node server expects it
cursor.execute("""
CREATE TABLE IF NOT EXISTS catalog_degrees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_year TEXT,
    name TEXT,
    credits INTEGER,
    degree_type TEXT,
    college TEXT,
    url TEXT,
    source_type TEXT,
    external_id TEXT,
    narrative TEXT
)
""")

conn.commit()
conn.close()
print("catalog_degrees table created successfully!")