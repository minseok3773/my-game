"""Customer arrivals, physical checkout, stock accounting and bounded queues.

Uses a private local server and browser context; no player save is changed.
"""
import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r"""
window.customerSalesTest = {
 reset() {
  const data=freshState();
  data.unlocked.push('expand1','expand2','expand3','tent1','grill','diner','water','waterShop','garden','veggieShop');
  data.level=20;build(data);paused=true;raidOn=false;G.stats={};Math.random=()=>.5;
  for(const id of this.ids()){
   Object.assign(runtime[id],{spawn:10000,queue:[],leaving:[],serveT:0});
   Object.assign(G.st[id],{stock:20,cash:0,saleElapsed:0,customerSalesVersion:1});
  }
 },
 ids(){return STATION_IDS.filter(id=>DEFS[id].type==='shop'&&unlocked.has(id));},
 visitor(id) { const r=runtime[id];r.spawn=0;updateShop(id,.001);r.spawn=10000;return r.queue[0]; },
 tick(id,count){for(let n=0;n<count;n++)updateShop(id,.05);},
 counter(id){return customerSlotPos(DEFS[id],0);},
 spacing(){return this.ids().map(id=>{
  const d=DEFS[id],points=Array.from({length:6},(_,i)=>customerSlotPos(d,i));let minimum=Infinity;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)
   minimum=Math.min(minimum,Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y));
  const berth=customerBerth(d),entry=customerEntry(d),exit=customerExit(d),rect=customerDockRect(id);
  const along=p=>(p.x-berth.x)*berth.dx+(p.y-berth.y)*berth.dy;
  const inside=p=>p.x>=rect[0]&&p.x<=rect[2]&&p.y>=rect[1]&&p.y<=rect[3];
  return {id,minimum,entry:along(entry),exit:along(exit),onDock:inside(entry)&&inside(exit)};
 });},
 get G(){return G},get runtime(){return runtime},get defs(){return DEFS},
 price(id){return priceOf(DEFS[id]);},save,serialize,build,
 outside(c){return !hasTile(Math.floor(c.x),Math.floor(c.y));},
 expand(){const b=customerRaftBounds();addRect([b.x1,b.y0,b.x1+4,b.y1]);for(const id of this.ids())syncCustomerRoutes(id);},
};
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        source = (ROOT / 'raft-village-3d.html').read_text().replace(
            '})();\n</script>', HOOK + '})();\n</script>')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium',
                args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script('requestAnimationFrame=()=>0')
            page.route('https://**', lambda route: route.abort())
            page.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/raft-village-3d.html', wait_until='networkidle')
            page.wait_for_function('!!window.customerSalesTest')
            page.evaluate('customerSalesTest.reset()')
            ids = page.evaluate('customerSalesTest.ids()')
            assert len(ids) == 4, ids

            spacing = page.evaluate('customerSalesTest.spacing()')
            assert all(s['minimum'] >= 1.06 - 1e-6 and s['entry'] < 6.8 and s['exit'] < 6.8 and s['onDock'] for s in spacing), spacing
            print('PASS six waiting dolphins have at least 1.06 units of head spacing; entry and exit remain on the dock', flush=True)

            for shop in ids:
                result = page.evaluate("""id=>{
                  const t=customerSalesTest;t.reset();const s=t.G.st[id],r=t.runtime[id];
                  t.tick(id,400);const unattended={stock:s.stock,cash:s.cash};
                  const c=t.visitor(id);c.want=1;t.tick(id,1);
                  const far={stock:s.stock,cash:s.cash,got:c.got};
                  Object.assign(c,t.counter(id),{vx:0,vy:0});
                  t.tick(id,39);const before={stock:s.stock,cash:s.cash,got:c.got};
                  t.tick(id,1);return {unattended,far,before,after:{stock:s.stock,cash:s.cash,got:c.got,carry:c.carry},
                    price:t.price(id),left:r.leaving.includes(c)&&!r.queue.includes(c)};
                }""", shop)
                assert result['unattended'] == {'stock': 20, 'cash': 0}, result
                assert result['far'] == {'stock': 20, 'cash': 0, 'got': 0}, result
                assert result['before'] == {'stock': 20, 'cash': 0, 'got': 0}, result
                assert result['after']['stock'] == 19 and result['after']['cash'] == result['price'], result
                assert result['after']['got'] == 1 and len(result['after']['carry']) == 1 and result['left'], result
            print('PASS four shops require an arrived customer and two-second checkout; stock, cash, carried purchase and departure match', flush=True)

            result = page.evaluate("""()=>{
              const t=customerSalesTest;t.reset();const id='waterShop',r=t.runtime[id],s=t.G.st[id];
              const c=t.visitor(id);Object.assign(c,t.counter(id),{vx:0,vy:0});c.want=1;s.stock=0;
              t.tick(id,720);return {got:c.got,cash:s.cash,waiting:r.queue.includes(c),departed:r.leaving.includes(c)};
            }""")
            assert result == {'got':0,'cash':0,'waiting':False,'departed':True}, result
            print('PASS empty shop makes no money; waiting visitor gives up without a fake purchase', flush=True)

            result = page.evaluate("""()=>{
              const t=customerSalesTest;t.reset();const id='fishShop',r=t.runtime[id],s=t.G.st[id];
              s.stock=500;r.spawn=0;let maxQueue=0,maxLeaving=0,outside=true,sawExit=false;
              for(let n=0;n<4800;n++){
                t.tick(id,1);maxQueue=Math.max(maxQueue,r.queue.length);maxLeaving=Math.max(maxLeaving,r.leaving.length);
                sawExit ||=r.leaving.length>0;outside &&=[...r.queue,...r.leaving].every(c=>t.outside(c));
              }
              const sold=t.G.stats.sold||0;const before={stock:s.stock,cash:s.cash};
              t.G.broken[id]=true;const count=r.queue.length;t.tick(id,200);
              return {maxQueue,maxLeaving,outside,sawExit,sold,accounted:s.stock===500-sold,
                broken:s.stock===before.stock&&s.cash===before.cash&&r.queue.length===count};
            }""")
            assert result['maxQueue'] <= 6 and result['maxLeaving'] <= 6, result
            assert all(result[k] for k in ['outside','sawExit','accounted','broken']) and result['sold'] > 0, result
            print('PASS physical customer lifecycle stays off the raft, queues remain bounded and broken shops stop sales', flush=True)

            result = page.evaluate("""()=>{
              const t=customerSalesTest;t.reset();for(const id of t.ids())t.visitor(id);
              t.expand();return t.ids().every(id=>[...t.runtime[id].queue,...t.runtime[id].leaving].every(c=>t.outside(c)));
            }""")
            assert result
            print('PASS raft expansion reroutes existing visitors outside the living deck', flush=True)

            before = page.evaluate("""()=>{
              const t=customerSalesTest;t.reset();const c=t.visitor('fishShop');c.want=3;
              Object.assign(c,t.counter('fishShop'),{vx:0,vy:0});t.tick('fishShop',65);t.save();
              return {stock:t.G.st.fishShop.stock,cash:t.G.st.fishShop.cash};
            }""")
            assert before['stock'] == 19 and before['cash'] > 0, before
            page.reload(wait_until='networkidle')
            after = page.evaluate("""()=>{const t=customerSalesTest;t.runtime.fishShop.spawn=10000;t.tick('fishShop',80);
              return {stock:t.G.st.fishShop.stock,cash:t.G.st.fishShop.cash,queue:t.runtime.fishShop.queue.length};} """)
            assert after == dict(before, queue=0), (before, after)
            assert not errors, errors
            print('PASS actual reload preserves paid stock/cash and never continues automatic or duplicate sales; no JavaScript errors', flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    main()
