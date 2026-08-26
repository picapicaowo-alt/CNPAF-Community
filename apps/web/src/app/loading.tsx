export default function RouteLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="正在打开页面 / Opening page"
      className="route-loading"
      role="status"
    >
      <span className="route-loading-progress" />
      <div className="route-loading-heading" />
      <div className="route-loading-copy" />
      <div className="route-loading-panel">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
