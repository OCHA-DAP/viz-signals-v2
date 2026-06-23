export function isMobile() {
  const userAgentCheck = /Mobi|Android/i.test(navigator.userAgent);
  const screenSizeCheck = window.matchMedia('(max-width: 767px)').matches;
  return userAgentCheck || screenSizeCheck;
}

export function isValid(url) {
  return url !== 'NA' && url !== 'nan' && url !== undefined && url !== '';
}
