// sw.js - Service Worker Básico
self.addEventListener('install', (event) => {
    console.log('Service Worker instalado');
});

self.addEventListener('fetch', (event) => {
    // Permite que la app cumpla el requisito técnico de PWA
});