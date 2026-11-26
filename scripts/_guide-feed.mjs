export function extractStaticGuides(source) {
  const unescape = (value) => value.replace(/\\([\\'nr])/g, (_, character) =>
    character === 'n' ? '\n' : character === 'r' ? '\r' : character);
  const regex = /slug:\s*'((?:\\.|[^'\\])*)'[\s\S]*?title:\s*'((?:\\.|[^'\\])*)'[\s\S]*?category:\s*'((?:\\.|[^'\\])*)'[\s\S]*?publishedAt:\s*'((?:\\.|[^'\\])*)'[\s\S]*?summary:\s*\n?\s*'((?:\\.|[^'\\])*)'(?:(?:(?!slug:)[\s\S])*?coverImage:\s*\{\s*src:\s*'((?:\\.|[^'\\])*)')?(?:(?:(?!slug:)[\s\S])*?relatedProductId:\s*'((?:\\.|[^'\\])*)')?/g;
  const guides = [];
  for (const match of source.matchAll(regex)) {
    const [, slug, title, category, publishedAt, summary, coverImageSrc, relatedProductId] = match;
    const nextGuideIndex = source.indexOf('    slug:', match.index + match[0].length);
    const block = source.slice(match.index, nextGuideIndex === -1 ? source.length : nextGuideIndex);
    guides.push({
      slug: unescape(slug), title: unescape(title), category: unescape(category),
      publishedAt: unescape(publishedAt), summary: unescape(summary),
      coverImageSrc: coverImageSrc ? unescape(coverImageSrc) : null,
      relatedProductId: relatedProductId ? unescape(relatedProductId) : null,
      publicationStatus: block.match(/publicationStatus:\s*'([^']+)'/)?.[1] || null,
    });
  }
  return guides;
}
