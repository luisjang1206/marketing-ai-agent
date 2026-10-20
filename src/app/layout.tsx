import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "유튜브 댓글 에이전트",
  description: "허용 채널의 유튜브 영상에 맥락 맞는 댓글 초안을 쓰고, 운영 규칙 안에서 게시합니다.",
};

// 전역 폰트는 시스템 기본이다(globals.css). 웹폰트는 불러오지 않는다: 오프라인 시연에서도 같은 모습으로 뜨게 한다.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
