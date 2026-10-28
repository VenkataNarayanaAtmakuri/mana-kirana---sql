export default function OrderNotificationControl({ enabled, permission, onToggle }) {
  const unsupported = permission === 'unsupported'
  const blocked = permission === 'denied'
  return (
    <section className="order-notifications" aria-label="Order notifications">
      <div><strong>Order alerts</strong><p>{unsupported ? 'This browser does not support notifications.' : blocked ? 'Notifications are blocked. Allow them in your browser’s site settings.' : 'Get a browser alert for order updates while Mana Kirana is open.'}</p></div>
      {!unsupported && !blocked && <button className="btn" type="button" onClick={onToggle}>{enabled ? 'Disable alerts' : 'Enable alerts'}</button>}
    </section>
  )
}
