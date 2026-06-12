import { useEffect, useState } from 'react';
import { useToastStore } from '../stores/toastStore';

export default function Toast() {
  const message = useToastStore(s => s.message);
  const nonce = useToastStore(s => s.nonce);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(timer);
  }, [message, nonce]);

  return <div id="toast" className={visible ? 'show' : ''}>{message}</div>;
}
