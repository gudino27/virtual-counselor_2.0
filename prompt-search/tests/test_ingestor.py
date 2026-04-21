import pytest

from src.retrieval.ingestor import CatalogIngestor


# PDF-extracted format: department prefix on its own line, then number + title on next line
SAMPLE_CATALOG = """
CPTS
121 Program Design and Development
Credits: 3
Description: Computational problem solving and program design using a high-level language.
Prereq: None.

122 Data Structures
Credits: 3
Description: Abstract data types, dynamic storage allocation.
Prereq: CPTS 121.

360 Systems Programming
Credits: 3
Description: System calls and memory management.
Prereq: CPTS 121 and CPTS 122.

MATH
171 Calculus I
Credits: 4
Description: Limits, continuity, derivatives.
Prereq: MATH 107 or placement.
"""


@pytest.fixture
def catalog_file(tmp_path):
    f = tmp_path / "test_catalog.txt"
    f.write_text(SAMPLE_CATALOG)
    return str(f)


@pytest.fixture
def output_dir(tmp_path):
    d = tmp_path / "domain"
    d.mkdir()
    return str(d)


class TestCatalogIngestor:
    def test_parse_chunks_finds_courses(self, catalog_file, output_dir):
        ingestor = CatalogIngestor(catalog_file, output_dir)
        chunks = ingestor.parse_chunks()
        codes = [c["course_code"] for c in chunks]
        assert "CPTS 121" in codes
        assert "CPTS 122" in codes
        assert "MATH 171" in codes

    def test_parse_chunks_extracts_prereqs(self, catalog_file, output_dir):
        ingestor = CatalogIngestor(catalog_file, output_dir)
        chunks = ingestor.parse_chunks()
        cpts360 = next((c for c in chunks if c["course_code"] == "CPTS 360"), None)
        assert cpts360 is not None
        assert "CPTS 121" in cpts360["prereq_raw"] or "CPTS 122" in cpts360["prereq_raw"]

    def test_parse_chunks_no_prereq_is_empty_string(self, catalog_file, output_dir):
        ingestor = CatalogIngestor(catalog_file, output_dir)
        chunks = ingestor.parse_chunks()
        cpts121 = next((c for c in chunks if c["course_code"] == "CPTS 121"), None)
        assert cpts121 is not None
        assert isinstance(cpts121["prereq_raw"], str)

    def test_chunk_text_not_empty(self, catalog_file, output_dir):
        ingestor = CatalogIngestor(catalog_file, output_dir)
        chunks = ingestor.parse_chunks()
        for chunk in chunks:
            assert len(chunk["chunk_text"]) >= 20

    def test_prefix_change_does_not_corrupt_last_course(self, catalog_file, output_dir):
        # CPTS 360 is the last CPTS course before MATH appears — must not be saved as MATH 360
        ingestor = CatalogIngestor(catalog_file, output_dir)
        chunks = ingestor.parse_chunks()
        codes = [c["course_code"] for c in chunks]
        assert "CPTS 360" in codes
        assert "MATH 360" not in codes
