// Curated recycling sources, chosen by code (never by the model). URLs are well-known organisation home pages.
// Matching is deliberately conservative: an unknown or ambiguous location gets no sources.
const US_STATES = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming']
const US_ABBR = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']

// names: matched as whole words anywhere. abbrs: matched only as the final comma-separated segment, upper case.
export const REGIONS = [
  {
    id: 'us',
    label: 'United States',
    names: ['united states', 'united states of america', 'usa', 'u.s.a.', 'u.s.', 'us', ...US_STATES],
    abbrs: US_ABBR,
    sources: [
      { title: 'EPA: Recycling basics', publisher: 'US Environmental Protection Agency', url: 'https://www.epa.gov/recycle' },
      { title: 'Earth911 recycling guides', publisher: 'Earth911', url: 'https://earth911.com/' },
    ],
  },
  {
    id: 'uk',
    label: 'United Kingdom',
    names: ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland'],
    abbrs: [],
    sources: [
      { title: 'Recycle Now: what can I recycle?', publisher: 'WRAP', url: 'https://www.recyclenow.com/' },
      { title: 'WRAP: recycling and waste', publisher: 'WRAP', url: 'https://wrap.ngo/' },
    ],
  },
  {
    id: 'ca-on',
    label: 'Ontario, Canada',
    names: ['ontario'],
    abbrs: ['ON'],
    sources: [{ title: 'Recycling Council of Ontario', publisher: 'Recycling Council of Ontario', url: 'https://rco.on.ca/' }],
  },
  {
    id: 'ca-bc',
    label: 'British Columbia, Canada',
    names: ['british columbia'],
    abbrs: ['BC'],
    sources: [{ title: 'Recycle BC', publisher: 'Recycle BC', url: 'https://recyclebc.ca/' }],
  },
  {
    id: 'au',
    label: 'Australia',
    names: ['australia', 'new south wales', 'queensland', 'tasmania', 'victoria australia', 'western australia', 'south australia'],
    abbrs: ['NSW', 'QLD', 'TAS', 'ACT'],
    sources: [{ title: 'Recycling Near You', publisher: 'Planet Ark', url: 'https://recyclingnearyou.com.au/' }],
  },
  {
    id: 'ie',
    label: 'Ireland',
    names: ['ireland', 'republic of ireland'],
    abbrs: [],
    sources: [{ title: 'MyWaste.ie', publisher: 'Irish EPA and local authorities', url: 'https://www.mywaste.ie/' }],
  },
]

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const nameRe = (name) => new RegExp(`(?<![a-z])${name.split(' ').map(escapeRe).join('\\s+')}(?![a-z])`, 'i')
const MATCHERS = REGIONS.map((region) => ({ region, regexes: region.names.map(nameRe) }))

function matchedRegions(location) {
  // "New England" is a US region, not the UK nation: strip it so it cannot match England.
  const text = location.replace(/new\s+england/gi, ' ')
  const segments = location.split(',')
  const last = segments[segments.length - 1].trim()
  const found = []
  for (const { region, regexes } of MATCHERS) {
    const byName = regexes.some((re) => re.test(text))
    const byAbbr = segments.length > 1 && region.abbrs.includes(last)
    if (byName || byAbbr) found.push(region)
  }
  return found
}

/** Curated sources for a free-text location, or [] when none or ambiguous. Returns fresh copies. */
export function sourcesForLocation(location) {
  if (typeof location !== 'string' || !location.trim()) return []
  const found = matchedRegions(location.trim().slice(0, 60))
  if (found.length !== 1) return []
  return found[0].sources.map((source) => ({ ...source }))
}

const CURATED_URLS = new Set(REGIONS.flatMap((region) => region.sources.map((source) => source.url)))
export const isCuratedUrl = (url) => typeof url === 'string' && CURATED_URLS.has(url)
