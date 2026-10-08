"""Deterministic visual-only Q&A fixture; answers stay in local artifacts."""
from pathlib import Path
import json
import math
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 960, 540, 20, 30
FONT = ImageFont.truetype(next(p for p in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] if Path(p).exists()), 132)
COLORS = dict(red='#e52f35', blue='#2467e8', yellow='#ffd52a', green='#159447', purple='#853fce', orange='#ef8620', cyan='#0faabb')

def frame(t):
    im = Image.new('RGB', (W, H), '#f5f3ed')
    d = ImageDraw.Draw(im)
    if t < 5:
        d.polygon([(180, 140), (80, 350), (280, 350)], fill=COLORS['red'])
        d.ellipse((380, 170, 580, 370), fill=COLORS['blue'])
        d.rectangle((680, 170, 880, 370), fill=COLORS['yellow'])
    elif t < 10:
        for x, y in [(150, 165), (370, 165), (590, 165), (810, 165), (260, 375), (480, 375), (700, 375)]:
            d.ellipse((x-60, y-60, x+60, y+60), fill=COLORS['green'])
    elif t < 15:
        x = round(820 - 680 * max(0, min(1, (t-11)/3)))
        d.line((80, 385, 880, 385), fill='#c4c1ba', width=3)
        d.ellipse((x-75, 195, x+75, 345), fill=COLORS['purple'])
    elif t < 17:
        d.rectangle((365, 155, 595, 385), fill=COLORS['orange'])
    elif t < 18.5:
        d.polygon([(480, 120), (340, 390), (620, 390)], fill=COLORS['cyan'])
    elif t < 20:
        points = [(480+math.cos(-math.pi/2+i*math.pi/5)*(145 if i%2==0 else 64),
                   270+math.sin(-math.pi/2+i*math.pi/5)*(145 if i%2==0 else 64)) for i in range(10)]
        d.polygon(points, fill=COLORS['purple'])
    elif t < 25:
        d.rounded_rectangle((130, 120, 830, 420), radius=24, fill='#19324d')
        d.text((480, 270), 'G6T9', font=FONT, fill='white', anchor='mm', stroke_width=1)
    else:
        d.rectangle((0, 0, W, H), fill=COLORS['blue'])
        if 27.2 <= t < 27.6:
            d.rectangle((330, 150, 630, 390), fill=COLORS['red'])
    return im

def main():
    """Generate the held-out variation; this file is never shown to the model."""
    path = ROOT / 'variation.mp4'
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo',
        '-pixel_format', 'rgb24', '-video_size', f'{W}x{H}', '-framerate', str(FPS),
        '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-map_metadata', '-1', '-movflags', '+faststart', str(path)], stdin=subprocess.PIPE)
    for n in range(FPS * DURATION):
        proc.stdin.write(frame(n / FPS).tobytes())
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError('ffmpeg failed')
    print(path)

if __name__ == '__main__':
    main()
