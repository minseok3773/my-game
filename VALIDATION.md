# 레드팀 개선 검증 — 2026-11-06

검토에서 확인한 성장·저장·시작 실패·일꾼 교착·화면 겹침·알림 우선순위·배정창 포커스를 수정했습니다. 기존 상단 안내 통합 변경도 포함합니다.

## 통과한 검사

| 검사 | 확인한 동작 |
| --- | --- |
| `tests/update_game.py` | logistics/progression/persistence/visual/mobile 독립 5섹션, 해적 무상한·선장50상한, 55레벨 보스, 실제 새로고침 49→50→51, 구버전51레벨 능력치 보존·3회 재로딩 |
| `tests/worker_recovery_game.py` | 생산소/판매소 파손 조합 4종, 짐 보존, 수리·배달 복귀, 실제 저장 복원 |
| `tests/ui_reliability_game.py` | 화면9종 HUD 겹침 없음, 저장·회복·전투·일반 알림 우선순위, 배정창 키보드 포커스·Tab순환·닫기 복귀 |
| `tests/storage_game.py` | quota/security 실패 표시, 원본 보존, 재시도, JSON 백업 다운로드, 손상 저장의 이전 백업 복구, 명시적 초기화 |
| `tests/startup_game.py` | 외부HTTPS 전체 차단 정상 실행, 로컬 필수JS 실패 안내·재시도 복구, WebGL 실패 안내 |
| `tests/smoke_game.py` | 전술 결제·저장·전투 복원·방어 보상·카드·실행 오류 |
| `tests/training_game.py` | 자동 충원·60초 습격·훈련 효과·저장·모바일3종 실제 강화 |
| `tests/visual_game.py` | 모바일3종·데스크톱, HUD·터치·키보드·패널 스크롤·시설·전투 카메라 |

업데이트 검사의 전체 실행에서 네 섹션이 통과했습니다. 저장 이관 섹션의 구버전 fixture가 visibilitychange 저장에 의해 덮이는 테스트 구성 문제를 고친 후, 해당 섹션을 단독 재실행해 통과했습니다. 최종 다섯 섹션이 각각 검증됐습니다. 서버8000이 준비되기 전 발생한 초기화 실패는 서버 준비 후 해당 검사를 재실행해 해결했습니다.

## 빌드와 실행

- `python3 src/3d/assemble3d.py`로 생성 HTML을 조립하고 반복 생성 결과의 일치를 확인합니다.
- `sh src/tools/build_site.sh`는 vendor 엔진9개와 MIT 라이선스의 SHA-256을 확인하고 20개 배포 파일을 모읍니다.
- 엔진은 공식 npm 패키지 three@0.128.0의 SHA-512 검증본이며, 배포 HTML에도 각 스크립트의 SRI를 포함합니다.
- `git diff --check`를 통과했습니다.

Linux Chromium/소프트웨어 WebGL의 격리된 브라우저 문맥에서 검사했습니다. 실제 사용자의 저장 데이터를 변경하지 않았습니다. 실물 휴대폰 성능·공개 사이트 반영 상태는 이 로컬 검증과 별도입니다. 공개 배포는 GitHub main 업로드 후 Cloudflare Pages 자동 배포를 사용합니다.
