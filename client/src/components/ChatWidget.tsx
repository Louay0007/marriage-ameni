import { MessageCircleMore, Send, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useContract } from '../app/ContractProvider';
import styles from './ChatWidget.module.css';

export function ChatWidget() {
  const { messages, sendMessage, contract, connection, toast } = useContract();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(body.trim());
      setBody('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Message failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {toast && !open && (
        <div className={styles.toast} role="status">
          <strong>
            {toast.sender === 'party_a'
              ? contract.partyAName
              : contract.partyBName}
          </strong>
          <span>{toast.body}</span>
        </div>
      )}
      {open && (
        <aside className={styles.panel} aria-label="Messages">
          <header>
            <div>
              <strong>Messages</strong>
              <span>{connection}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close messages"
            >
              <X size={18} />
            </button>
          </header>
          <div className={styles.log} aria-live="polite">
            {messages.length === 0 && (
              <p className={styles.empty}>A quiet beginning.</p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.sender === contract.authenticatedParty
                    ? styles.mine
                    : styles.theirs
                }
              >
                <strong>
                  {message.sender === 'party_a'
                    ? contract.partyAName
                    : contract.partyBName}
                </strong>
                <p>{message.body}</p>
              </div>
            ))}
          </div>
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="message">
              Message
            </label>
            <input
              id="message"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={500}
              placeholder="Write something…"
            />
            <button
              type="submit"
              disabled={
                contract.readOnly ||
                sending ||
                !body.trim() ||
                connection !== 'connected'
              }
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </aside>
      )}
      <button
        className={styles.trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close messages' : 'Open messages'}
      >
        <MessageCircleMore size={21} />
        <span>{messages.length}</span>
      </button>
    </>
  );
}
