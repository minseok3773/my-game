"""Generate the public game QR codes (requires qrcode==8.2)."""

import argparse
from pathlib import Path

import qrcode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url", default="https://minseok3773.github.io/my-game"
    )
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    if not base.startswith("https://"):
        parser.error("Use the public HTTPS deployment URL.")
    assets = Path(__file__).resolve().parents[2] / "assets"
    assets.mkdir(exist_ok=True)
    for version in ("2d", "3d"):
        url = f"{base}/raft-village-{version}.html"
        code = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        code.add_data(url)
        code.make(fit=True)
        code.make_image(fill_color="black", back_color="white").save(
            assets / f"qr-{version}.png"
        )
        print(f"qr-{version}.png -> {url}")


if __name__ == "__main__":
    main()
