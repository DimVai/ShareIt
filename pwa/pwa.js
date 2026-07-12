'use strict';

// on window load, register the service worker 
window.addEventListener('load', function(event) {
    if ('serviceWorker' in navigator) {
        // Relative path works on any hosting subpath (e.g. GitHub Pages)
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.debug('service worker registered', reg))
            .catch(err => console.debug('service worker not registered', err));
    }
});