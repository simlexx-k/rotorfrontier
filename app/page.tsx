"use client";

import dynamic from "next/dynamic";

const GameShell = dynamic(() => import("./game/GameShell"), {
  ssr: false,
  loading: () => (
    <main className="boot-screen" aria-live="polite">
      <div className="boot-mark" aria-hidden="true">RF</div>
      <p>Preparing flight systems</p>
      <span className="boot-line" />
    </main>
  ),
});

export default function Home() {
  return <GameShell />;
}
