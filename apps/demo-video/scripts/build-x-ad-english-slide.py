"""Translate the visible lesson slides with their original geometry and fonts.

The LP and ad show less than 8 seconds of the math lesson's first chapter.
That chapter is a static slide for at least 20 seconds in the original lesson.
The LP also starts on the first writing slide before selecting mathematics.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COPY = json.loads((ROOT / 'content/x-ad-en.json').read_text())
FONT = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
def text(draw, x, y, value, size, color='#203542'):
    font = ImageFont.truetype(FONT, size)
    if x + draw.textlength(value, font=font) > 1210:
        raise ValueError(f'Text exceeds original slide layout: {value}')
    draw.text((x,y), value, font=font, fill=color)
for key, color in [('writing', '#d9e7df'), ('math', '#dfe7ff')]:
    copy = COPY[key + 'Slide']
    slide = Image.new('RGB', (1280, 720), '#f8faf7')
    draw = ImageDraw.Draw(slide)
    draw.rounded_rectangle((40,38,1240,681), radius=28, fill='white', outline='#dde5e0', width=2)
    draw.rounded_rectangle((82,75,192,120), radius=12, fill=color)
    text(draw,104,80,copy['subject'],26)
    text(draw,220,83,COPY['courseName'],25,'#697a80')
    text(draw,82,168,copy['title'],48)
    for j,line in enumerate(copy['lines']):
        draw.rounded_rectangle((82,287+j*108,1198,375+j*108),radius=16,fill=color if j==0 else '#f3f6f7')
        text(draw,112,308+j*108,line,34)
    text(draw,84,578,'VideoQ ORIGINAL LESSON    /    01 — 03',22,'#6c7c80')
    for j in range(3):
        draw.rounded_rectangle((84+j*372,635,430+j*372,641),radius=3,fill='#3454bd' if j==0 else '#e8edee')
    out = ROOT/f'public/brand/{key}-en-poster.webp'
    out.parent.mkdir(parents=True,exist_ok=True)
    slide.save(out,quality=90)
    print(out)
