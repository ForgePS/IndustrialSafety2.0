"""Render Producers LOTO layout PDF page 1 into the printable sheet PNG assets."""
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "apps/platform-api/assets/branding/Producers_Rice_Mill_LOTO_Layout_Template.pdf"
OUT_API = ROOT / "apps/platform-api/assets/branding/producers-loto-procedure-sheet.png"
OUT_WEB = ROOT / "apps/industrial-web/public/branding/producers-loto-procedure-sheet.png"
BACKUP = OUT_API.with_name("producers-loto-procedure-sheet.previous.png")

# ~150 DPI letter (sharper than the prior 790x1024 asset)
ZOOM = 150 / 72


def main() -> None:
    if not PDF.exists():
        raise SystemExit(f"Missing PDF: {PDF}")
    doc = pymupdf.open(PDF)
    print(f"pages={doc.page_count}")
    if OUT_API.exists() and not BACKUP.exists():
        BACKUP.write_bytes(OUT_API.read_bytes())
        print(f"backed up previous sheet -> {BACKUP.name}")

    mat = pymupdf.Matrix(ZOOM, ZOOM)
    page = doc.load_page(0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    png = pix.tobytes("png")
    OUT_API.write_bytes(png)
    OUT_WEB.parent.mkdir(parents=True, exist_ok=True)
    OUT_WEB.write_bytes(png)
    print(f"wrote {OUT_API} {pix.width}x{pix.height} ({len(png)} bytes)")
    print(f"wrote {OUT_WEB}")

    if doc.page_count > 1:
        page2 = doc.load_page(1)
        pix2 = page2.get_pixmap(matrix=mat, alpha=False)
        out2 = OUT_API.with_name("producers-loto-procedure-sheet-page2.png")
        out2_web = OUT_WEB.with_name("producers-loto-procedure-sheet-page2.png")
        png2 = pix2.tobytes("png")
        out2.write_bytes(png2)
        out2_web.write_bytes(png2)
        print(f"wrote page2 {out2.name} {pix2.width}x{pix2.height}")
    doc.close()


if __name__ == "__main__":
    main()
