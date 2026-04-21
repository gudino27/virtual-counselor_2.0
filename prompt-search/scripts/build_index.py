import json
import os
import sys

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from retrieval.ingestor import CatalogIngestor
from retrieval.degree_ingestor import parse_degree_chunks

CATALOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "pdf-archieved-catalog", "2024.txt")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "domain")

if __name__ == "__main__":
    catalog_path = os.path.abspath(CATALOG_PATH)
    output_dir = os.path.abspath(OUTPUT_DIR)
    os.makedirs(output_dir, exist_ok=True)

    # --- Course chunks ---
    course_ingestor = CatalogIngestor(catalog_path=catalog_path, output_dir=output_dir)
    course_chunks = course_ingestor.parse_chunks()
    print(f"Parsed {len(course_chunks)} course chunks")

    # --- Degree requirement chunks ---
    degree_chunks = parse_degree_chunks(catalog_path)
    print(f"Parsed {len(degree_chunks)} degree requirement chunks")

    # --- Combine ---
    all_chunks = course_chunks + degree_chunks
    texts = [c["chunk_text"] for c in all_chunks]

    print("Encoding all chunks...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
    embeddings = embeddings.astype(np.float32)

    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)

    faiss.write_index(index, os.path.join(output_dir, "courses.faiss"))
    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(all_chunks, f)

    print(f"Saved {len(all_chunks)} total chunks ({len(course_chunks)} courses + {len(degree_chunks)} degree plans)")
    print("Run scripts/query.py to start asking questions.")
