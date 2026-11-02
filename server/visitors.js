// Who's visiting, roughly: a place looked up from the IP address on this machine (nothing is sent
// anywhere) and a device worked out from the browser's user agent. The IP itself is never stored.

import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import maxmind from 'maxmind';

const dbFile = (v) => fileURLToPath(new URL(`../node_modules/@ip-location-db/dbip-city-mmdb/dbip-city-ipv${v}.mmdb`, import.meta.url));

// Location is a nice extra: if the database can't be read, visitors just have no place.
export async function openGeo(log = console.log) {
  try {
    const [v4, v6] = await Promise.all([maxmind.open(dbFile(4)), maxmind.open(dbFile(6))]);
    return (rawIp) => {
      const ip = String(rawIp).replace(/^::ffff:/, '');
      const kind = isIP(ip);
      const hit = kind ? (kind === 4 ? v4 : v6).get(ip) : null;
      return hit ? { city: hit.city || null, region: hit.state1 || null, country: hit.country_code || null } : {};
    };
  } catch (err) {
    log('location database not available:', err.message);
    return () => ({});
  }
}

export function describeDevice(ua) {
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'Phone' : 'Desktop';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg/.test(ua) ? 'Edge' : /OPR|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Other';
  return { device, os, browser };
}

// the site someone came from, without the page or anything else in its address
export function referrerSite(referer, ownHost) {
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '').slice(0, 80);
    return host && host !== String(ownHost).split(':')[0].replace(/^www\./, '') ? host : null;
  } catch {
    return null;
  }
}
