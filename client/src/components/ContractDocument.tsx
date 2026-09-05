import { Heart } from 'lucide-react';
import type { Party } from '@marriage/shared';
import { useContract } from '../app/ContractProvider';
import { ChatWidget } from './ChatWidget';
import { FinalizedBanner } from './FinalizedBanner';
import { PresenceIndicator } from './PresenceIndicator';
import { SignaturePad } from './SignaturePad';
import styles from './Contract.module.css';

const promises = [
  [
    'I. A Shared Life',
    'We choose one another freely and wholly, with laughter in the light days and patience in the difficult ones.',
  ],
  [
    'II. A Gentle Home',
    'We promise to make a home where honesty is welcome, kindness is practiced, and neither heart must carry its burdens alone.',
  ],
  [
    'III. The Everyday Vow',
    'We will protect time for small joys: slow mornings, long conversations, familiar songs, and meals made with care.',
  ],
  [
    'IV. A Living Promise',
    'We accept that love is not a finished thing, but a choice renewed in attention, courage, forgiveness, and wonder.',
  ],
] as const;

export function ContractDocument() {
  const { contract, connection, presence, updatePresence, sealSignature } =
    useContract();
  const currentParty = contract.authenticatedParty;
  const sealedParties = new Set<Party>([
    ...(contract.partyASealedAt ? (['party_a'] as const) : []),
    ...(contract.partyBSealedAt ? (['party_b'] as const) : []),
  ]);
  const bothSealed = sealedParties.size === 2;
  const otherParty = currentParty === 'party_a' ? 'party_b' : 'party_a';

  return (
    <div className={styles.appShell}>
      <header className={styles.topBar}>
        <a
          className={styles.wordmark}
          href="#contract"
          aria-label="Louay and Ameni contract"
        >
          <Heart size={16} fill="currentColor" aria-hidden="true" />L{' '}
          <span>&amp;</span> A
        </a>
        <div
          className={styles.demoIdentity}
          aria-label="Authenticated identity"
        >
          <span>{contract.readOnly ? 'Viewing as' : 'Signing as'}</span>
          <strong>
            {contract.readOnly
              ? 'Guest'
              : currentParty === 'party_a'
                ? contract.partyAName
                : contract.partyBName}
          </strong>
        </div>
        <PresenceIndicator
          name={
            contract.readOnly
              ? `${contract.partyAName} & ${contract.partyBName}`
              : otherParty === 'party_a'
                ? contract.partyAName
                : contract.partyBName
          }
          detail={
            connection === 'connected'
              ? contract.readOnly
                ? `${presence.party_a} / ${presence.party_b}`
                : presence[otherParty]
              : connection
          }
        />
      </header>

      <main className={styles.page}>
        {bothSealed && (
          <FinalizedBanner
            status={contract.finalizationStatus}
            pdfUrl={contract.pdfUrl}
          />
        )}
        <div className={`${styles.paper} mc-paper`}>
          <article id="contract" className={styles.document}>
            <div className={styles.corner} aria-hidden="true">
              LA
            </div>
            <header className={styles.documentHeader}>
              <p className={styles.eyebrow}>A promise made with intention</p>
              <h1>Our Marriage Contract</h1>
              <div className={styles.names}>
                <span>Louay</span>
                <Heart size={19} fill="currentColor" aria-hidden="true" />
                <span>Ameni</span>
              </div>
              <p className={styles.intro}>
                On this day, we set down the promises we intend to carry into
                every day that follows.
              </p>
            </header>

            <div className={styles.ornament} aria-hidden="true">
              <span />◆<span />
            </div>

            <section className={styles.promises} aria-label="Our promises">
              {promises.map(([title, body]) => (
                <div className={styles.promise} key={title}>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </div>
              ))}
            </section>

            <blockquote className={styles.closingPromise}>
              “Whatever the years bring, may we always turn toward one another.”
            </blockquote>

            <section className={styles.signatureGrid} aria-label="Signatures">
              <SignaturePad
                name={contract.partyAName}
                party="party_a"
                isCurrentParty={
                  !contract.readOnly && currentParty === 'party_a'
                }
                sealed={sealedParties.has('party_a')}
                signatureUrl={contract.partyASignatureUrl}
                onSeal={sealSignature}
                onSigningChange={(signing) => {
                  if (currentParty === 'party_a')
                    updatePresence(signing ? 'signing' : 'online');
                }}
              />
              <SignaturePad
                name={contract.partyBName}
                party="party_b"
                isCurrentParty={
                  !contract.readOnly && currentParty === 'party_b'
                }
                sealed={sealedParties.has('party_b')}
                signatureUrl={contract.partyBSignatureUrl}
                onSeal={sealSignature}
                onSigningChange={(signing) => {
                  if (currentParty === 'party_b')
                    updatePresence(signing ? 'signing' : 'online');
                }}
              />
            </section>

            <footer className={styles.documentFooter}>
              <span>Created for Louay &amp; Ameni</span>
              <span>
                This is a ceremonial keepsake, not a legal e-signature
                instrument.
              </span>
            </footer>
          </article>
        </div>
      </main>
      <ChatWidget />
    </div>
  );
}
