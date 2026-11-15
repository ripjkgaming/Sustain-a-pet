"""Build editable HyperFrames scenes from verified UI capture and rendered supplied phone.
Run after capture: python3 scripts/build_film.py [captures/<timestamp>]
The source ranges and speed adjustment of each real recording are retained in shots.json.
"""
import json
import subprocess
import sys
from pathlib import Path
from html import escape
ROOT=Path(__file__).resolve().parents[1]
if len(sys.argv)>1:
    capture=Path(sys.argv[1]).resolve()
else:
    capture=Path(json.loads((ROOT/'captures/latest.json').read_text())['directory'])
evidence=json.loads((capture/'evidence.json').read_text())
events={event['name']:event for event in evidence['events']}
if 'restored-grove-result' not in events:
    raise SystemExit('Capture incomplete: do not build delivery from partial gameplay.')
source=capture/'gameplay-source.webm'
(ROOT/'assets/gameplay').mkdir(exist_ok=True)
(ROOT/'compositions').mkdir(exist_ok=True)
# id, seconds, source-first, source-last, layout, title, focus-y, simulated-days
shots=[
 ('opening',8,'garden-establish','garden-establish','phone','Small habits.\nA living garden.',0,False),
 ('daily-gift',9,'daily-gift','daily-gift','detail','Collect your daily gift.',620,False),
 ('garden-walk',7,'walk-to-quest','walk-to-quest','portrait','Follow a\nmushroom.',0,False),
 ('first-habit',9,'first-habit','first-habit','detail','One real habit at a time.',790,False),
 ('habit-rewards',9,'complete-day-one','complete-day-one','detail','Habits earn coins & leaves.',700,False),
 ('garden-shop',8,'shop-wildflowers','shop-wildflowers','detail','Make the garden yours.',680,False),
 ('new-friend',6,'adopt-mossy','adopt-mossy','detail','A growing family.',630,False),
 ('mossy',8,'switch-to-mossy','mossy-in-garden','portrait','Meet\nMossy.',0,False),
 ('meadow-restored',8,'restore-meadow','restored-meadow-result','portrait','Restore the\nmeadow.',0,False),
 ('next-day',8,'simulated-day-two','day-two-gift','detail','A new day. More to grow.',600,True),
 ('willow-pond',8,'unlock-pond','pond-exploration','portrait','Willow\nPond.',0,True),
 ('footbridge',9,'restore-bridge','restored-pond-result','portrait','Mend the\nfootbridge.',0,True),
 ('amber-grove',8,'unlock-grove','grove-exploration','portrait','Amber\nGrove.',0,True),
 ('wishing-tree',7,'restore-tree','restored-grove-result','portrait','Nurture a\nwishing tree.',0,True),
 ('closing',8,'restored-grove-result','restored-grove-result','phone','Grow greener,\ntogether.',0,True),
]
assert sum(s[1] for s in shots)==120
manifest=[]
start=0
for ident,duration,first,last,layout,title,focus,simulated in shots:
    source_start=max(0,events[first]['start']-.25)
    source_end=events[last]['end']
    length=source_end-source_start
    target=ROOT/f'assets/gameplay/{ident}.mp4'
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(source_start),'-t',str(length),'-i',str(source),'-an','-vf',f'setpts={duration/length:.9f}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=1,fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2','-t',str(duration),'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
    subprocess.run(cmd,check=True)
    disclosure='Demo mode · simulated days' if simulated else 'Recorded gameplay · practice garden'
    text=escape(title).replace('\n','<br>')
    if layout=='phone':
        picture=f'''<div id="phone-stage" class="visual-stage" data-layout-allow-overlap>
          <img id="rear-model" src="assets/phone/phone-rear.png" alt="Supplied phone model, rear studio render">
          <div id="front-model"><img src="assets/phone/phone-front.png" alt="Supplied phone model, front studio render">
            <div id="display-mask"><video id="{ident}-footage" class="clip" data-start="0" data-duration="{duration}" data-track-index="1" src="assets/gameplay/{ident}.mp4" muted playsinline></video></div>
          </div></div>'''
        picture_style='''#phone-stage{position:absolute;left:790px;top:0;width:1030px;height:1080px}#rear-model{position:absolute;left:0;top:60px;width:500px;height:1000px;object-fit:contain}#front-model{position:absolute;left:420px;top:0;width:540px;height:1080px}#front-model>img{position:absolute;inset:0;width:540px;height:1080px}#display-mask{position:absolute;left:55.46px;top:77.32px;width:429.08px;height:925.36px;border-radius:58px;overflow:hidden}#display-mask video{position:absolute;left:0;top:0;width:429.08px;height:925.36px;object-fit:fill}'''
        title_style='#copy{left:155px;top:330px;width:670px}h1{font-size:82px;line-height:1.08}.brand{font-size:35px;margin-bottom:28px}'
        brand='<p class="brand" data-var-text="brand">Sustain-a-Pet</p>'
    elif layout=='detail':
        picture=f'''<div id="detail-lens" class="visual-stage" data-layout-allow-overflow><video id="{ident}-footage" class="clip" data-start="0" data-duration="{duration}" data-track-index="1" src="assets/gameplay/{ident}.mp4" muted playsinline></video></div>'''
        picture_style=f'''#detail-lens{{position:absolute;left:228px;top:240px;width:1464px;height:716px;overflow:hidden;border-radius:20px}}#detail-lens video{{position:absolute;left:0;top:{-focus*2.3}px;width:1462.8px;height:3155.6px;object-fit:fill}}'''
        title_style='#copy{left:228px;top:118px;width:1480px}h1{font-size:64px;line-height:1.1}'
        brand=''
    else:
        picture=f'''<div id="portrait-lens" class="visual-stage"><video id="{ident}-footage" class="clip" data-start="0" data-duration="{duration}" data-track-index="1" src="assets/gameplay/{ident}.mp4" muted playsinline></video></div>'''
        picture_style='''#portrait-lens{position:absolute;left:870px;top:120px;width:860px;height:870px;overflow:hidden;border-radius:24px}#portrait-lens video{position:absolute;left:0;top:-540px;width:858.6px;height:1850.9px;object-fit:fill}'''
        title_style='#copy{left:155px;top:350px;width:650px}h1{font-size:80px;line-height:1.08}'
        brand=''
    html=f'''<template>
<style>
#root{{position:absolute;inset:0;color:#203f30;font-family:Inter,sans-serif}}
#scene-ground{{position:absolute;inset:0;background:#e1ebd7}}
#copy{{position:absolute;z-index:3}}#{ident}-copy-clip{{position:absolute;inset:0}}h1{{white-space:pre-line;margin:0;font-family:Nunito,sans-serif;font-weight:700;letter-spacing:-.035em}}.brand{{font-weight:700;margin-top:0;letter-spacing:-.03em}}
#disclosure{{position:absolute;left:228px;bottom:36px;font-size:29px;line-height:1.2;color:#36513f;margin:0;z-index:5}}
{title_style}{picture_style}
</style>
<div id="root" data-composition-id="{ident}" data-width="1920" data-height="1080">
 <div id="scene-ground"></div>
 {picture}
 <div id="{ident}-copy-clip" class="clip" data-start="0" data-duration="{duration}" data-track-index="2" data-track-kind="graphics"><div id="copy">{brand}<h1 data-var-text="{ident}-title">{text}</h1></div></div>
 <p id="disclosure" class="clip" data-start="0" data-duration="{duration}" data-track-index="3" data-hold>{disclosure}</p>
</div>
<script>
const tl=gsap.timeline({{paused:true}});
tl.fromTo('#copy',{{opacity:0}},{{opacity:1,duration:.22,ease:'power4.out'}},0);
tl.fromTo('.visual-stage',{{x:38}},{{x:0,duration:.6,ease:'power3.out'}},0);
{'tl.fromTo("#rear-model",{x:32},{x:0,duration:1.2,ease:"power3.out"},0);' if layout=='phone' else ''}
window.__timelines['{ident}']=tl;
</script>
</template>'''
    (ROOT/f'compositions/{ident}.html').write_text(html)
    manifest.append({'id':ident,'start':start,'duration':duration,'frame_start':start*30,'frame_end_exclusive':(start+duration)*30,'source_first':first,'source_last':last,'source_start':source_start,'source_end':source_end,'source_playback_rate':length/duration,'layout':layout,'focus_y':focus,'simulated_days':simulated,'title':title})
    start+=duration
hosts='\n'.join(f'<div id="{s["id"]}" class="clip" data-composition-id="{s["id"]}" data-composition-src="compositions/{s["id"]}.html" data-start="{s["start"]}" data-duration="{s["duration"]}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>' for s in manifest)
variables=[{'id':'brand','type':'string','label':'Brand','default':'Sustain-a-Pet'}]+[{'id':s['id']+'-title','type':'string','label':s['id']+' title','default':s['title']} for s in manifest]
index=f'''<!doctype html><html lang="en" data-composition-variables='{escape(json.dumps(variables),quote=True)}'><head><meta charset="utf-8"><meta name="viewport" content="width=1920,height=1080"><title>Sustain-a-Pet — actual gameplay demo</title><script src="lib/gsap.min.js"></script><style>*{{box-sizing:border-box}}html,body{{margin:0;width:1920px;height:1080px;overflow:hidden;background:#e1ebd7}}#root{{position:relative;width:1920px;height:1080px}}.clip{{position:absolute}}[data-composition-src]{{inset:0}}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="120" data-width="1920" data-height="1080" data-fps="30">{hosts}
<audio id="leaf-walk" data-start="17.1" data-duration="4.5" data-media-start="0" data-track-index="4" src="assets/audio/autumn-leaf-steps.m4a" data-volume="0.32" data-fade-in="0.1" data-fade-out="0.4"></audio>
<audio id="pond-walk" data-start="84" data-duration="3.5" data-media-start="5" data-track-index="4" src="assets/audio/autumn-leaf-steps.m4a" data-volume="0.25" data-fade-in="0.1" data-fade-out="0.4"></audio>
<audio id="grove-walk" data-start="101" data-duration="3.5" data-media-start="9" data-track-index="4" src="assets/audio/autumn-leaf-steps.m4a" data-volume="0.25" data-fade-in="0.1" data-fade-out="0.4"></audio>
</div><script>window.__timelines=window.__timelines||{{}};window.__timelines.main=gsap.timeline({{paused:true}});</script></body></html>'''
(ROOT/'index.html').write_text(index)
(ROOT/'shots.json').write_text(json.dumps({'duration':120,'fps':30,'frames':3600,'capture_directory':str(capture),'source':str(source),'shots':manifest},indent=2)+'\n')
(ROOT/'reports/verified-gameplay.json').write_text(json.dumps(evidence,indent=2)+'\n')
print('Built 15 editable scenes / 120 seconds / 3600 frames from actual gameplay.')
