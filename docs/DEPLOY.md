# 배포 가이드

두 가지 길이 있다. **A안이 훨씬 간단하다.**

---

## A안 — Vercel GitHub 연동 (권장, 5분)

토큰도 워크플로도 필요 없다. Vercel이 GitHub을 직접 지켜보다가 푸시될 때마다 배포한다.

### 1. 프로젝트 import

1. [vercel.com/new](https://vercel.com/new) 접속
2. **Import Git Repository** → `TurtleLEE-teacher/Strong_Card` 선택
3. Framework Preset은 자동으로 **Next.js**가 잡힌다. 그대로 둔다.

### 2. 환경변수 입력

Import 화면의 **Environment Variables**에 아래를 넣는다.
(나중에 Settings → Environment Variables에서도 추가·수정 가능)

| Key | 값 | 필수 |
|---|---|---|
| `NOTION_API_KEY` | 노션 통합 토큰 (`ntn_...`) | ✅ |
| `NOTION_TX_DATA_SOURCE_ID` | `9dff87c6-4dbd-4791-be01-e7f4851e19fa` | ✅ |
| `NOTION_ALERT_DATA_SOURCE_ID` | `e5245062-d675-4e6c-a3e5-fa80afe6ce55` | ✅ |
| `NOTION_SUBSCRIPTION_DATA_SOURCE_ID` | `4ba52a2d-4f6d-436b-b052-8757e49be39b` | ✅ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 아래 생성값 | 알림용 |
| `VAPID_PRIVATE_KEY` | 아래 생성값 | 알림용 |
| `VAPID_SUBJECT` | `mailto:본인메일` | 알림용 |
| `APP_PASSWORD` | 앱 접속 비밀번호 | ✅ |
| `CRON_SECRET` | 크론 인증용 임의 문자열 | 알림용 |

> ⚠️ `NOTION_API_KEY`가 없으면 앱은 **데모 데이터**로 뜬다. 화면은 정상이지만
> 내 실제 카드 내역이 아니다.

> ⚠️ `APP_PASSWORD`를 비워 두면 **앱이 공개된다.** 카드 사용 내역 전체가
> 보이는 앱이므로 반드시 설정할 것.

### 3. Deploy

버튼을 누르면 끝. 이후 `main`에 푸시할 때마다 자동 배포된다.

### 4. 크론 설정 (알림용)

Vercel Hobby 플랜의 크론은 하루 1회 제한이라 쓰지 않는다. GitHub Actions가
배포된 앱을 호출한다.

저장소 **Settings → Secrets and variables → Actions**에 추가:

| Secret | 값 |
|---|---|
| `APP_BASE_URL` | 배포된 주소 (예: `https://strong-card.vercel.app`) |
| `CRON_SECRET` | Vercel에 넣은 것과 **같은 값** |

`.github/workflows/cron.yml`이 이미 있으므로 시크릿만 넣으면 동작한다.

`APP_BASE_URL`은 **끝 슬래시 없이, 최종 도메인**으로 넣는 걸 권한다.
끝에 `/`가 붙으면 `//api/cron/sync`가 되어 308 리다이렉트가 나고,
`http://`로 넣으면 https로 308이 난다. 워크플로가 두 경우 모두 정규화하지만
리다이렉트가 남아 있으면 로그에 경고가 찍힌다. 그때는 값이 프로덕션 도메인이
아니라 리다이렉트되는 주소(배포별 URL 등)일 가능성이 높다.

### 5. 알림 켜기

배포된 주소의 `/settings`에서 **알림 켜기**.

> ⚠️ **iOS는 홈 화면에 추가해야 알림이 온다.** Safari 탭에서는 Web Push API
> 자체가 없어 버튼이 동작하지 않는다. 공유 → '홈 화면에 추가' → 홈 화면
> 아이콘으로 다시 연 다음 켤 것. `/settings`가 이 상황을 감지해 안내한다.

---

## B안 — GitHub Actions로 배포

A안과 달리 배포까지 Actions에서 돌린다. Vercel 대시보드를 거의 안 쓰고
싶을 때만 고른다. 시크릿 3개를 더 넣어야 한다.

### 필요한 시크릿

| Secret | 어디서 얻나 |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | 로컬에서 `vercel link` 후 `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | 위와 동일 |

`.github/workflows/deploy.yml`이 준비돼 있다. 시크릿을 넣으면 `main` 푸시 시
프로덕션 배포가 돈다.

환경변수는 여전히 Vercel 대시보드에서 관리한다 (빌드 시점에 Vercel이 주입).

---

## 배포 후 점검

```
1. 앱 주소 접속 → 비밀번호 물어보면 정상 (APP_PASSWORD 동작)
2. 대시보드에 '데모 데이터' 배너가 없으면 → 노션 연결 성공
3. /settings → '데이터 소스'가 'Notion에 연결됨'인지 확인
4. /settings → 알림 켜기 → 테스트
5. Actions 탭 → Cron 워크플로 수동 실행(workflow_dispatch)해서 200 확인
```

### 노션 연결이 안 될 때

가장 흔한 원인은 **통합을 DB에 연결하지 않은 것**이다. 토큰만 발급하면
아무것도 못 읽는다.

DB 3개 **각각**에서 `⋯` → **연결(Connections)** → 통합 선택:

- `💳 Card_Transactions`
- `🔔 Card_Alert_Log`
- `📲 Card_Push_Subscriptions`
