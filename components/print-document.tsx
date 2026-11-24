import { getTranslations } from "next-intl/server";
import { translateFieldLabel, translateStatus } from "@/lib/i18n-helpers";
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
export async function PrintDocument({ document: d }: { document: PrintableDocument }) {
  const [tDoc, tCommon, tStatus, tFields] = await Promise.all([
    getTranslations("documents"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("fieldLabels"),
  ]);
  const docTitle = translateFieldLabel(tFields, d.title);
  return (
    <div className="document-view">
      <div className="document-controls print:hidden">
        <PrintButton />
        <p>{tDoc("metaSummary", { count: d.returned ? 3 : 2 })}</p>
      </div>
      <article className="print-document" aria-label={docTitle}>
        <div className="document-heading">
          <div>
            <div className="document-brand">
              MUSCAT <span>CARS</span>
            </div>
            <p>{d.branch}</p>
            <p>{d.location}</p>
          </div>
          <div className="document-heading-right">
            <h1>{docTitle}</h1>
            <p className="document-number">{d.number}</p>
            <p>
              {translateStatus(tStatus, d.status)} · {d.issuedAt}
            </p>
          </div>
        </div>
        <div className="document-body">
          <section>
            <h2>{tDoc("detailsHeading")}</h2>
            <dl className="document-fields">
              {d.fields.map(([k, v]) => (
                <div key={k}>
                  <dt>{translateFieldLabel(tFields, k)}</dt>
                  <dd>
                    {k === "Payment Mode" || k === "Rental Type" ? translateStatus(tStatus, v) : v}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {!!d.charges.length && (
            <section>
              <h2>{tDoc("financialHeading")}</h2>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>{tDoc("descriptionCol")}</th>
                    <th className="document-money">{tDoc("amountCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.charges.map((c) => (
                    <tr key={c.id}>
                      <td>{translateFieldLabel(tFields, c.label)}</td>
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
                <dt>{translateFieldLabel(tFields, k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {!!d.transfers?.length && (
            <section>
              <h2>{tDoc("transferHeading")}</h2>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>{tDoc("dateTimeCol")}</th>
                    <th>{tDoc("prevRegCol")}</th>
                    <th>{tDoc("newRegCol")}</th>
                    <th>{tCommon("km")}</th>
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
              <h2>{tDoc("remarksHeading")}</h2>
              <p className="document-remarks">{d.remarks}</p>
            </section>
          )}
        </div>
        <section
          className={`document-signatures ${d.returned ? "document-signatures-three" : ""}`}
          aria-label={tDoc("nameSignature")}
        >
          {d.signatures.map((s) => (
            <div className="document-signature" key={s.label}>
              <div className="document-signature-space">
                {s.src && (
                  <>
                    {/* biome-ignore lint/performance/noImgElement: private signature is embedded after document permission checks. */}
                    <img src={s.src} alt={s.name || tDoc("nameSignature")} />
                  </>
                )}
              </div>
              <p className="document-signature-label">{translateFieldLabel(tFields, s.label)}</p>
              <p>{s.name || tDoc("nameSignature")}</p>
            </div>
          ))}
        </section>
        <footer className="document-footer">
          <span>
            {tDoc("preparedBy")}: {d.preparedBy}
          </span>
          <span>
            {tDoc("printedBy")}: {d.printedBy} · {d.printedAt} {tCommon("omanTime")}
          </span>
        </footer>
      </article>
    </div>
  );
}
