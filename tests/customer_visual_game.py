"""Render baby dolphin customers from three sides, in-game and with failed model loads."""
import argparse
import functools
import http.server
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get('MY_GAME_ROOT', Path(__file__).resolve().parents[1]))
HOOK = r'''
window.dolphinTest = {
  inspect() {
    const first=mkChar('customer',{ph:.1}), second=mkChar('customer',{ph:.5});
    const meshes=[];first.root.traverse(m=>{if(m.isMesh)meshes.push(m);});
    const box=new THREE.Box3().setFromObject(first.root),size=box.getSize(new THREE.Vector3());
    return {style:first.root.userData.customerStyle,gl:!!first.gl,ready:GL.ready,
      meshes:meshes.length,shared:first.body.children[0].geometry===second.body.children[0].geometry,
      width:size.x,height:size.y,depth:size.z,gear:!!first.carry&&!first.rifle.visible,
      materials:dolphinCustomerAssets().staticParts.map(p=>p.material.color.getHex())};
  },
  gallery() {
    const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    r.outputEncoding=THREE.sRGBEncoding;r.setPixelRatio(1);r.setSize(1080,480);r.shadowMap.enabled=true;
    r.domElement.id='dolphinPreview';Object.assign(r.domElement.style,{position:'fixed',inset:'0',zIndex:'1000',width:'1080px',height:'480px'});document.body.appendChild(r.domElement);
    const s=new THREE.Scene();s.background=new THREE.Color(0x36c3ec);
    s.add(new THREE.HemisphereLight(0xe8faff,0x6d9bb1,1.0));
    const light=new THREE.DirectionalLight(0xfffbef,1.1);light.position.set(-3,6,5);light.castShadow=true;
    light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5});s.add(light);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x31b9df,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.035;floor.receiveShadow=true;s.add(floor);
    const views=[];
    for(const [i,angle] of [0,Math.PI/2,Math.PI].entries()) {
      const m=mkChar('customer',{ph:.5});m.root.position.set((i-1)*2.3,0,0);m.root.rotation.y=angle;s.add(m.root);views.push(m);
    }
    const cam=new THREE.OrthographicCamera(-3.8,3.8,1.69,-1.69,.1,50);cam.position.set(0,2,10);cam.lookAt(0,1.12,0);r.render(s,cam);
    return views.map(m=>m.root.userData.customerStyle);
  },
  fixture() {
    build(freshState());paused=true;
    for(const id of ['expand1','tent1','grill','diner','water','waterShop'])if(!unlocked.has(id)){unlocked.add(id);applyUnlock(id);}
    for(const id of STATION_IDS)if(DEFS[id].type==='shop'&&unlocked.has(id)){
      syncCustomerRoutes(id);runtime[id].spawn=10000;const d=DEFS[id];
      runtime[id].queue=Array.from({length:3},(_,i)=>({...slotPos(d,i),vx:0,vy:0,bob:0,ph:i*.3,alpha:1,want:2,got:0,carry:[],aimYaw:Math.atan2(-d.dir[0],-d.dir[1])}));
      runtime[id].leaving=[{...slotPos(d,5),vx:0,vy:0,bob:0,ph:.6,alpha:1,want:2,got:2,carry:[d.item,d.item],aimYaw:Math.atan2(d.dir[0],d.dir[1])}];
    }
    const view=slotPos(DEFS.waterShop,2);player.x=view.x-1.5;player.y=view.y;cameraFocus.set(view.x-.4,.3,view.y-.4);for(let i=0;i<20;i++)sync3D(.016);render(.016);hud(objective());
    const clients=STATION_IDS.filter(id=>DEFS[id].type==='shop'&&unlocked.has(id)).flatMap(id=>runtime[id].queue.concat(runtime[id].leaving));
    return clients.map(c=>{const m=models.get(c);return {dolphin:!!m.dolphin,style:m.root.userData.customerStyle,carry:m.carry.children.length,wanted:c.carry.length,scale:m.carry.scale.x,y:m.carry.position.y};});
  },
  walk() {
    const c={x:2,y:3,vx:1,vy:.5,ph:.4,carry:[]},m=mkChar('customer',c);
    for(let i=0;i<20;i++)animChar(m,c,.05);
    const before={tail:m.tail.rotation.x,arm:m.arms[0].rotation.x,leg:m.legs[0].rotation.x};
    c.carry=['water'];animChar(m,c,.05);syncStack(m.carry,c.carry);
    return {before,holding:m.arms[0].rotation.x,carry:m.carry.children.length,finite:m.root.position.toArray().concat(m.root.rotation.toArray().slice(0,3)).every(Number.isFinite)};
  },
  get ready(){return GL.ready;}
};
'''

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots',type=Path,default=Path('/tmp/my-game-dolphin-customers'))
    args=parser.parse_args();args.screenshots.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    source=(ROOT/'raft-village-3d.html').read_text().replace('})();\n</script>',HOOK+'})();\n</script>')
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            for block_models in [True,False]:
                page=browser.new_page(viewport={'width':1080,'height':660});errors=[]
                page.add_init_script('requestAnimationFrame=()=>0')
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('https://**',lambda r:r.abort())
                if block_models:page.route('**/models/*.json',lambda r:r.abort())
                page.route('**/raft-village-3d.html',lambda r:r.fulfill(body=source,content_type='text/html'))
                page.goto(f'http://127.0.0.1:{server.server_port}/raft-village-3d.html',wait_until='networkidle')
                page.wait_for_function('!!window.dolphinTest')
                if not block_models:page.wait_for_function('dolphinTest.ready')
                result=page.evaluate('dolphinTest.inspect()')
                assert result['style']=='baby-dolphin' and not result['gl'] and result['gear'] and result['shared'],result
                assert result['meshes']<=12 and 1.2<result['height']<1.67 and result['width']>2/3,result
                assert 0xffd74e in result['materials'] and 0xff9fbe in result['materials'],result
                walking=page.evaluate('dolphinTest.walk()')
                assert walking['finite'] and walking['carry']==1 and walking['holding']==-.75,walking
                assert abs(walking['before']['arm'])>.01 and abs(walking['before']['leg'])>.01,walking
                clients=page.evaluate('dolphinTest.fixture()')
                assert clients and all(c['dolphin'] and c['carry']==c['wanted'] and c['scale']==.33 and c['y']<1 for c in clients),clients
                page.screenshot(path=str(args.screenshots/('in-game-fallback.png' if block_models else 'in-game.png')))
                if not block_models:
                    assert page.evaluate('dolphinTest.gallery()')==['baby-dolphin']*3
                    page.locator('#dolphinPreview').screenshot(path=str(args.screenshots/'front-side-back.png'))
                assert not errors,errors
                print('PASS baby dolphin shared 3D model, animated flippers/tail/feet, held purchases, in-game render; models '+('blocked' if block_models else 'loaded'),flush=True)
                page.close()
            browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
    print('Screenshots:',args.screenshots)

if __name__=='__main__':main()
