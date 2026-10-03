"""Convert the verified OpenStreetMap snapshots to the data used by this H5.
Usage: python extract-osm.py area.osm river.osm output-directory
The source database and derived geometry are licensed under ODbL.
"""
import xml.etree.ElementTree as E,json,sys,math,pathlib,datetime
area,river,out=sys.argv[1:]; out=pathlib.Path(out);root=E.parse(area).getroot(); nodes={n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in root.findall('node')}; ways=[]
for w in root.findall('way'):
 tags={x.get('k'):x.get('v') for x in w.findall('tag')}; cs=[nodes[x.get('ref')] for x in w.findall('nd') if x.get('ref') in nodes]
 if len(cs)>3:ways.append({'id':w.get('id'),'tags':tags,'coordinates':cs})
def center(cs):
 cs=cs[:-1] if cs[0]==cs[-1] else cs
 return [sum(c[i] for c in cs)/len(cs) for i in range(2)]
def inside(p,poly):
 x,y=p;yes=False
 for a,b in zip(poly,poly[1:]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:yes=not yes
 return yes
names=['东方明珠电视塔','上海中心大厦','上海环球金融中心','金茂大厦'];heights=[468,632,492,420.5]
urls=['https://www.shda.gov.cn/dawh/csjy/202509/t20250919_75918.html','https://www.shanghaitower.com/office.html','https://www.swfc-shanghai.com/up_pdf/1321340644_23490.pdf','https://www.skyscrapercenter.com/building/jin-mao-tower/189']
models=[];light=[];landmarks=[];exclude=[]
for name,height,url in zip(names,heights,urls):
 w=next(w for w in ways if w['tags'].get('name')==name and w['tags'].get('building'));c=center(w['coordinates']);poly=w['coordinates'];landmarks.append({'name':name,'height':height,'center':c,'osmWay':w['id'],'source':url});expanded=[[c[0]+(p[0]-c[0])*1.12,c[1]+(p[1]-c[1])*1.12] for p in poly];exclude.append([expanded]);parts=[p for p in ways if p['tags'].get('building:part') and inside(center(p['coordinates']),expanded)]
 if not parts:parts=[w]
 for p in parts:
  t=p['tags'];h=float(t.get('height',height));b=float(t.get('min_height',0));coords=p['coordinates'];col=t.get('building:colour','')
  day='#c2cdd0' if col=='silver' else '#bc8d95' if col=='#FF0033' else '#93b0bc' if name=='上海中心大厦' else '#b0c4cd';night='#9dbacb' if col=='silver' else '#ef82b5' if col=='#FF0033' else '#467185' if name=='上海中心大厦' else '#688799'
  models.append({'type':'Feature','id':int(p['id']),'properties':{'name':name,'height':h,'base':b,'day':day,'night':night,'osm_way':p['id'],'height_estimated':t.get('note:height')=='estimated'},'geometry':{'type':'Polygon','coordinates':[coords]}})
  if h>35:
   pc=center(coords);inner=[[pc[0]+(xy[0]-pc[0])*.965,pc[1]+(xy[1]-pc[1])*.965] for xy in coords];outer=[[pc[0]+(xy[0]-pc[0])*1.012,pc[1]+(xy[1]-pc[1])*1.012] for xy in coords];ring=[outer,list(reversed(inner))]
   for z in list(range(max(24,int(b)+1),int(h),18))+[h-1]:
    light.append({'type':'Feature','properties':{'base':z,'height':z+1.2,'color':'#f292bb' if 'sphere' in t.get('note','') else '#b9dded' if name=='上海中心大厦' else '#f2c98e'},'geometry':{'type':'Polygon','coordinates':ring}})
r=E.parse(river).getroot();rn={n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in r.findall('node')};rw=r.find('way');rc=[rn[n.get('ref')] for n in rw.findall('nd')];start=min(range(len(rc)),key=lambda i:(rc[i][0]-121.539)**2+(rc[i][1]-31.257)**2);end=min(range(len(rc)),key=lambda i:(rc[i][0]-121.458)**2+(rc[i][1]-31.175)**2);route=rc[min(start,end):max(start,end)+1];route=route[::-1] if start>end else route
meta={'source':'OpenStreetMap','license':'ODbL 1.0','snapshotDate':datetime.date.today().isoformat(),'areaAPI':'https://api.openstreetmap.org/api/0.6/map?bbox=121.490,31.233,121.505,31.244','riverAPI':'https://api.openstreetmap.org/api/0.6/way/47088277/full','coordinateSystem':'WGS84','notes':'Raw OSM building-part outlines and tagged heights; building parts may be estimated. Night illumination is simulated.'}
result={'metadata':meta,'landmarks':landmarks,'exclude':{'type':'Feature','properties':{},'geometry':{'type':'MultiPolygon','coordinates':exclude}},'models':{'type':'FeatureCollection','features':models},'lights':{'type':'FeatureCollection','features':light},'route':{'type':'Feature','properties':{'name':'黄浦江','osm_way':'47088277'},'geometry':{'type':'LineString','coordinates':route}}}
(out/'scene-data.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'landmarks':len(landmarks),'buildingParts':len(models),'simulatedLightBands':len(light),'riverNodes':len(route),'routeEnds':[route[0],route[-1]]}))
