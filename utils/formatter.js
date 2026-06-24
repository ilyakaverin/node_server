function getFileName(fileUrl, index) {
  try {
    const pathname = new URL(fileUrl).pathname;
    const rawName = pathname.substring(pathname.lastIndexOf('/') + 1);
    const decoded = rawName ? decodeURIComponent(rawName) : `Файл ${index + 1}`;
    return decoded || `Файл ${index + 1}`;
  } catch {
    return `Файл ${index + 1}`;
  }
}

export function formatTitlesAndLinks(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return '';

  return urls
    .map((fileUrl, index) => {
      const label = getFileName(fileUrl, index);
      return `- [${label}](${fileUrl})`;
    })
    .join('\n');
}
