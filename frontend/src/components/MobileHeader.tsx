// モバイル上部のロゴ表示のみのスリムなヘッダー。
// ナビゲーションは BottomNav に一本化しているため、ここにハンバーガー等は持たせない。
// layout.tsx でスクロール領域（<main>）の先頭に配置し、本文と一緒にスクロールして消える
// （= 固定しない）ことで、縦領域が乏しい in-app browser でも本文領域を最大化する。
export default function MobileHeader() {
  return (
    <header
      className="md:hidden flex items-center px-3 bg-white text-ink border-b border-line print:hidden"
      style={{
        // 非 standalone の本アプリでは safe-area-inset-top はブラウザのクロムが吸収するため
        // 実機 Safari では 0。in-app browser では誤報告されるため予約しない（小さな固定余白のみ）。
        // 上端の白ダミー（layout.tsx, 高さ 0.5rem）に重ならないよう同量を確保する。
        paddingTop: '0.5rem',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <div className="flex items-center h-12 w-full">
        <h1 className="text-base font-bold tracking-wide text-primary">OptiSeat</h1>
      </div>
    </header>
  )
}
