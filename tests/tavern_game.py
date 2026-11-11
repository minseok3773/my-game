"""Five-card poker ranking, money transactions, reloads and mobile controls."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HOOK=r'''
window.pokerTest={
 get G(){return G},get state(){return tavernState()},rank:pokerRank,compare:pokerCompare,
 deal:tavernDeal,hold:tavernHold,show:tavernShowdown,open:tavernOpen,save,build,serialize,load,reloadLatestStorage,
 get storage(){return {...storageState}},
 get clock(){return G.t},tick(){update(.5)},
 reset(ready=true){resetStorageState();const g=freshState();g.money=100;if(ready)g.unlocked.push('expand1');build(g);paused=true;document.getElementById('helpPanel').hidden=false;},
 fixture(player,dealer){const r=tavernState().round;r.player=player;r.dealer=dealer;r.held=[true,true,true,true,true];r.deck=Array.from({length:52},(_,i)=>i).filter(c=>![...player,...dealer].includes(c));},
 raid(value){raidOn=value;}
};
'''
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass

def main():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:
  source=(ROOT/'raft-village-3d.html').read_text().replace('})();\n</script>',HOOK+'})();\n</script>')
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
   ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   ctx.add_init_script('requestAnimationFrame=()=>0')
   ctx.route('https://**',lambda r:r.abort())
   ctx.route('**/raft-village-3d.html',lambda r:r.fulfill(body=source,content_type='text/html'))
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   url=f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
   page.goto(url,wait_until='networkidle');page.wait_for_function('!!window.pokerTest')
   # Card encoding: suit*13 + rank-2; exercise all nine hand categories and kickers.
   ranks=page.evaluate('''() => {
    const card=(r,s)=>s*13+r-2;
    const hands=[[[14,0],[11,1],[9,2],[6,0],[3,1]],[[14,0],[14,1],[9,2],[6,0],[3,1]],
     [[14,0],[14,1],[9,2],[9,0],[3,1]],[[14,0],[14,1],[14,2],[6,0],[3,1]],
     [[14,0],[5,1],[4,2],[3,0],[2,1]],[[14,0],[11,0],[9,0],[6,0],[3,0]],
     [[14,0],[14,1],[14,2],[3,0],[3,1]],[[14,0],[14,1],[14,2],[14,3],[3,1]],
     [[10,0],[11,0],[12,0],[13,0],[14,0]]];
    return hands.map(h=>pokerTest.rank(h.map(v=>card(...v)))[0]);
   }''')
   assert ranks==list(range(9)),ranks
   assert page.evaluate('pokerTest.compare([0,1,2,3,12],[1,2,3,4,5])')<0 # wheel loses to 7-high straight flush
   assert page.evaluate('pokerTest.compare([0,13,6,8,10],[26,39,6,8,9])')>0
   print('PASS all nine poker ranks, low ace and kicker comparison',flush=True)
   page.evaluate('pokerTest.reset(false);pokerTest.open()')
   assert page.locator('#tavernDeal').is_disabled()
   assert not page.evaluate('pokerTest.deal(10)')
   page.evaluate('pokerTest.reset();pokerTest.G.money=9;pokerTest.open()')
   assert not page.evaluate('pokerTest.deal(10)')
   page.evaluate('pokerTest.G.money=100;pokerTest.raid(true)')
   assert not page.evaluate('pokerTest.deal(10)')
   page.evaluate('pokerTest.raid(false);pokerTest.open()')
   assert not page.evaluate('pokerTest.deal(-10)')
   page.locator('#tavernStake').select_option('20');page.locator('#tavernDeal').click()
   assert page.evaluate('pokerTest.G.money')==80
   assert not page.evaluate('pokerTest.deal(20)')
   cards=page.evaluate('pokerTest.state.round')
   assert len(set(cards['player']+cards['dealer']+cards['deck']))==52
   page.locator('[data-card="2"]').click();assert page.locator('[data-card="2"]').get_attribute('aria-pressed')=='true'
   clock=page.evaluate('pokerTest.clock');page.evaluate('pokerTest.tick()');assert page.evaluate('pokerTest.clock')==clock
   before=page.evaluate('pokerTest.state.round')
   page.reload(wait_until='networkidle');page.wait_for_function('!!window.pokerTest');page.evaluate('pokerTest.open()')
   assert page.evaluate('pokerTest.state.round')==before
   assert page.evaluate('pokerTest.G.money')==80
   print('PASS unlock, funds and raid guards; one stake, unique deck, holds and reload, frozen village',flush=True)
   # Force a winning showdown but use real UI to settle; dealer flush remains unchanged.
   page.evaluate('pokerTest.fixture([8,9,10,11,12],[13,15,17,19,21])')
   page.locator('#tavernDraw').click()
   assert page.evaluate('pokerTest.G.money')==120
   assert page.evaluate('pokerTest.state.round.payout')==40
   assert not page.evaluate('pokerTest.show()')
   page.reload(wait_until='networkidle');page.wait_for_function('!!window.pokerTest');page.evaluate('pokerTest.open()')
   assert page.evaluate('pokerTest.G.money')==120
   assert '정산 완료' in page.locator('#tavernPanel').inner_text()
   print('PASS win pays pot once and remains settled through reload',flush=True)
   for player,dealer,outcome,money in [([0,1,2,3,4],[13,14,15,16,17],0,100),([0,2,4,6,8],[21,22,23,24,25],-1,90)]:
    page.evaluate('pokerTest.reset();pokerTest.open();pokerTest.deal(10)')
    page.evaluate('(a)=>pokerTest.fixture(a[0],a[1])',[player,dealer]);page.locator('#tavernDraw').click()
    assert page.evaluate('pokerTest.state.round.outcome')==outcome
    assert page.evaluate('pokerTest.G.money')==money
   print('PASS draw refunds stake and loss consumes only stake',flush=True)
   # Failed primary save must roll back both charging and payouts.
   page.evaluate('() => {pokerTest.reset();pokerTest.open();window.realSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException("full","QuotaExceededError")}; }')
   assert not page.evaluate('pokerTest.deal(10)')
   assert page.evaluate('pokerTest.G.money')==100
   assert page.evaluate('pokerTest.state.round') is None
   page.evaluate('() => {Storage.prototype.setItem=window.realSet;pokerTest.deal(10);pokerTest.fixture([8,9,10,11,12],[13,15,17,19,21]);Storage.prototype.setItem=()=>{throw new DOMException("full","QuotaExceededError")}; }')
   assert not page.evaluate('pokerTest.show()')
   assert page.evaluate('pokerTest.G.money')==90
   assert page.evaluate('pokerTest.state.round.phase')=='draw'
   page.evaluate('() => {Storage.prototype.setItem=window.realSet; }');page.locator('#tavernDraw').click()
   assert page.evaluate('pokerTest.G.money')==110
   print('PASS failed charging and settlement roll back; retry pays once',flush=True)
   for width,height in [(320,568),(390,844),(844,390)]:
    page.set_viewport_size({'width':width,'height':height})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#tavernTable').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
    for _ in range(12):
     page.keyboard.press('Tab');assert page.evaluate('document.getElementById("tavernPanel").contains(document.activeElement)')
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/my-game-tavern.png',full_page=True)
   page.keyboard.press('Escape');assert page.locator('#tavernPanel').is_hidden()
   assert not errors,errors
   print('PASS three mobile layouts, keyboard focus and close; no runtime errors',flush=True)
   # Optional damaged poker fields cannot corrupt or reset the village.
   page.evaluate('''() => {pokerTest.reset();const g=pokerTest.serialize();g.st.fishing.pile=9;g.unlocked.push('tent1');delete g.crewRoster;pokerTest.build(g);pokerTest.open();pokerTest.deal(20);}''')
   original=page.evaluate('pokerTest.serialize()')
   page.evaluate('''() => {const g=pokerTest.serialize();delete g.tavern.round.held;pokerTest.build(g);pokerTest.open();}''')
   assert page.evaluate('pokerTest.state.round.held')==[False]*5
   assert page.evaluate('pokerTest.G.money')==80
   for field,value in [('player',[]),('deck',[0]*42),('held',[True]),('stake',-10),('phase','unknown')]:
    bad={**original,'tavern':{**original['tavern'],'round':{**original['tavern']['round'],field:value}}}
    page.evaluate('(g)=>{pokerTest.build(g);pokerTest.open();}',bad)
    assert page.evaluate('pokerTest.state.round') is None
    assert page.evaluate('!!pokerTest.state.damagedRound')
    assert page.evaluate('pokerTest.G.money')==80
    assert page.locator('#tavernDeal').is_disabled()
    assert not page.evaluate('pokerTest.show()')
    assert page.evaluate('pokerTest.G.unlocked')==original['unlocked']
    assert page.evaluate('pokerTest.G.st.fishing.pile')==9
    assert page.evaluate('pokerTest.serialize().crewRoster')==original['crewRoster']
    page.locator('#tavernClose').click();assert page.locator('#tavernPanel').is_hidden()
   bad_result={**original,'tavern':{**original['tavern'],'round':{**original['tavern']['round'],'phase':'result','deck':[],'outcome':1,'payout':10000}}}
   page.evaluate('(g)=>{pokerTest.build(g);pokerTest.open();}',bad_result)
   assert page.evaluate('!!pokerTest.state.damagedRound')
   assert not page.evaluate('pokerTest.show()')
   assert page.evaluate('pokerTest.G.money')==80
   page.locator('#tavernDiscardDamaged').click()
   assert not page.evaluate('!!pokerTest.state.damagedRound')
   assert page.evaluate('pokerTest.G.money')==80
   page.reload(wait_until='networkidle');page.wait_for_function('!!window.pokerTest');page.evaluate('pokerTest.open()')
   assert not page.evaluate('!!pokerTest.state.damagedRound')
   assert page.evaluate('pokerTest.state.round') is None
   assert page.evaluate('pokerTest.G.money')==80
   print('PASS missing holds repaired; bad cards/deck/stake/phase isolated without village reset or payouts',flush=True)

   # Two ordinary pages share localStorage but keep independent in-memory villages.
   page.evaluate('pokerTest.reset();pokerTest.save()')
   other=ctx.new_page();other.on('pageerror',lambda e:errors.append(str(e)))
   other.goto(url,wait_until='networkidle');other.wait_for_function('!!window.pokerTest')
   page.evaluate('pokerTest.open();pokerTest.deal(20)')
   saved=page.evaluate('localStorage.getItem("raft-village-v1")')
   other.evaluate('pokerTest.open()')
   assert not other.evaluate('pokerTest.deal(20)')
   assert other.evaluate('pokerTest.G.money')==100
   assert other.evaluate('pokerTest.storage.conflict')
   assert other.evaluate('localStorage.getItem("raft-village-v1")')==saved
   assert not other.evaluate('pokerTest.save()')
   assert other.evaluate('localStorage.getItem("raft-village-v1")')==saved
   other.locator('#tavernReload').click()
   assert other.evaluate('pokerTest.G.money')==80
   assert other.evaluate('pokerTest.state.round.phase')=='draw'
   # Both pages now hold the same dealt round; one settles and the stale one must stop.
   page.evaluate('pokerTest.fixture([8,9,10,11,12],[13,15,17,19,21]);pokerTest.show()')
   settled=page.evaluate('localStorage.getItem("raft-village-v1")')
   assert not other.evaluate('pokerTest.hold(0)')
   assert not other.evaluate('pokerTest.save()')
   assert other.evaluate('localStorage.getItem("raft-village-v1")')==settled
   other.locator('#tavernReload').click()
   assert other.evaluate('pokerTest.G.money')==120
   assert other.evaluate('pokerTest.state.round.phase')=='result'
   assert not other.evaluate('pokerTest.show()')
   assert not errors,errors
   print('PASS two-tab stale deal/hold/autosave blocked; reload preserves latest money and settled result',flush=True)
   browser.close()
 finally:server.shutdown();server.server_close();thread.join(timeout=5)
if __name__=='__main__':main()
