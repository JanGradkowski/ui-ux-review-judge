// Like many detail pages: opening it marks the item as read, and an analytics beacon reports the visit.
fetch('/api/items/1/read', { method: 'POST' })
  .then(response => response.json())
  .then(() => { document.getElementById('status').textContent = 'Read'; })
  .catch(() => { document.getElementById('status').textContent = 'Could not mark as read'; });
navigator.sendBeacon('/api/beacon', 'visit');
fetch('/api/settings', { method: 'PATCH', body: '{"theme":"dark"}' });
