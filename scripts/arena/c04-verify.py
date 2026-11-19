"""Verify delivered files without a database. Set FFPROBE_PATH and FFMPEG_PATH."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import zipfile

root = Path('docs/delivery/media/C04')
sizes = {'square': (1080, 1080), 'portrait': (1080, 1350), 'carousel': (1080, 1350), 'story': (1080, 1920)}
with zipfile.ZipFile(root / 'campaign.zip') as archive:
    rows = json.loads(archive.read('manifest.json'))
    assert len(rows) == 7 and len(archive.namelist()) == 8
    assert len({r['delivery']['calendar']['itemId'] for r in rows}) == 1
    assert {r['delivery']['platform'] for r in rows} == {'LinkedIn', 'Instagram'}
    for row in rows:
        b = archive.read(row['name'])
        assert hashlib.sha256(b).hexdigest() == row['sha256']
        kind = row['delivery']['kind']
        if kind == 'short':
            file = root / 'short.mp4'
        else:
            assert b[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', b[16:24]) == sizes[kind]
            suffix = '-' + str(int(row['name'][-7:-4])) if kind == 'carousel' else ''
            file = root / (kind + suffix + '.png')
        assert b == file.read_bytes()
video = str(root / 'short.mp4')
probe = json.loads(subprocess.check_output([os.environ['FFPROBE_PATH'], '-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]))
v, a = probe['streams']
assert (v['width'], v['height'], v['codec_name'], a['codec_name']) == (1080, 1920, 'h264', 'aac')
assert float(probe['format']['duration']) == 8
ff = [os.environ['FFMPEG_PATH'], '-loglevel', 'error']
# Inside the opening shot, away from fades: prove visible movement and a non-silent track.
def frame(t):
    return subprocess.check_output(ff + ['-ss', t, '-i', video, '-frames:v', '1', '-vf', 'crop=640:640:200:320,scale=80:80', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'])
p, q = frame('0.3'), frame('1.6')
assert sum(abs(x-y) for x, y in zip(p, q)) / len(p) > 1
pcm = subprocess.check_output(ff + ['-i', video, '-vn', '-f', 's16le', '-'])
assert max(x[0] for x in struct.iter_unpack('<h', pcm)) > 100
print('PASS: seven checksummed exports; two channels, one calendar item; moving H.264 + audible AAC.')
