import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(BASE_DIR, "data", "courses.db")

def seed_degrees():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 3 Realistic WSU Degrees to test the UI
    mock_data = [
        ("2026", "Computer Science, BS", 120, "Major", "Voiland College of Engineering and Architecture", "https://catalog.wsu.edu", "Catalog", "CS-BS", "The Bachelor of Science in Computer Science prepares students..."),
        ("2026", "Data Analytics, BS", 120, "Major", "College of Arts and Sciences", "https://catalog.wsu.edu", "Catalog", "DA-BS", "Data Analytics focuses on applying statistical methods..."),
        ("2026", "Software Engineering, BA", 120, "Major", "Voiland College of Engineering and Architecture", "https://catalog.wsu.edu", "Catalog", "SE-BA", "The BA in Software Engineering emphasizes the software development lifecycle...")
    ]
    
    # Insert the mock data
    cursor.executemany("""
        INSERT INTO catalog_degrees (
            catalog_year, name, credits, degree_type, college, url, source_type, external_id, narrative
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, mock_data)
    
    conn.commit()
    conn.close()
    print(f"Success! Seeded {len(mock_data)} degrees into the database.")

if __name__ == "__main__":
    seed_degrees()