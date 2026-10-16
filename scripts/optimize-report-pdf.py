"""Lossless web-view copy. Original bytes and digital signatures are untouched."""
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
    # Group page dictionaries in compact object streams. A linearized flat
    # page tree makes PDF.js checkLastPage fetch nearly every page dictionary
    # before showing page 1. Compact objects keep that index together.
    # Images, vectors, text, annotations and accessibility tags are preserved.
    pdf.save(destination, object_stream_mode=pikepdf.ObjectStreamMode.generate,
             compress_streams=True, recompress_flate=True, deterministic_id=True)
with pikepdf.open(destination) as result:
    if len(result.pages) != pages:
        raise RuntimeError('Invalid optimized document')
    if result.check_pdf_syntax():
        raise RuntimeError('Optimized document failed syntax validation')
print(json.dumps({'pages': pages, 'optimized': True}))
