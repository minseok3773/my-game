"""Measure the two-thirds character resize, including gear, cache reuse and reloads."""
import functools
import http.server
import math
import os
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get('MY_GAME_ROOT', Path(__file__).resolve().parents[1]))
HOOK = r'''
const characterSize = root => new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray();
window.characterScaleTest = {
  get ready() { return GL.ready; },
  designs() {
    return ['player','worker','boarder','champion','customer'].map(label => {
      const kind=label==='champion'?'boarder':label, ent={x:3,y:4,ph:.3,champion:label==='champion',carry:[]};
      const original=makeCharacterModel(kind,ent), resized=mkChar(kind,ent);
      for(const m of [original,resized]) {
        syncStack(m.carry,['fish','water','grilled']);
        if(m.sword)m.sword.visible=true;
      }
      const base=characterSize(original.root), size=characterSize(resized.root);
      const gear={};
      for(const name of ['carry','sword','rifle'])if(original[name]?.parent&&resized[name]?.parent)
        gear[name]={base:characterSize(original[name]),size:characterSize(resized[name])};
      for(let i=0;i<50;i++)applyCharacterScale(resized);
      const repeated=characterSize(resized.root);
      animChar(resized,ent,.016);
      return {label,base,size,gear,repeated,position:resized.root.position.toArray(),
        originalScale:original.root.scale.toArray(),scale:resized.root.scale.toArray()};
    });
  },
  ships() {
    return [[false,false],[true,false],[true,true]].map(([big,boss])=>{
      const ship=makeShip3(big,boss),crew=ship.children.filter(c=>scaledCharacterRoots.has(c));
      const result={big,boss,shipScale:ship.scale.x,hullScale:ship.children[0].scale.toArray(),crew:crew.map((root,i)=>{
        const original=makeSkelCrew(i===0?1:2);original.scale.setScalar([.55,.5,.75][i]);
        // The captain's crown is part of the character and follows its resize.
        if(boss&&i===2)for(const child of root.children.slice(original.children.length))original.add(child.clone());
        const savedParent=root.parent; savedParent.remove(root);
        const size=characterSize(root),base=characterSize(original);savedParent.add(root);
        return {base,size};
      })};scene.remove(ship);return result;
    });
  },
  fixture() {
    const data=freshState();data.unlocked.push('expand1','tent1','base');data.soldiers=2;
    data.stack=['fish','water'];build(data);paused=true;
    for(const w of workers){w.carry=['fish','water'];w.vx=w.vy=0;}
    sync3D(0);save();return this.snapshot();
  },
  snapshot() {
    sync3D(0);
    return [['player',player],...workers.map((e,i)=>['worker'+i,e]),...soldiers.map((e,i)=>['navy'+i,e])].map(([label,e])=>{
      const m=models.get(e);return {label,size:characterSize(m.root),scale:m.root.scale.toArray(),
        position:m.root.position.toArray(),entity:[e.x,e.y],gear:m.carry.children.length};
    });
  },
  navy() {
    const s=soldiers[0],resized=models.get(s);
    const original=attachCharacterGear(makeKid3(SOLDIER_LOOKS[(s.ph*10|0)%SOLDIER_LOOKS.length]));
    original.melee=true;original.rifle.visible=false;
    original.arms[1].add(original.sword);original.sword.position.set(0,-.42,.06);
    original.ph=resized.ph;original.phase=resized.phase;
    animChar(original,s,0,{fighting:!!s.fighting});
    return {base:characterSize(original.root),size:characterSize(resized.root)};
  },
  cacheAndFallen() {
    const customer={x:1,y:1,ph:.2,vx:0,vy:0,alpha:1,carry:['fish']};runtime.fishShop.queue.push(customer);
    const boarder={kind:'boarder',x:2,y:2,ph:.4,hp:20,max:20,state:'walk',vx:0,vy:0};
    const boss={...boarder,x:3,champion:true,hp:100,max:100};enemies.push(boarder,boss);
    const worker=workers[0],navy=soldiers[0];sync3D(0);killCrew(worker);killSoldier(navy);
    sync3D(0);
    const entries=[['player',player],['worker',workers[0]],['navy',soldiers[0]],['fallen worker',worker],['fallen navy',navy],['customer',customer],['boarder',boarder],['champion',boss]];
    const before=entries.map(([label,e])=>({label,model:models.get(e),size:characterSize(models.get(e).root),scale:models.get(e).root.scale.toArray()}));
    for(let i=0;i<150;i++)sync3D(0);
    const after=before.map((b,i)=>({label:b.label,before:b.size,after:characterSize(models.get(entries[i][1]).root),
      scaleBefore:b.scale,scaleAfter:models.get(entries[i][1]).root.scale.toArray(),same:models.get(entries[i][1])===b.model}));
    render(0);hud(objective());return after;
  }
};
'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def close_arrays(actual, expected, *, rel_tol=1e-6):
    return all(math.isclose(a, b, rel_tol=rel_tol, abs_tol=1e-6) for a, b in zip(actual, expected))


def assert_resized(measurement):
    assert all(value > 0 for value in measurement['base']), measurement
    assert close_arrays(measurement['size'], [value * 2 / 3 for value in measurement['base']]), measurement


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    source = (ROOT / 'raft-village-3d.html').read_text().replace('})();\n</script>', HOOK + '})();\n</script>')
    screenshot_dir = Path('/tmp/my-game-character-scale')
    screenshot_dir.mkdir(exist_ok=True)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for blocked in [True, False]:
                page = browser.new_page(viewport={'width': 1100, 'height': 760})
                page.add_init_script('requestAnimationFrame=()=>0')
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**', lambda route: route.abort())
                if blocked:
                    page.route('**/models/*.json', lambda route: route.abort())
                page.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))
                page.goto(f'http://127.0.0.1:{server.server_port}/raft-village-3d.html', wait_until='networkidle')
                page.wait_for_function('!!window.characterScaleTest')
                if not blocked:
                    page.wait_for_function('characterScaleTest.ready')
                for design in page.evaluate('characterScaleTest.designs()'):
                    assert_resized(design)
                    assert close_arrays(design['size'], design['repeated']), design
                    assert design['position'] == [3, 0, 4], design
                    for gear in design['gear'].values():
                        if all(value > 1e-8 for value in gear['base']):
                            assert_resized(gear)
                for ship in page.evaluate('characterScaleTest.ships()'):
                    assert ship['shipScale'] == (2.2 if ship['boss'] else 1.4 if ship['big'] else 1), ship
                    assert ship['hullScale'] == [.8, .5, .44], ship
                    assert len(ship['crew']) == (3 if ship['boss'] else 2 if ship['big'] else 1), ship
                    for crew in ship['crew']:
                        assert_resized(crew)
                initial = page.evaluate('characterScaleTest.fixture()')
                assert len(initial) == 5, initial
                assert_resized(page.evaluate('characterScaleTest.navy()'))
                # A browser reload recreates models from game state; rendering scale must never be saved and reapplied.
                for _ in range(3):
                    page.reload(wait_until='networkidle')
                    page.wait_for_function('!!window.characterScaleTest')
                    if not blocked:
                        page.wait_for_function('characterScaleTest.ready')
                    restored = page.evaluate('characterScaleTest.snapshot()')
                    assert len(restored) == len(initial), restored
                    for before, after in zip(initial, restored):
                        assert before['label'] == after['label'] and close_arrays(before['scale'], after['scale']), (before, after)
                        # Idle breathing can slightly vary between freshly generated fallback bodies.
                        assert close_arrays(before['size'], after['size'], rel_tol=.035), (before, after)
                        assert after['position'] == [*after['entity'][:1], 0, after['entity'][1]], after
                cached = page.evaluate('characterScaleTest.cacheAndFallen()')
                assert len(cached) == 8, cached
                for character in cached:
                    assert character['same'] and close_arrays(character['before'], character['after']), character
                    assert close_arrays(character['scaleBefore'], character['scaleAfter']), character
                page.screenshot(path=str(screenshot_dir / ('fallback.png' if blocked else 'loaded.png')))
                assert not errors, errors
                print('PASS measured 2/3 player, worker, navy, boarder, boss, dolphin, attached gear and ship crew; 150 syncs and 3 reloads; models ' + ('blocked' if blocked else 'loaded'), flush=True)
                page.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    main()
