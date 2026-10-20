// 세 칸(① 영상 불러오기 → ② 영상 선택 → ③ 댓글 달기)의 머리말: 번호, 제목, 한 줄 안내.
export function StepHeader({ n, title, hint }: { n: 1 | 2 | 3; title: string; hint: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-base leading-7 font-semibold">
          <span className="sr-only">{n}단계 </span>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}
