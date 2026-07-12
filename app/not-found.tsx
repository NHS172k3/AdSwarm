export default function NotFound() {
  return (
    <main className="mission-root">
      <div className="shell studio-shell">
        <section className="panel studio-chapter studio-empty-state" data-visible="true">
          <div className="panel-header studio-panel-header">
            <div>
              <p className="eyebrow">Not found</p>
              <h2>This route does not exist.</h2>
              <p>Return to Campaign Studio to continue the workflow.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
