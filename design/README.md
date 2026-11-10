# Share card

`share-card.html` is the source of `public/share/smp-panorama-hd-20261110.jpg`.
Run `node scripts/preview-share-card.mjs`, open its localhost address, and capture
the full 2400 × 1260 page after the bundled fonts and images have loaded. Export
JPEG at quality 95 with 4:4:4 chroma to preserve fine text and logo edges.
The HTML is an authoring artifact; production serves only the committed image.
Use a new dated filename when the artwork changes so sharing services can fetch
the new file. Keep `defaultShareImage` in `free/seo/metadata.ts` in sync.

The approved panorama composition uses the existing homepage photograph, with
the original SMP SVG rendered directly at double resolution. A subpixel alpha
filter closes tiny trace seams in this export without changing the site logo.
The uncompressed source photograph is only loaded by the local preview server.
No generated or third-party artwork is included. Retain old image URLs for
existing sharing caches; only the default metadata points to the new asset.
Kakao's title panel remains outside the image and is controlled by Kakao.

Published reports use a separate 1200 × 630 composition containing the entire
first page, with the report title supplied by `og:title`. The trusted publishing
runner creates and caches these PNGs from the existing, integrity-checked cover.
`reportSharePath` versions their composition; bump its version and the staging
allowlist if changing it. Only current manifest entries enter the deployment.
No request-time image rendering, external image API, or extra database query is
needed. Preparation is bounded to 1,000 images, 1 MiB per generated image, and
the deployment's existing aggregate static asset limits.
