#!/usr/bin/env python3
"""
Reads Finder color tags from venue image folders and updates
the venueData photo lists in tickets.html.

Tag convention:
  Red    → include in venue (all venue folders)
  Orange → include in Dormitory (Bhakti Kutir folder only, to split from Bhakti)

Usage:
  python3 update_venue_photos.py
"""

import subprocess
import re
import os

BASE = os.path.dirname(os.path.abspath(__file__))

VENUE_FOLDERS = {
    'bhakti':    ('Stay Page Images/Bhakti Kutir', ['Red']),
    'destiny':   ('Stay Page Images/Destiny', ['Red']),
    'lalaland':  ('Stay Page Images/Lala Land', ['Red']),
    'ourem':     ('Stay Page Images/Ourem Palace 2', ['Red']),
    'teraria':   ('Stay Page Images/Teraria', ['Red']),
    'dormitory': ('Stay Page Images/Bhakti Kutir', ['Orange']),
}

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'}

def get_finder_tags(filepath):
    """Return list of Finder tag names for a file."""
    try:
        result = subprocess.run(
            ['mdls', '-name', 'kMDItemUserTags', filepath],
            capture_output=True, text=True
        )
        output = result.stdout.strip()
        if '(null)' in output or not output:
            return []
        # Tags may be quoted ("Red") or bare (Red)
        tags = re.findall(r'"([^"]+)"', output) or re.findall(r'=\s*\(\s*([\w ]+?)\s*\)', output, re.DOTALL) or [t.strip() for t in re.findall(r'^\s+(\w[\w ]*\w|\w+)\s*$', output, re.MULTILINE)]
        return tags
    except Exception:
        return []

def get_tagged_photos(folder_rel, accepted_tags):
    folder = os.path.join(BASE, folder_rel)
    if not os.path.isdir(folder):
        print(f'  ⚠️  Folder not found: {folder_rel}')
        return []

    photos = []
    for fname in sorted(os.listdir(folder)):
        ext = os.path.splitext(fname)[1]
        if ext not in IMAGE_EXTS:
            continue
        fpath = os.path.join(folder, fname)
        tags = get_finder_tags(fpath)
        if any(t in accepted_tags for t in tags):
            # Use forward slashes, relative to the HTML file
            photos.append(f'{folder_rel}/{fname}')

    return photos

def photos_to_js(photos):
    lines = [f"      '{p}'," for p in photos]
    return '\n'.join(lines)

def update_tickets_html(venue_photos):
    html_path = os.path.join(BASE, 'tickets.html')
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for venue_key, photos in venue_photos.items():
        if not photos:
            print(f'  ⚠️  No tagged photos found for {venue_key}, skipping.')
            continue

        # Match the photos array for this venue key
        pattern = re.compile(
            r"(  " + re.escape(venue_key) + r""": \{.*?photos: \[)[^\]]*(\])""",
            re.DOTALL
        )
        replacement = r'\g<1>\n' + photos_to_js(photos) + r'\n    \g<2>'
        new_content, count = re.subn(pattern, replacement, content)
        if count == 0:
            print(f'  ⚠️  Could not find venueData entry for: {venue_key}')
        else:
            content = new_content
            print(f'  ✅  {venue_key}: {len(photos)} photo(s)')

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print('\nDone — tickets.html updated.')

if __name__ == '__main__':
    print('Scanning Finder tags...\n')
    venue_photos = {}
    for key, (folder, tags) in VENUE_FOLDERS.items():
        photos = get_tagged_photos(folder, tags)
        venue_photos[key] = photos

    update_tickets_html(venue_photos)
