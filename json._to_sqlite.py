import json
import sqlite3
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(BASE_DIR, "prompt-search", "data", "domain", "metadata.json")
db_path = os.path.join(BASE_DIR, "data", "courses.db")

def hydrate_database():
    if not os.path.exists(json_path):
        print(f"Error: Could not find metadata.json at {json_path}")
        return

    # 1. Load the JSON data
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print(f"Found {len(data)} entries in JSON. Starting migration...")

    # 2. Clear existing (empty) data to avoid duplicates
    cursor.execute("DELETE FROM courses")

    count = 0
    for entry in data:
        # Extract fields from your specific metadata format
        course_code = entry.get('course_code', '')
        prereqs = entry.get('prereq_raw', 'None')
        description = entry.get('chunk_text', '')
        
        # Split 'CPT S 321' into 'CPT S' and '321'
        match = re.search(r'([A-Z\s]{2,6})\s*(\d{3})', course_code)
        if match:
            prefix = match.group(1).strip()
            number = match.group(2).strip()
            
            # 3. Insert into the courses table
            cursor.execute("""
                INSERT INTO courses (
                    prefix, courseNumber, title, courseDescription, coursePrerequisite, 
                    uniqueId, campus, term, year, isLab, sectionNumber
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                prefix, number, course_code, description, prereqs,
                f"ID-{count}", "Pullman", "Spring", 2026, 0, "01"
            ))
            count += 1

    conn.commit()
    conn.close()
    print(f"Success! {count} courses migrated from JSON to SQLite.")

if __name__ == "__main__":
    hydrate_database()