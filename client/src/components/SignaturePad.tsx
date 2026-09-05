import { Check, PenLine, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { Party } from '@marriage/shared';
import { useSignaturePad } from '../hooks/useSignaturePad';
import { useContract } from '../app/ContractProvider';
import styles from './Contract.module.css';

type SignaturePadProps = {
  name: string;
  party: Party;
  isCurrentParty: boolean;
  sealed: boolean;
  signatureUrl: string | null;
  onSeal: (signature: Blob) => Promise<void>;
  onSigningChange?: (signing: boolean) => void;
};

export function SignaturePad({
  name,
  party,
  isCurrentParty,
  sealed,
  signatureUrl,
  onSeal,
  onSigningChange,
}: SignaturePadProps) {
  const editable = isCurrentParty && !sealed;
  const [sealing, setSealing] = useState(false);
  const [sealError, setSealError] = useState('');
  const { socket } = useContract();
  const { canvasRef, clear, exportPng, hasInk, pointerHandlers } =
    useSignaturePad({
      disabled: !editable,
      party,
      socket,
    });

  const seal = async () => {
    if (
      !hasInk ||
      !window.confirm(`Seal ${name}'s signature? This cannot be undone.`)
    )
      return;
    const signature = await exportPng();
    if (!signature) return;
    setSealing(true);
    setSealError('');
    try {
      await onSeal(signature);
    } catch (error) {
      setSealError(
        error instanceof Error
          ? error.message
          : 'The signature could not be sealed.',
      );
    } finally {
      setSealing(false);
    }
  };

  return (
    <article
      className={`${styles.signatureCard} ${party === 'party_a' ? styles.louay : styles.ameni}`}
    >
      <header className={styles.signatureHeader}>
        <div>
          <span className={styles.signatureLabel}>Signature of</span>
          <h3>{name}</h3>
        </div>
        <span className={sealed ? styles.sealedStatus : styles.draftStatus}>
          {sealed ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <PenLine size={14} aria-hidden="true" />
          )}
          {sealed
            ? 'Sealed'
            : editable
              ? 'Your signature'
              : 'Awaiting signature'}
        </span>
      </header>

      <div
        className={`${styles.canvasFrame} ${!editable ? styles.readOnly : ''}`}
      >
        {sealed && signatureUrl && (
          <img
            className={styles.signatureImage}
            src={signatureUrl}
            alt={`${name}'s sealed signature`}
          />
        )}
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label={`${name}'s ${editable ? 'editable' : 'read-only'} signature pad`}
          {...pointerHandlers}
          onPointerDown={(event) => {
            pointerHandlers.onPointerDown(event);
            if (editable) onSigningChange?.(true);
          }}
          onPointerUp={(event) => {
            pointerHandlers.onPointerUp(event);
            onSigningChange?.(false);
          }}
          onPointerCancel={(event) => {
            pointerHandlers.onPointerCancel(event);
            onSigningChange?.(false);
          }}
          onLostPointerCapture={(event) => {
            pointerHandlers.onLostPointerCapture(event);
            onSigningChange?.(false);
          }}
        />
        {!hasInk && !sealed && (
          <div className={styles.canvasPrompt} aria-hidden="true">
            {editable ? 'Sign here' : 'Waiting for their hand'}
          </div>
        )}
        {sealed && <div className={styles.sealStamp}>SEALED</div>}
        <div className={styles.signatureLine} />
      </div>

      <footer className={styles.signatureActions}>
        <span>
          {sealed
            ? 'Signed in this session'
            : editable
              ? 'Use a finger, stylus, or mouse'
              : 'Read only'}
        </span>
        {editable && (
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={clear}
              disabled={!hasInk || sealing}
              title="Clear signature"
            >
              <RotateCcw size={17} aria-hidden="true" />
              <span className="sr-only">Clear {name}'s signature</span>
            </button>
            <button
              type="button"
              className={styles.sealButton}
              onClick={seal}
              disabled={!hasInk}
            >
              <Check size={17} aria-hidden="true" />
              {sealing ? 'Sealing…' : 'Seal signature'}
            </button>
          </div>
        )}
      </footer>
      {sealError && <p role="alert">{sealError}</p>}
    </article>
  );
}
