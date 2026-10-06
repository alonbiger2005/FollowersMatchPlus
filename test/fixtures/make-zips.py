"""Regenerates the .zip fixtures used by test/page.test.js:  python3 test/fixtures/make-zips.py

Dataset (matches "pair A" in test/helpers/fixtures.js): 30 accounts followed,
25 followers (20 mutual + 5 fans) split across two followers files.
Expected tally: You follow 30 · Follow you 25 · Mutual 20 · One-way 10.
"""
import io, json, os, random, zipfile
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = 'connections/followers_and_following/'

following = [('acct%d' % i, datetime(2024 + i % 3, 1 + i % 12, 1 + i, 14, 30)) for i in range(30)]
followers = [(u, datetime(2023, 6, 1 + len(u), 14, 30)) for u, _ in following[:20]] + \
            [('fan%d' % i, datetime(2025, 3, 1 + i, 14, 30)) for i in range(5)]

def stamp(d):
    return d.strftime('%b %d, %Y ') + str(d.hour % 12 or 12) + d.strftime(':%M ') + ('am' if d.hour < 12 else 'pm')

def html(title, rows, deep=False):
    items = ''.join('<div class="pam"><div><div><a target="_blank" href="https://www.instagram.com/%s%s">%s</a></div><div>%s</div></div></div>\n'
                    % ('_u/' if deep else '', u, u, stamp(t)) for u, t in rows)
    return '<html><head><title>%s</title></head><body><main><h1>%s</h1>%s</main></body></html>' % (title, title, items)

def fjson(rows):
    return json.dumps([{'title': '', 'media_list_data': [], 'string_list_data':
        [{'href': 'https://www.instagram.com/' + u, 'value': u, 'timestamp': int(t.timestamp())}]} for u, t in rows])

def gjson(rows):
    return json.dumps({'relationships_following': [{'title': u, 'string_list_data':
        [{'href': 'https://www.instagram.com/_u/' + u, 'timestamp': int(t.timestamp())}]} for u, t in rows]})

noise = {
    DIR + 'recently_unfollowed_profiles.html': html('Recently unfollowed profiles', [('gone1', datetime(2026, 1, 1))]),
    DIR + 'close_friends.html': html('Close friends', [('acct1', datetime(2026, 1, 1))]),
    DIR + 'following_hashtags.html': '<html><body>#travel</body></html>',
    'personal_information/personal_information/personal_information.html': '<html><body>Name</body></html>',
    '__MACOSX/' + DIR + '._followers_1.html': 'mac resource fork',
}
random.seed(7)
photo = bytes(random.getrandbits(8) for _ in range(20000))

def build(name, files, method, streamed=False):
    buf = io.BytesIO()
    class Unseekable:  # forces data descriptors, like phone/streaming zippers
        def write(self, b): return buf.write(b)
        def flush(self): pass
    target = Unseekable() if streamed else buf
    with zipfile.ZipFile(target, 'w', compression=method) as z:
        for path, data in files.items():
            z.writestr(path, data)
        z.writestr('media/posts/202601/photo.jpg', photo)
    open(os.path.join(HERE, name), 'wb').write(buf.getvalue())

html_set = dict(noise)
html_set[DIR + 'followers_1.html'] = html('Followers', followers[:15])
html_set[DIR + 'followers_2.html'] = html('Followers', followers[15:])
html_set[DIR + 'following.html'] = html('Following', following, True)
build('instagram-html.zip', html_set, zipfile.ZIP_DEFLATED)
build('instagram-streamed.zip', html_set, zipfile.ZIP_DEFLATED, streamed=True)

root = 'instagram-demo-2026-10-06/'
build('instagram-json-stored.zip', {
    root + DIR + 'followers_1.json': fjson(followers),
    root + DIR + 'following.json': gjson(following),
    root + DIR + 'recently_unfollowed_profiles.json': '{"relationships_unfollowed_users": []}',
}, zipfile.ZIP_STORED)

build('instagram-no-lists.zip', {'personal_information/personal_information/personal_information.html': '<html></html>'}, zipfile.ZIP_DEFLATED)
open(os.path.join(HERE, 'not-really.zip'), 'w').write('<html>this is not an archive</html>')
