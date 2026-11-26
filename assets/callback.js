// Never exchange live authorization codes while activation is disabled.
history.replaceState(null,'',location.pathname);
document.querySelector('#callback-state').textContent='Account activation is disabled. No authorization code was exchanged.';
