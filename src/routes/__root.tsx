import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1",
      },
      {
        title: "Tactics Mercenary Revival — 택틱스 머셔너리 부활",
      },
      {
        name: "description",
        content:
          "팬택네트 택틱스 머셔너리 완전 부활 프로젝트. 원작 자료 보존 + 브라우저 아레나 프로토타입.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body className="tm-grid-bg antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
