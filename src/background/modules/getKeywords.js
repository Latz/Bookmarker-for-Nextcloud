import getMeta from './getMeta.js';
import { cacheGet } from '../../lib/cache.js';
import { getOption, getOptions } from '../../lib/storage.js';
import getDescription from './getDescription.js';
import log from '../../lib/log.js';

const DEBUG = true;
console.log('🚀 ~ DEBUG:', DEBUG);

// ---------------------------------------------------------------------------------------------------
/**
 * Logs the given part, keywords, and the length of the keywords array to the console.
 *
 * @param {string} part - The part to log.
 * @param {Array<string>} [keywords] - An optional array of keywords to log.
 *
 * @returns {void}
 */

/**
 * Reduces an array of keywords by removing duplicates and filtering out
 * any keywords that are not present in the cache.
 *
 * @param {Array} keywords - An array of keywords to be reduced.
 * @return {Array} - An array of reduced keywords.
 */
async function reduceKeywords(keywords, force = false) {
  const cbx_reduceKeywords = await getOption('cbx_reduceKeywords');
  console.log('🚀 ~ reduceKeywords ~ cbx_reduceKeywords:', cbx_reduceKeywords);

  if (force === false && cbx_reduceKeywords === false) {
    // if the user does not want to reduce the keywords, we return
    return Promise.resolve(keywords);
  }

  keywords = [...new Set(keywords)];

  let allKeywords = await cacheGet('keywords');
  if (allKeywords === undefined || Object.keys(allKeywords).length === 0) {
    return [];
  }

  // no keywords on server, api returns an error
  if (allKeywords?.ok === false) {
    return [];
  }

  allKeywords = allKeywords.map((keyword) => keyword.toLowerCase());

  let reducedKeywords = keywords.filter((keyword) =>
    allKeywords.includes(keyword.toLowerCase()),
  );

  // make keywords unique
  reducedKeywords = [...new Set(reducedKeywords)];

  return Promise.resolve(reducedKeywords);
}

// ----------------------------------------------------------------------------------------

export default async function getKeywords(content, document) {
  // define an array of function whcih can be looped through later and
  // break if a function found keywords

  let keywords;
  const fs = [
    // -----------------------------------------------------------------------------------------
    // get Meta data
    () => {
      let metaKeywords = getMeta(
        document,
        { type: 'name', id: 'keywords' },
        { type: 'property', id: 'keywords' },
        { type: 'name', id: 'news_keywords' },
        { type: 'property', id: 'article:tag' },
        { type: 'property', id: 'og:article:tag' },
        { type: 'itemprop', id: 'keywords' },
        { type: 'name', id: 'sailthru.tags' },
        { type: 'name', id: 'parsely-tags' },
        { type: 'http-equiv', id: 'keywords' },
      );

      if (metaKeywords.length === 0) {
        return [];
      }

      // If there is exactly one keywords string it might be a collection of keywords devided by comma, semicolo, or spaces
      // Try these possibilities otherwise return given keyword string
      // TODO: Vielleicht erst Wörter zwischen Anführungszeichen raus suchen
      if (metaKeywords.length === 1) {
        const dividers = [',', ';', '&amp;', ' '];
        if (dividers.some((v) => metaKeywords[0].includes(v))) {
          // https://www.heise.de
          if (metaKeywords[0].includes(','))
            keywords = metaKeywords[0].split(',');
          else if (metaKeywords[0].includes(';'))
            keywords = metaKeywords[0].split(';');
          else if (metaKeywords[0].includes(' '))
            keywords = metaKeywords[0].split(' ');
          else if (metaKeywords[0].includes('&amp;'))
            // https://www.epa.gov/mold/mold-course-introduction
            keywords = metaKeywords[0].split(/&amp;/g);
        }
      } else keywords = metaKeywords;
      if (keywords) {
        keywords = keywords
          .map((keyword) => keyword.replace(/"/g, ''))
          .map((keyword) => keyword.trim());
      } else keywords = [];
      return keywords;
    },
    // ------------------------------------------------------------------------------
    // try <a href="" rel="tag">
    // (https://www.lenfestinstitute.org/solution-set/i-canceled-22-digital-newspaper-subscriptions-heres-what-i-learned-about-digital-retention-strategies/)
    // ------------------------------------------------------------------------------
    () => {
      const keywords = [];
      const relsTag = document.querySelectorAll('a[rel=tag]');
      relsTag.forEach((tag) => keywords.push(tag.textContent));
      return keywords;
    },
    // ------------------------------------------------
    // try <a href="" rel="category">
    () => {
      const keywords = [];
      const relsCategories = document.querySelectorAll('a[rel=category]');
      relsCategories.forEach((category) => keywords.push(category.textContent));
      return keywords;
    },

    // ------------------------------------------------
    // try JSON-LD
    () => {
      let keywords = [];
      const jsonlds = document.querySelectorAll(
        'script[type="application/ld+json"]',
      );
      jsonlds.every((jsonld) => {
        if (jsonld || jsonld !== null) {
          try {
            jsonld = JSON.parse(jsonld.innerText);
          } catch (e) {
            // Skip invalid or empty JSON
            return true; // Continue to next item
          }

          // https://harpers.org/archive/2024/07/art-and-artifice-donna-tartt/
          if (jsonld['@graph'] && Array.isArray(jsonld['@graph'])) {
            jsonld['@graph'].forEach((element) => {
              if (element['@type'] === 'Article') {
                keywords = element['keywords'];
                return true;
              }
            });
          }
          if (jsonld['@graph'] && jsonld['@graph']['@type'] === 'Article') {
            keywords = jsonld['@graph']['keywords'];
            return true;
          }

          // https://allthatsinteresting.com/
          if (jsonld.keywords) {
            if (jsonld.keywords.length > 0) {
              if (Array.isArray(jsonld.keywords)) {
                keywords = jsonld.keywords;
                return true;
              }
              if (
                typeof jsonld.keywords === 'string' ||
                jsonld.keywords instanceof String
              ) {
                keywords = jsonld.keywords.split(',');
                return true;
              }
            }
            //https://edition.cnn.com/2023/04/25/world/lunar-lander-japan-uae-hakuto-r-scn/index.html
            if (Object.prototype.hasOwn(jsonld.keywords[0], 'termCode')) {
              jsonld.keywords.forEach((term) => {
                if (term.termCode.label) keywords.push(term.termCode.label);
              });
              return true;
            }
            keywords = jsonld.keywords
              .split(',')
              .map((keyword) => keyword.trim());
            if (Array.isArray(keywords)) {
              return true;
            } // if keywords is an array the conversion was successful
            jsonld.keywords?.forEach((keyword) => {
              let [id, value] = keyword.split(':');
              if (id.toLowerCase() === 'tag') keywords.push(value);
            });
            // keywords are only comma separated Array
            // https://www.vox.com/platform/amp/down-to-earth/22679378/tree-planting-forest-restoration-climate-solutions
            if (jsonld.keywords) {
              keywords = jsonld.keywords;
              return true;
            }
          }
        }
        // https://www.nature.com/articles/d41586-024-00169-7
        if (
          jsonld?.mainEntity?.keywords?.length > 0 &&
          Array.isArray(jsonld.mainEntity.keywords)
        ) {
          keywords = jsonld.mainEntity.keywords;
          return true;
        }
      });
      return keywords;
    },
    // ------------------------------------------------------------------------------------------
    // Google Tags Manager
    // ------------------------------------------------------------------------------------------
    () => {
      log(DEBUG, 'Google Tags Manager');
      let keywords = [];
      const nodeList = document.querySelectorAll('script');

      let i = 0;
      while (i < nodeList.length && keywords.length === 0) {
        const script = nodeList[i].text;
        if (script.includes('dataLayer.push')) {
          const regex = /push\((.*)\)/g;
          const match = regex.exec(script);
          try {
            // JSON might be broken, so be carful
            const json = JSON.parse(match[1].replace(/undefined/g, '"x"'));
            keywords = json.content.keywords.split('|');
          } catch (e) {
            return [];
          }
        }
        i++;
      }
      return keywords;
    },
    // ------------------------------------------------------------------------------------------
    // Github
    // ------------------------------------------------------------------------------------------
    () => {
      log(DEBUG, 'github');
      let keywords = [];
      // GitHub's current topic selectors (updated 2025)
      // Topics are displayed as: <a href="/topics/opencode" class="topic-tag topic-tag-link">opencode</a>
      const selectors = [
        'a[class*="topic-tag"]', // Matches topic-tag class
        'a[data-view-component="true"][title^="Topic:"]', // GitHub's newer structure
        'a[href^="/topics/"]', // Topic links
        'a[data-ga-click="Topic, repository page"]', // Legacy selector (for backward compatibility)
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        log(
          DEBUG,
          `GitHub selector: ${selector}, found ${elements.length} elements`,
        );
        if (elements.length > 0) {
          elements.forEach((el) => {
            const text = el.textContent.trim();
            if (text) {
              keywords.push(text);
            }
          });
          // Stop after finding topics with first successful selector
          if (keywords.length > 0) break;
        }
      }
      log(DEBUG, 'github keywords:', keywords);

      return keywords;
    },

    () => {
      let keywords = [];
      log(DEBUG, 'Next_data');
      let next_data = '';
      try {
        next_data = document.getElementById('__NEXT_DATA__').innerText;
      } catch (e) {
        return [];
      }
      const json = JSON.parse(next_data);
      try {
        const tags = json.props.pageProps.post.tags;
        if (tags) {
          keywords = tags.split(',');
        }
      } catch (e) {
        return [];
      }

      return keywords;
    },

    // -----------------------------------------------------------------------------------------------
    () => {
      // xplGlobal.document.metadata -> https://ieeexplore.ieee.org/document/10243497
      const regex = /xplGlobal.document.metadata=(.*);/g;
      const match = regex.exec(content);
      if (!match) return [];
      try {
        const xplJson = JSON.parse(match[1]);
        keywords = [];
        xplJson.keywords.forEach((tags) => {
          let tagskwd = tags.kwd;
          tagskwd.forEach((tag) => {
            keywords.push(tag);
          });
        });
        return keywords;
      } catch (e) {
        return [];
      }
    },
    () => {
      // -----------------------------------------------------------------------
      // Brute force search for pattern /keywords: "keyword1, keyword2, keyword3"/
      keywords = [];
      const regex = /keywords:\s*"(.*)"/g;
      const match = regex.exec(content);
      if (match) {
        keywords = match[1].split(',');
      }
      return keywords;
    },
  ];

  // Loop through the various functions
  // --------------------------------------------------------------------------------------------

  // OPTIMIZATION: Batch fetch all options upfront to avoid multiple storage reads
  const options = await getOptions([
    'cbx_autoTags',
    'cbx_extendedKeywords',
    'input_headlinesDepth',
  ]);

  // This large try is lame but it keeps the extension running if there is any error
  // finding the keywords.
  //  try {
  if (!options.cbx_autoTags) return [];

  for (const f of fs) {
    let keywords = [];
    keywords = f();
    log(DEBUG, '🚀 ~ keywords:', keywords);

    // use only keywords that are already stored in Bookmarks
    // switchable by Options/Advanced
    if (keywords && keywords.length > 0) {
      const reducedKeywords = await reduceKeywords(keywords);
      return Promise.resolve(reducedKeywords);
    }
  }

  // ----------------------------------------------------------------------------------------
  // --- Last resort: Try to match parts of description or headlines with stored keywords ---

  // If the user does not want to use this feature, return an empty array
  log(
    DEBUG,
    ':: ~ getKeywords ~ extendedKeywords:',
    options.cbx_extendedKeywords,
  );
  if (!options.cbx_extendedKeywords) return Promise.resolve([]);
  log(DEBUG, 'Extended Keywords!');

  // --- description ---
  log(DEBUG, 'Description');
  let description = getDescription(document);
  if (description.length > 0) {
    const words = description.split(/[\W_]+/g);
    keywords = await reduceKeywords(words, true);
    if (keywords.length > 0) {
      return Promise.resolve(keywords);
    }
  } // --- headlines ---
  log(DEBUG, 'Headlines');
  const maxLevel = options.input_headlinesDepth;
  let level = 1;
  keywords = [];
  while (level <= maxLevel) {
    let headlines = document.querySelectorAll(`h${level}`);

    for (const headline of headlines) {
      const words = headline.innerText.split(/[\W_]+/g);
      keywords = await reduceKeywords(words, true);
    }
    if (keywords.length > 0) {
      return Promise.resolve(keywords);
    }
    level++;
  }

  // The functions have found no keywords return an empty array
  return Promise.resolve([]);
}

/* -----------------------------------------------------------------------------------------
Noch nicht bearbeitet:
+ https://tedium.co/2023/04/26/transmeta-crusoe-processor-history/
    <i class="fas fa-tags">
+ https://www.npr.org/2023/04/26/1170522239/tech-job-openings-mass-layoffs-workers-silicon-valley-google-meta-amazon
    <div class="tags">
+ elviovicosa.com/writings/microservices-in-an-early-stage-company-is-a-huge-mistake
  (tags)
+ https://www.sciencedirect.com/science/article/pii/S1053811923001015
     keywords direkt auf Seite
+ https://www.thelocal.se/20230425/spotify-passes-500-million-active-users-as-first-quarter-loss-widens
    jsdonld: keywords, erzeugen aber Fehler
    meta: news_keywords
+ https://www.nature.com/articles/s41416-023-02260-8
    keywords
+ https://www.theregister.com/2023/04/20/google_c4_data_nasty_sources/
    <span class="keyword_name">
+ https://www.scientificamerican.com/article/how-our-team-overturned-the-90-year-old-metaphor-of-a-little-man-in-the-brain-who-controls-movement1/
    <script>dataLayer = [{"con
+ https://www.cbc.ca/news/politics/c11-online-streaming-1.6824314
    gs_keywords

------------------------------------------------------------------


https://arstechnica.com/space/2023/11/after-decades-of-dreams-a-commercial-spaceplane-is-almost-ready-to-fly/
( keywords:
            'Dream Chaser|international space station|NASA|Sierra space|spaceplane',))

-------------------------------------------------------------------------------
https://hexdocs.pm/ecto/Ecto.Changeset.html#module-schemaless-changesets
(jsonld -> description)

+ Trim keywords: Category: entfernen

+ Sehr großes Keyword
https://www.bbc.com/future/article/20231106-the-big-bubble-curtains-protecting-porpoises-from-wind-farm-noise

+ Trim: <p> entfernen

https://www.latimes.com/california/story/2023-10-26/lapd-considering-stronger-body-camera-policy
<div class="tags">
            <a class="link" href="https://www.latimes.com/california"
              >California</a
            >
          </div>


https://townhall.com/columnists/isabellemorales/2023/11/06/congress-has-opportunity-to-stop-the-federal-governments-civil-asset-forfeiture-racket-n2630835
<script id="post-meta" type="application/json">

https://arstechnica.com/tech-policy/2024/01/google-and-att-invest-in-starlink-rival-for-satellite-to-smartphone-service/
-> Google Tag Manager DataLayer

*/
