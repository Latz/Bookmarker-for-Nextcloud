chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate message is intended for offscreen document
  if (request.target !== 'offscreen') {
    return false; // Not for us, don't handle
  }

  // Handle theme detection
  if (request.msg === 'getBrowserTheme') {
    try {
      const media = window.matchMedia('(prefers-color-scheme: light)');
      const matches = media.matches;
      sendResponse(matches);
    } catch (error) {
      console.error('Error in offscreen matchMedia:', error);
      // Default to light theme on error
      sendResponse(true);
    }
    return true; // Keep channel open for async response
  }

  // Handle HTML parsing
  if (request.msg === 'parseHTML') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(request.html, 'text/html');

      // Extract the data we need for getKeywords and getDescription
      const result = {
        // For getMeta function
        metaTags: Array.from(doc.querySelectorAll('meta')).map(meta => ({
          name: meta.getAttribute('name'),
          property: meta.getAttribute('property'),
          itemprop: meta.getAttribute('itemprop'),
          httpEquiv: meta.getAttribute('http-equiv'),
          content: meta.getAttribute('content')
        })),

        // For querySelectorAll operations
        aRelTag: Array.from(doc.querySelectorAll('a[rel=tag]')).map(a => a.textContent),
        aRelCategory: Array.from(doc.querySelectorAll('a[rel=category]')).map(a => a.textContent),

        // For JSON-LD parsing
        jsonLdScripts: Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(script => script.textContent),

        // For Google Tag Manager
        scripts: Array.from(doc.querySelectorAll('script')).map(script => script.text),

        // For GitHub keywords
        githubTopics: Array.from(doc.querySelectorAll('a[data-ga-click="Topic, repository page"]')).map(a => a.textContent.trim()),

        // For Next.js data
        nextData: doc.getElementById('__NEXT_DATA__')?.textContent || '',

        // For description extraction
        description: Array.from(doc.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')).map(meta => meta.getAttribute('content')).filter(Boolean),

        // For extended keywords (headlines)
        headlines: {
          h1: Array.from(doc.querySelectorAll('h1')).map(h => h.textContent),
          h2: Array.from(doc.querySelectorAll('h2')).map(h => h.textContent),
          h3: Array.from(doc.querySelectorAll('h3')).map(h => h.textContent),
          h4: Array.from(doc.querySelectorAll('h4')).map(h => h.textContent),
          h5: Array.from(doc.querySelectorAll('h5')).map(h => h.textContent),
          h6: Array.from(doc.querySelectorAll('h6')).map(h => h.textContent)
        }
      };

      sendResponse(result);
    } catch (error) {
      console.error('Error in offscreen HTML parsing:', error);
      sendResponse({ error: error.message });
    }
    return true; // Keep channel open for async response
  }

  return false; // Not handled
});
