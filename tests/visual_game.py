"""Check actual mobile sizing, HUD layout, dialogs, scenery, and combat camera.

Run a local server on port 8000 first. Screenshots are saved outside the checkout
unless --screenshots selects another directory.
"""

import argparse
import ast
import subprocess
import tempfile
from itertools import combinations
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8000/raft-village-3d.html"
HUD_IDS = ("quest", "money", "level", "goal", "bag", "menuBtn", "defense", "strategyBtn")
MOBILE_SIZES = ((390, 844), (320, 568), (844, 390))

# Reuse only the test hook declaration, without executing the smoke test module.
module = ast.parse((ROOT / "tests/smoke_game.py").read_text())
HOOK = next(
    ast.literal_eval(node.value)
    for node in module.body
    if isinstance(node, ast.Assign)
    and any(isinstance(target, ast.Name) and target.id == "HOOK" for target in node.targets)
)
HOOK += """
window.visualTest = {
  camera, renderer, objs, sync3D,
  get player() { return player; },
  shake() { shake = .4; },
  cameraSnapshot() {
    const point = new THREE.Vector3(player.x, raftY + .8, player.y);
    const distance = camera.position.distanceTo(point);
    point.project(camera);
    return {x: (point.x + 1) * innerWidth / 2,
            y: (1 - point.y) * innerHeight / 2, distance};
  }
};
"""


def overlaps(first, second):
    return (
        min(first["x"] + first["w"], second["x"] + second["w"])
        > max(first["x"], second["x"]) + 1
        and min(first["y"] + first["h"], second["y"] + second["h"])
        > max(first["y"], second["y"]) + 1
    )


def settle(page):
    page.evaluate("""async () => {
      for (let i = 0; i < 12; i++) visualTest.sync3D(.05);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }""")


def check_layout(page, width, height, mobile):
    actual = page.evaluate("""() => ({
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scale: visualViewport.scale, touch: navigator.maxTouchPoints
    })""")
    assert actual["width"] == width, ("layout viewport differs from screen", actual)
    assert actual["height"] == height, actual
    assert actual["scrollWidth"] <= width + 1, actual
    if mobile:
        assert actual["touch"] > 0 and abs(actual["scale"] - 1) < .01, actual

    rects = page.evaluate("""ids => Object.fromEntries(ids.map(id => {
      const element = document.getElementById(id);
      if (element.hidden || getComputedStyle(element).display === 'none') return [id, null];
      const r = element.getBoundingClientRect();
      return [id, {x:r.x, y:r.y, w:r.width, h:r.height}];
    }))""", HUD_IDS)
    visible = {name: rect for name, rect in rects.items() if rect}
    for name, rect in visible.items():
        assert (
            rect["x"] >= -1 and rect["y"] >= -1
            and rect["x"] + rect["w"] <= width + 1
            and rect["y"] + rect["h"] <= height + 1
        ), (width, height, name, rect)
    for (first, a), (second, b) in combinations(visible.items(), 2):
        assert not overlaps(a, b), (width, height, first, second, a, b)

    for selector in ("#bag", "#menuBtn", "#strategyBtn"):
        if page.locator(selector).is_visible():
            box = page.locator(selector).bounding_box()
            assert box["width"] >= 44 and box["height"] >= 44, (selector, box)
    for selector, minimum in (("#moneyVal", 20), ("#goal", 12)):
        font_size = page.locator(selector).evaluate("e => parseFloat(getComputedStyle(e).fontSize)")
        assert font_size >= minimum, (selector, font_size)
    canvas = page.locator("#world canvas").bounding_box()
    assert abs(canvas["width"] - width) < 1 and abs(canvas["height"] - height) < 1, canvas
    print(f"Actual {'mobile' if mobile else 'desktop'} viewport and readable HUD PASS {width}x{height}", flush=True)



def check_movement(page, mobile):
    """A right/up gesture must move right/up on screen under a fixed camera."""
    for direction, key in (("right", "d"), ("up", "w")):
        page.evaluate("""() => {
          visualTest.player.vx = 0; visualTest.player.vy = 0;
          window.movementStart = {
            x: visualTest.player.x, y: visualTest.player.y,
            camera: visualTest.camera.clone()
          };
        }""")
        session = None
        try:
            if mobile:
                session = page.context.new_cdp_session(page)
                x = page.viewport_size["width"] * .35
                y = page.viewport_size["height"] * .5
                session.send("Input.dispatchTouchEvent", {
                    "type": "touchStart", "touchPoints": [{"x": x, "y": y}],
                })
                session.send("Input.dispatchTouchEvent", {
                    "type": "touchMove", "touchPoints": [{
                        "x": x + (55 if direction == "right" else 0),
                        "y": y - (55 if direction == "up" else 0),
                    }],
                })
            else:
                page.keyboard.down(key)
            page.wait_for_function("""() => Math.hypot(
              visualTest.player.x - movementStart.x,
              visualTest.player.y - movementStart.y) > .15""", timeout=10000)
        finally:
            if mobile and session:
                session.send("Input.dispatchTouchEvent", {
                    "type": "touchEnd", "touchPoints": [],
                })
                session.detach()
            elif not mobile:
                page.keyboard.up(key)
        delta = page.evaluate("""() => {
          const before = new THREE.Vector3(movementStart.x, 0, movementStart.y)
            .project(movementStart.camera);
          const after = new THREE.Vector3(visualTest.player.x, 0, visualTest.player.y)
            .project(movementStart.camera);
          return {x: (after.x - before.x) * innerWidth / 2,
                  y: (before.y - after.y) * innerHeight / 2};
        }""")
        if direction == "right":
            assert delta["x"] > 0 and abs(delta["y"]) < delta["x"] * .5, delta
        else:
            assert delta["y"] < 0 and abs(delta["x"]) < -delta["y"] * .5, delta
    print(f"{'Touch drag' if mobile else 'Keyboard'} screen directions PASS", flush=True)


def check_dialog_scroll(page, panel_selector, close_selector):
    panel = page.locator(panel_selector)
    box = panel.locator(":scope > div")
    size = box.evaluate("e => ({client:e.clientHeight, scroll:e.scrollHeight})")
    if size["scroll"] > size["client"] + 2:
        box.evaluate("e => { e.scrollTop = 0; }")
        bounds = box.bounding_box()
        session = page.context.new_cdp_session(page)
        x = bounds["x"] + bounds["width"] / 2
        y = bounds["y"] + bounds["height"] * .75
        distance = min(240, bounds["height"] * .45)
        # dispatchTouchEvent follows the same native pan path as a finger swipe.
        # synthesizeScrollGesture does not scroll nested mobile containers on
        # the managed Chromium build, even on an otherwise empty test page.
        session.send("Input.dispatchTouchEvent", {
            "type": "touchStart", "touchPoints": [{"x": x, "y": y}],
        })
        for step in range(1, 9):
            session.send("Input.dispatchTouchEvent", {
                "type": "touchMove", "touchPoints": [{
                    "x": x, "y": y - distance * step / 8,
                }],
            })
            page.wait_for_timeout(20)
        session.send("Input.dispatchTouchEvent", {
            "type": "touchEnd", "touchPoints": [],
        })
        page.wait_for_function(
            "selector => document.querySelector(selector).scrollTop > 0",
            arg=panel_selector + " > div", timeout=10000,
        )
        session.detach()
    close = page.locator(close_selector)
    close.scroll_into_view_if_needed()
    rect = close.bounding_box()
    assert rect["y"] >= 0 and rect["y"] + rect["height"] <= page.viewport_size["height"], rect
    close.click()
    assert panel.is_hidden()


def seed_village(page):
    page.evaluate("""() => {
      const t = gameTest;
      for (const id of ['grill', 'diner', 'expand1', 'water', 'waterShop',
          'expand2', 'garden', 'veggieShop', 'tent1', 'tent2', 'tent3',
          'lighthouse', 'towerA', 'towerB', 'solar']) t.unlock(id);
      t.G.money = 500; t.G.hp = 85; t.G.raidT = 180;
      visualTest.player.x = 6; visualTest.player.y = 6;
      t.hud(t.objective());
    }""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    screenshots = args.screenshots or Path(tempfile.mkdtemp(prefix="my-game-visual-"))
    screenshots.mkdir(parents=True, exist_ok=True)
    cache = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        for mobile, sizes in ((True, MOBILE_SIZES), (False, ((1280, 800),))):
            context = browser.new_context(
                viewport={"width": sizes[0][0], "height": sizes[0][1]},
                is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1,
            )
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(error.stack))

            def external(route):
                url = route.request.url
                if not url.startswith("https://cdn.jsdelivr.net/"):
                    route.abort()
                    return
                if url not in cache:
                    cache[url] = subprocess.check_output(
                        ["curl", "-fsS", "--max-time", "20", url]
                    )
                route.fulfill(body=cache[url], content_type="application/javascript")

            page.route("https://**", external)
            page.route("**/raft-village-3d.html", lambda route: route.fulfill(
                body=(ROOT / "raft-village-3d.html").read_text().replace(
                    "})();\n</script>", HOOK + "})();\n</script>"
                ), content_type="text/html",
            ))
            page.goto(URL, wait_until="networkidle")
            page.wait_for_function("!!window.visualTest")
            settle(page)
            if mobile:
                page.screenshot(path=str(screenshots / "start.png"))
            seed_village(page)
            for width, height in sizes:
                page.set_viewport_size({"width": width, "height": height})
                settle(page)
                check_layout(page, width, height, mobile)
                if (mobile and width == 390) or not mobile:
                    check_movement(page, mobile)
                page.screenshot(path=str(screenshots / f"village-{width}.png"))
                if mobile and width == 320:
                    page.locator("#menuBtn").click()
                    page.screenshot(path=str(screenshots / "help-320.png"))
                    check_dialog_scroll(page, "#helpPanel", "#startBtn")
                    page.locator("#strategyBtn").click()
                    page.screenshot(path=str(screenshots / "strategy-320.png"))
                    check_dialog_scroll(page, "#strategyPanel", "#strategyPanel .close")
                    print("Small-phone help/strategy scroll and close controls PASS", flush=True)

            before = page.evaluate("visualTest.cameraSnapshot()")
            page.evaluate("visualTest.shake(); visualTest.sync3D(.016)")
            after = page.evaluate("visualTest.cameraSnapshot()")
            assert before["distance"] > 2 and after["distance"] > 2
            assert abs(after["distance"] - before["distance"]) < 1.5, (before, after)
            assert abs(after["x"] - before["x"]) < page.viewport_size["width"] * .08, (before, after)
            assert abs(after["y"] - before["y"]) < page.viewport_size["height"] * .08, (before, after)
            assert page.evaluate("Object.values(visualTest.objs).every(o => o.g.getObjectByName('station-details'))")
            page.evaluate("gameTest.startRaid(); gameTest.setRaid(true); gameTest.hud(gameTest.objective()); visualTest.sync3D(.016)")
            assert page.locator("#goal").get_attribute("data-kind") == "danger"
            assert page.locator("#strategyBtn").is_hidden()
            if mobile:
                page.screenshot(path=str(screenshots / "raid.png"))
            assert not errors, errors
            context.close()
            print("Station dressing, stable combat camera, raid priority PASS", flush=True)
        browser.close()
    print("Screenshots:", screenshots, flush=True)


if __name__ == "__main__":
    main()
