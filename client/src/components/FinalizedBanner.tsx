import { Download, Sparkles } from 'lucide-react';
import type { FinalizationStatus } from '@marriage/shared';
import styles from './Contract.module.css';

export function FinalizedBanner({
  status,
  pdfUrl,
}: {
  status: FinalizationStatus;
  pdfUrl: string | null;
}) {
  const complete = status === 'complete' && pdfUrl;
  return (
    <section className={styles.finalizedBanner} aria-live="polite">
      <span className={styles.sealMark} aria-hidden="true">
        <Sparkles size={22} />
      </span>
      <div>
        <strong>
          {complete
            ? 'Our promise is sealed'
            : status === 'failed'
              ? 'The signatures are safe'
              : 'Preparing your keepsake'}
        </strong>
        <p>
          {complete
            ? 'Both signatures are complete. The keepsake is ready.'
            : status === 'failed'
              ? 'PDF creation needs an operator retry.'
              : 'Both signatures are complete. The PDF is being created.'}
        </p>
      </div>
      {complete && (
        <a className={styles.downloadButton} href={pdfUrl}>
          <Download size={17} aria-hidden="true" />
          Download PDF
        </a>
      )}
    </section>
  );
}
