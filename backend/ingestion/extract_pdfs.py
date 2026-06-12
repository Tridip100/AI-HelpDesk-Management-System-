# backend/ingestion/extract_pdfs.py
#
# ─────────────────────────────────────────
# WHAT THIS FILE DOES:
# Reads every PDF from ingestion/data/pdfs/
# Extracts clean text using pdfplumber
# Saves as .txt files in ingestion/data/sops/
#
# WHY WE NEED THIS:
# ChromaDB and sentence-transformers work with TEXT not PDFs
# PDFs are binary files — we must convert to plain text first
# pdfplumber is better than PyPDF2 for technical docs because:
#   - preserves heading structure
#   - handles multi-column layouts
#   - doesn't garble technical content
#
# WHEN TO RUN:
# Run ONCE before ingestion
# Re-run only if you add new PDFs
#
# HOW IT CONNECTS:
# extract_pdfs.py → creates sops/*.txt
# document_ingestor.py → reads sops/*.txt → embeds → ChromaDB
# ─────────────────────────────────────────

import os
import pdfplumber
from pathlib import Path

# Paths relative to this file
BASE_DIR    = os.path.dirname(__file__)
PDF_DIR     = os.path.join(BASE_DIR, "data", "pdfs")
OUTPUT_DIR  = os.path.join(BASE_DIR, "data", "sops")

os.makedirs(PDF_DIR,   exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def extract_pdf(pdf_path: str) -> str:
    """
    Extract clean text from one PDF file.

    How pdfplumber works:
    - Opens PDF page by page
    - Extracts text preserving layout
    - We join pages with separators

    Returns full text as string.
    """
    text_pages = []

    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        print(f"  Pages: {total}")

        for i, page in enumerate(pdf.pages):
            page_text = page.extract_text()

            if not page_text:
                continue  # skip blank pages

            # Clean up lines — remove empty ones
            lines = [
                line.strip()
                for line in page_text.splitlines()
                if line.strip()
            ]

            if lines:
                text_pages.append(
                    f"--- Page {i+1} of {total} ---\n" +
                    "\n".join(lines)
                )

    return "\n\n".join(text_pages)


def extract_all():
    """
    Find all PDFs in data/pdfs/ and extract to data/sops/
    Called by run_ingestion.py
    """
    pdf_files = sorted(Path(PDF_DIR).glob("*.pdf"))

    if not pdf_files:
        print(f"No PDFs found in {PDF_DIR}")
        return 0

    print(f"\nFound {len(pdf_files)} PDF(s) to extract\n")
    success = 0

    for pdf_path in pdf_files:
        print(f"Extracting: {pdf_path.name}")

        try:
            text = extract_pdf(str(pdf_path))

            if len(text) < 200:
                print(f"  WARNING: Very short — only {len(text)} chars. Skipping.")
                continue

            # Save with same name but .txt extension
            output_name = pdf_path.stem + ".txt"
            output_path = os.path.join(OUTPUT_DIR, output_name)

            with open(output_path, "w", encoding="utf-8") as f:
                # Header — useful for debugging which doc a chunk came from
                f.write(f"DOCUMENT: {pdf_path.name}\n")
                f.write(f"TOPIC: {pdf_path.stem.replace('-', ' ').title()}\n")
                f.write("=" * 60 + "\n\n")
                f.write(text)

            size_kb = len(text) // 1024
            print(f"  Saved: {output_name} ({size_kb} KB, {len(text):,} chars)")
            success += 1

        except Exception as e:
            print(f"  ERROR: {e}")
            continue

    print(f"\nExtraction complete — {success}/{len(pdf_files)} PDFs extracted")
    return success


if __name__ == "__main__":
    extract_all()