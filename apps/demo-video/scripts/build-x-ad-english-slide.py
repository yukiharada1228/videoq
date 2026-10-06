"""Translate the original math slide with its exact drawing geometry and fonts.

The 15-second ad only shows the first 3.2 seconds of chapter one, which is a
static slide in the original lesson. Player controls and cursor are animated
by the shared ProductScreen and XAd components.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COPY = json.loads((ROOT / 'content/x-ad-en.json').read_text())
FONT = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
slide = Image.new('RGB', (1280, 720), '#f8faf7')
draw = ImageDraw.Draw(slide)
def text(x, y, value, size, color='#203542'):
    font = ImageFont.truetype(FONT, size)
    if x + draw.textlength(value, font=font) > 1210:
        raise ValueError(f'Text exceeds original slide layout: {value}')
    draw.text((x,y), value, font=font, fill=color)
draw.rounded_rectangle((40,38,1240,681), radius=28, fill='white', outline='#dde5e0', width=2)
draw.rounded_rectangle((82,75,192,120), radius=12, fill='#dfe7ff')
text(104,80,COPY['mathSlide']['subject'],26)
text(220,83,COPY['courseName'],25,'#697a80')
text(82,168,COPY['mathSlide']['title'],48)
for j,line in enumerate(COPY['mathSlide']['lines']):
    draw.rounded_rectangle((82,287+j*108,1198,375+j*108),radius=16,fill='#dfe7ff' if j==0 else '#f3f6f7')
    text(112,308+j*108,line,34)
text(84,578,'VideoQ ORIGINAL LESSON    /    01 — 03',22,'#6c7c80')
for j in range(3):
    draw.rounded_rectangle((84+j*372,635,430+j*372,641),radius=3,fill='#3454bd' if j==0 else '#e8edee')
out = ROOT/'public/brand/math-en-poster.webp'
out.parent.mkdir(parents=True,exist_ok=True)
slide.save(out,quality=90)
print(out)
