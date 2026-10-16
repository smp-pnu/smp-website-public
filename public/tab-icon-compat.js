// The HTML advertises only the round, high-contrast search icon. Google renders
// JavaScript too, so keep that icon for crawlers and URL inspection tools.
// This changes tab presentation only; page content and metadata stay identical.
// Run before initial icon selection for Safari, which ignores data-URL icons.
;(function () {
  const ua = navigator.userAgent || ''
  // Browser-shaped fetchers and automated rendering must not select white-only
  // artwork. Keep the legacy Google Favicon identifier as a compatibility guard;
  // Google no longer documents it as its current Search crawler.
  if (navigator.webdriver || !/(?:Chrome|Chromium|Firefox|Safari)\//i.test(ua) || /bot|crawler|spider|slurp|yeti|inspectiontool|googleother|google[ -]favicon|lighthouse|headless/i.test(ua)) return
  const icon = document.querySelector('link[rel="icon"]')
  if (icon) {
    icon.href = '/smp-tab-mark.png'
    icon.type = 'image/png'
    icon.sizes.value = '32x32'
  }
})()
