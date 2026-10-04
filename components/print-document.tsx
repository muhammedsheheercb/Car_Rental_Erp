import { PrintButton } from "./print-button";
export type PrintableDocument = {
  title: string;
  number: string;
  status: string;
  branch: string;
  location: string;
  issuedAt: string;
  fields: [string, string][];
  charges: { id: string; label: string; amount: string }[];
  totals: [string, string][];
  remarks: string;
  preparedBy: string;
  printedBy: string;
  printedAt: string;
  returned: boolean;
  signatures: { label: string; name: string; src: string | null }[];
  transfers?: { id: string; at: string; from: string; to: string; km: string }[];
};
export function PrintDocument({ document: d }: { document: PrintableDocument }) {
  return (
    <div className="document-view">
      <div className="document-controls print:hidden">
        <PrintButton />
        <p>A4 · Oman time · {d.returned ? "3" : "2"} signature positions</p>
      </div>
      <article className="print-document" aria-label={`${d.title} print preview`}>
        <div className="document-heading">
          <div>
            <div className="document-brand">
              MUSCAT <span>CARS</span>
            </div>
            <p>{d.branch}</p>
            <p>{d.location}</p>
          </div>
          <div className="document-heading-right">
            <h1>{d.title}</h1>
            <p className="document-number">{d.number}</p>
            <p>
              {d.status} · {d.issuedAt}
            </p>
          </div>
        </div>
        <div className="document-body">
          <section>
            <h2>Agreement / Customer / Vehicle Details</h2>
            <dl className="document-fields">
              {d.fields.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {!!d.charges.length && (
            <section>
              <h2>Financial Details — OMR</h2>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="document-money">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.charges.map((c) => (
                    <tr key={c.id}>
                      <td>{c.label}</td>
                      <td className="document-money">{c.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <dl className="document-totals">
            {d.totals.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {!!d.transfers?.length && (
            <section>
              <h2>Vehicle Transfer History</h2>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Previous Registration</th>
                    <th>Replacement Registration</th>
                    <th>KM</th>
                  </tr>
                </thead>
                <tbody>
                  {d.transfers.map((t) => (
                    <tr key={t.id}>
                      <td>{t.at}</td>
                      <td>{t.from}</td>
                      <td>{t.to}</td>
                      <td>{t.km}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {d.remarks && (
            <section>
              <h2>Remarks</h2>
              <p className="document-remarks">{d.remarks}</p>
            </section>
          )}
        </div>
        <section
          className={`document-signatures ${d.returned ? "document-signatures-three" : ""}`}
          aria-label="Signature positions"
        >
          {d.signatures.map((s) => (
            <div className="document-signature" key={s.label}>
              <div className="document-signature-space">
                {s.src && (
                  <>
                    {/* biome-ignore lint/performance/noImgElement: private signature is embedded after document permission checks. */}
                    <img src={s.src} alt={`${s.name} signature`} />
                  </>
                )}
              </div>
              <p className="document-signature-label">{s.label}</p>
              <p>{s.name || "Name / Signature"}</p>
            </div>
          ))}
        </section>
        <footer className="document-footer">
          <span>Prepared by: {d.preparedBy}</span>
          <span>
            Printed by: {d.printedBy} · {d.printedAt} Oman
          </span>
        </footer>
      </article>
    </div>
  );
}
