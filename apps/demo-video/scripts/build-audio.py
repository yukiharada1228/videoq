"""Original quiet instrumental bed. No third-party samples or music."""
import math
import json
import subprocess
import wave
from array import array
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'public'/'audio'
OUT.mkdir(parents=True,exist_ok=True)
timeline=json.loads((OUT.parents[1]/'content'/'timeline.json').read_text())
duration=timeline['duration']
rate=22050
data=array('f',[0.0])*(rate*duration)
chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,60]]
def note(start,midi,seconds,volume):
    frequency=440*2**((midi-69)/12)
    for i in range(int(seconds*rate)):
        index=int(start*rate)+i
        if index>=len(data):break
        t=i/rate
        envelope=(1-math.exp(-t*28))*math.exp(-t*1.6)*min(1,(seconds-t)*6)
        data[index]+=volume*envelope*(math.sin(2*math.pi*frequency*t)+.15*math.sin(4*math.pi*frequency*t))
for beat in range(duration*2):
    t=beat*.5
    chord=chords[(beat//8)%4]
    note(t,chord[[0,2,1,3,2,1,3,2][beat%8]]+12,2.2,.09)
    if beat%8==0:note(t,chord[0]-12,4.7,.16)
for t in [timeline[key] for key in ['select','focus','send','sourceClick']]:note(t,90,.09,.055)
pcm=array('h',(int(max(-1,min(1,x))*32767*min(1,i/rate/.5,(duration-i/rate)/1.5)) for i,x in enumerate(data)))
wav=OUT/'ambient.wav'
with wave.open(str(wav),'w') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-b:a','96k',str(OUT/'ambient.mp3')],check=True)
wav.unlink()
