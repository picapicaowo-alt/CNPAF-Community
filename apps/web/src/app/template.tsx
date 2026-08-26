import { ViewTransition } from "react";

export default function RouteTemplate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ViewTransition enter="route-enter" exit="route-exit" default="none">
      <div className="route-view">{children}</div>
    </ViewTransition>
  );
}
