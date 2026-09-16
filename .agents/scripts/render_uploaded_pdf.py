from pathlib import Path

import fitz


source = Path("attached_assets/DOC-20260903-WA0000_1788393248406.pdf")
output_dir = Path(".agents/outputs/uploaded-pdf")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    target = output_dir / f"page-{index + 1}.png"
    pixmap.save(target)
    print(target)