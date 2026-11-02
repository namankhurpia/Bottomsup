// Prints the private link to the /stats page. On the server:
//   DATA_DIR=/var/lib/toot-raft npm run -s stats-link
import { openDb } from '../server/db.js';

const db = openDb(process.env.DATA_DIR || './data');
console.log(`${(process.env.SITE_URL || 'https://bottomsup.tech').replace(/\/$/, '')}/stats#key=${db.statsKey}`);
db.close();
