"""Lossless web-view copy. Original bytes and digital signatures are untouched."""
import io
import json
import sys
import pikepdf

source, destination = sys.argv[1:3]
with pikepdf.open(source) as pdf:
    signed = any(isinstance(obj, pikepdf.Dictionary) and
                 (obj.get('/Type') == '/Sig' or obj.get('/FT') == '/Sig') for obj in pdf.objects)
    if pdf.is_encrypted or signed:
        print(json.dumps({'skipped': 'encrypted-or-signed'}))
        sys.exit(0)
    pages = len(pdf.pages)
    # Reorder/compress streams without downsampling, rasterizing or changing text.
    pdf.save(destination, linearize=True, compress_streams=True,
             recompress_flate=True, deterministic_id=True)
with pikepdf.open(destination) as result:
    if len(result.pages) != pages or not result.check_linearization(io.StringIO()):
        raise RuntimeError('Invalid optimized document')
    if result.check_pdf_syntax():
        raise RuntimeError('Optimized document failed syntax validation')
print(json.dumps({'pages': pages, 'linearized': True}))
