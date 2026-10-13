// Safari ignores data-URL favicons (WebKit bug 236616). Run before the initial
// icon selection; delayed updates after React mounts are not reliable there.
if (navigator.vendor === 'Apple Computer, Inc.' && /Safari\//.test(navigator.userAgent)) {
  for (const icon of document.querySelectorAll('link[rel="icon"]')) {
    icon.href = '/smp-tab-mark.png'
    icon.type = 'image/png'
    icon.sizes.value = '32x32'
  }
}
