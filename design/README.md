# Share card

`share-card.html` is the source of `public/share/smp-official-20261110.png`.
Run `node scripts/preview-share-card.mjs`, open its localhost address, and export
the exact 1200 × 630 viewport as PNG after the bundled fonts and logo have loaded.
The HTML is an authoring artifact; production serves only the committed PNG.
Use a new dated filename when the artwork changes so sharing services can fetch
the new file. Keep `defaultShareImage` in `free/seo/metadata.ts` in sync.

The floating card takes cues from overlapping surfaces in
[Griffin's sharing image](https://godly.design/website/griffin/) and the
object-at-the-lower-edge composition in
[Vessa's sharing image](https://godly.design/website/vessa/).
No third-party artwork is included. The logo is the site's existing SMP SVG.
Kakao's title panel remains outside the image and is controlled by Kakao.

Published reports use a separate 1200 × 630 composition containing the entire
first page, with the report title supplied by `og:title`. The trusted publishing
runner creates and caches these PNGs from the existing, integrity-checked cover.
`reportSharePath` versions their composition; bump its version and the staging
allowlist if changing it. Only current manifest entries enter the deployment.
No request-time image rendering, external image API, or extra database query is
needed. Preparation is bounded to 1,000 images, 1 MiB per generated image, and
the deployment's existing aggregate static asset limits.
