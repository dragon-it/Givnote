# GiveNote
이제 엑셀 서식 없이 편하게 명단을 관리하세요 !

이 프로젝트는 [Next.js](https://nextjs.org)로 만들었고 [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)으로 초기화했습니다.

## 바이브 코딩

이 README는 바이브 코딩으로 다듬었습니다.

## 시작하기

먼저 개발 서버를 실행하세요:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열면 결과를 확인할 수 있습니다.

`src/app/page.tsx`를 수정하면 페이지가 자동으로 갱신됩니다.

이 프로젝트는 [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)를 사용해 Vercel의 새로운 폰트 패밀리인 [Geist](https://vercel.com/font)를 자동 최적화 및 로드합니다.

## 데이터 저장

GiveNote는 브라우저의 로컬 스토리지를 사용합니다. 별도로 저장하지 않아도 스토리지를 삭제하지 않는 한 나중에 다시 접속했을 때 데이터가 유지됩니다.

## GitHub Pages 배포

이 저장소는 GitHub Actions로 정적 내보내기 후 GitHub Pages에 배포합니다.

- 배포 URL: `https://dragon-it.github.io/GiveNote/`
- 배포 트리거: `master` 브랜치에 푸시

로컬에서 빌드만 확인하려면:

```bash
npm ci
npm run build
```

## 더 알아보기

Next.js에 대해 더 알고 싶다면 아래 자료를 참고하세요:

- [Next.js 문서](https://nextjs.org/docs) - Next.js 기능과 API 소개
- [Learn Next.js](https://nextjs.org/learn) - 대화형 Next.js 튜토리얼

[Next.js GitHub 저장소](https://github.com/vercel/next.js)도 확인할 수 있습니다. 피드백과 기여를 환영합니다!
