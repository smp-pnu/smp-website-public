# Sharing artwork

Approved composition: the homepage uses the Gwangan panorama; reports use the
same panorama, the cleaned SMP vector, the company and headline, and the entire
PDF cover. Site favicons and page design are separate and unchanged.

`share-card.html` is the homepage authoring source. Run
`node scripts/preview-share-card.mjs` and capture the full 2400 × 1260 page after
local fonts and images load. Export JPEG quality 95, 4:4:4. The current image is
`public/share/smp-panorama-20261111.jpg`; metadata lives in `free/seo/metadata.ts`.
Use a new dated filename for artwork changes. Retain previously deployed URLs.

The clean native vector is `public/share/smp-symbol-clean.svg`, with the editable
copy in `design/smp-symbol-clean.svg`. It uses continuous straight edges and cubic
curves; no bitmap, trace fragments, blur or seam-hiding filter. The panorama is
an existing homepage photograph. `design/share-background.jpg` is its 2400×1260
crop at vertical position 58%, for the trusted report publishing runner only.

## Automatic report banners

Administrators upload a PDF, review its company/title, and approve publication.
The publisher uses the already prepared first-page cover and approved text to
create a 2400×1260 JPEG with `free/jobs/share-artwork.ts`. Korean Unicode subsets
from the existing bundled Noto Sans KR package are registered locally. User text
is drawn as literal canvas text, not interpolated into SVG or HTML.

The composition version, cover hash and normalized company/title fingerprint
form the image URL. Unchanged inputs reuse their saved image. Changed copy is
queued with publication; the previous public edition remains until deployment
succeeds. Copy-only edits and re-publication reuse the PDF and do not spend the
daily PDF-processing allowance. Summary/date-only changes need no new banner.

Only current manifest entries are staged. Each JPEG is capped at 1 MiB and a
batch at 1,000 images; deployment-wide static asset budgets remain enforced.
No visitor-time rendering, LLM call, new service or extra database query is used.
Kakao may retain an old preview independently; its URL metadata tool can refresh
the homepage or a changed report after publication.
