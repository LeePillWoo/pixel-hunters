# pixel-hunters

2D 도트 방치형 타워 크롤러 + 머지 크래프팅 RPG. 동료가 탑에서 소재를 캐고, 플레이어가 합치고, 보스의 부위를 부숴 무기를 만든다.

- **플레이**: https://leepillwoo.github.io/pixel-hunters/
- 기획서: [`docs/GDD_v1.md`](docs/GDD_v1.md)
- 엔진: Phaser 3 + TypeScript + Vite (내부 해상도 640x360, 정수배 확대)

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 에 웹 배포용 빌드
npm run desktop  # 윈도우 데스크톱 앱 (오른쪽 아래 미니 창, Ctrl+Alt+P 숨기기/보이기)
```

## 폴더

| 경로 | 내용 |
|---|---|
| `src/data/` | 밸런스 데이터 (아이템, 층, 무기, 동료, 의뢰) |
| `src/panels/` | 화면 3분할: 탑 / 전투 / 합성판 |
| `src/ui/` | 버튼, 모달 창 |
| `public/assets/` | 게임에 쓰이는 PNG |
| `art/raw/` | AI로 생성한 원본 스프라이트 시트 (헌터, 새끼 녹룡, 베기 이펙트) |
| `tools/` | 그래픽 생성 스크립트 |

## 그래픽 만들기

```bash
npm run art
```

- `tools/gen_placeholder_art.py`: 아이템, UI, 동료, 슬라임, 배경을 코드로 그린 임시 도트.
- `tools/slice_sheets.py`: `art/raw/`의 큰 시트를 포즈별로 잘라 게임 크기로 줄인다.

Python 3과 Pillow가 필요하다.
