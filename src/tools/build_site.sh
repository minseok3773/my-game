#!/bin/sh
# 공개 배포용 폴더(_site)에 게임 실행에 필요한 파일만 모읍니다. (홈 화면 앱용 manifest·sw.js 포함)
# Cloudflare Pages 설정: 빌드 명령 `sh src/tools/build_site.sh`, 출력 폴더 `_site`
set -e
(cd vendor/three-r128 && sha256sum -c SHA256SUMS)
rm -rf _site
mkdir -p _site
cp index.html raft-village-3d.html manifest.webmanifest sw.js _site/
cp -R models assets vendor _site/
echo "_site ready: $(find _site -type f | wc -l) files"
