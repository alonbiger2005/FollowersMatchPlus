'use strict';

// Synthetic Instagram exports in both shapes Instagram ships.

function stamp(d) {
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const h = d.getHours() % 12 || 12;
  return mon + ' ' + String(d.getDate()).padStart(2, '0') + ', ' + d.getFullYear() + ' ' + h + ':' +
    String(d.getMinutes()).padStart(2, '0') + ' ' + (d.getHours() < 12 ? 'am' : 'pm');
}

// rows: [{ u, t: Date|null }]; following links use the /_u/ deep link like the real export.
function html(title, rows, deep) {
  const items = rows.map((r) =>
    '<div class="pam"><div><div><a target="_blank" href="https://www.instagram.com/' + (deep ? '_u/' : '') + r.u + '">' +
    r.u + '</a></div>' + (r.t ? '<div>' + stamp(r.t) + '</div>' : '') + '</div></div>').join('\n');
  return '<html><head><title>' + title + '</title></head><body><main><h1>' + title + '</h1>' + items + '</main></body></html>';
}

function followersJson(rows) {
  return JSON.stringify(rows.map((r) => ({
    title: '', media_list_data: [],
    string_list_data: [Object.assign({ href: 'https://www.instagram.com/' + r.u, value: r.u }, r.t ? { timestamp: Math.floor(r.t / 1000) } : {})]
  })));
}

function followingJson(rows) {
  return JSON.stringify({
    relationships_following: rows.map((r) => ({
      title: r.u,
      string_list_data: [Object.assign({ href: 'https://www.instagram.com/_u/' + r.u }, r.t ? { timestamp: Math.floor(r.t / 1000) } : {})]
    }))
  });
}

const day = (y, m, d) => new Date(y, m - 1, d, 14, 30);
const range = (prefix, n, date) => Array.from({ length: n }, (_, i) => ({ u: prefix + i, t: date ? date(i) : null }));

// Pair A — 30 following, 25 followers (20 of them mutual + 5 fans).
// following − followers = 10. Swapped: 25 − 30 = 5 (the fans).
const followingA = range('acct', 30, (i) => day(2024 + (i % 3), 1 + (i % 12), 1 + i));
const followersA = followingA.slice(0, 20).map((r) => ({ u: r.u, t: day(2023, 6, 1 + (r.u.length)) }))
  .concat(range('fan', 5, (i) => day(2025, 3, 1 + i)));

module.exports = { html, followersJson, followingJson, day, range, followingA, followersA };
