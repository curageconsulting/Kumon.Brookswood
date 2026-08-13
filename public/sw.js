// public/sw.js — service worker for Kumon Brookswood admin push alerts
self.addEventListener('push', (event) => {
  let data = { title: '⏰ Kumon Brookswood', body: 'Class time alert' }
  try { data = event.data.json() } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/kumon-logo.png',
      badge: '/kumon-logo.png',
      tag: data.tag || 'overstay',
      requireInteraction: true,
      data: { url: data.url || '/admin/planning' },
    })
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/admin/planning'))
})
