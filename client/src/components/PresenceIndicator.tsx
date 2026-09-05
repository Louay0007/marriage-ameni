import { Circle } from 'lucide-react';
import styles from './Contract.module.css';

type PresenceIndicatorProps = {
  name: string;
  detail: string;
};

export function PresenceIndicator({ name, detail }: PresenceIndicatorProps) {
  return (
    <div className={styles.presence} aria-label={`${name}: ${detail}`}>
      <Circle size={8} fill="currentColor" aria-hidden="true" />
      <span>{name}</span>
      <span className={styles.presenceDetail}>{detail}</span>
    </div>
  );
}
