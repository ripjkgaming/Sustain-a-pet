"""Author garden quest markers and blossoms through the installed Blender MCP addon.
Run: python scripts/blender_bridge.py scripts/build_interactives.py
"""
from pathlib import Path
# Reuse the same Blender modelling/material/export helpers as the habitat source.
exec(Path(__file__).with_name('build_worlds.py').read_text().split("for area in ['meadow','pond','grove']:")[0])
M['ivory']=mat('Quest ivory',(.93,.87,.69))
M['red']=mat('Quest coral',(.70,.20,.13))
M['gold']=mat('Quest golden',(.86,.52,.10))
M['complete']=mat('Quest restored',(.27,.55,.22))
for state in ['red','gold','complete']:
 clear()
 cyl('Mushroom stem',(0,.20,0),.115,.40,'ivory',16)
 ell('Mushroom cap',(0,.42,0),(.38,.38,.19),state)
 for x,y,z in [( .12,.57,.18),(-.15,.56,.12),(.02,.59,-.12),(.24,.51,-.06),(-.23,.51,-.10)]:
  ell('Ivory cap spot',(x,y,z),(.043,.043,.024),'ivory')
 if state=='gold':
  bpy.ops.mesh.primitive_torus_add(major_radius=.52,minor_radius=.025,major_segments=40,minor_segments=8,location=(0,0,.03))
  finish(bpy.context.object,'Golden quest ring','gold',(1,1,1))
 export('quest-mushroom-'+state)
for label,color in [('pink',(.86,.32,.44)),('gold',(.93,.64,.16)),('white',(.92,.90,.79)),('violet',(.53,.36,.77)),('coral',(.91,.43,.23))]:
 clear();M['petal']=mat('Petal '+label,color)
 cyl('Living stem',(0,.28,0),.024,.56,'leaf',8)
 ell('Stem leaf',(.08,.22,0),(.14,.045,.055),'leaf').rotation_euler.y=-.4
 for i in range(6):
  a=i*math.tau/6
  petal=ell('Garden petal',(math.cos(a)*.12,.60+math.sin(a)*.12,0),(.095,.040,.095),'petal')
 ell('Golden pollen',(0,.60,.028),(.075,.045,.075),'gold')
 export('garden-flower-'+label)
print('Quest markers and living blossoms authored/exported via Blender MCP.')

clear()
tree(0,0,.85)
for i in range(9):
 a=i*2.399
 ell('Wishing tree amber blossom',(math.cos(a)*.53,1.6+(i%3)*.21,math.sin(a)*.53),(.10,.10,.10),'gold')
for x in [-.6,.6]:ell('Root garden stone',(x,.08,0),(.25,.25,.13),'rock')
export('prop-wishing-tree')
clear()
box('Woven picnic blanket',(0,.025,0),(1.8,.04,1.3),'pink')
for x in [-.6,0,.6]:box('Blanket weave',(x,.05,0),(.08,.015,1.3),'pale')
box('Garden basket',(.35,.24,-.15),(.65,.4,.45),'wood')
for x in [.04,.65]:box('Basket handle side',(x,.55,-.15),(.05,.3,.06),'bark')
box('Basket handle',(.35,.71,-.15),(.66,.06,.06),'bark')
for x,z in [(-.35,.2),(-.5,-.2),(-.25,-.1)]:ell('Harvest fruit',(x,.16,z),(.11,.11,.11),'gold')
export('prop-picnic')
