(() => {
  let notice;
  let timer;

  window.showCorvianeBasketNotice = message => {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-atomic', 'true');
      Object.assign(notice.style, {
        position: 'fixed',
        insetInlineStart: '50%',
        bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100vw - 2rem)',
        width: 'max-content',
        zIndex: '100000',
        padding: '.75rem 1rem',
        borderRadius: '.5rem',
        background: '#171717',
        color: '#fff',
        boxShadow: '0 4px 16px #0003',
        textAlign: 'center',
        pointerEvents: 'none'
      });
      document.body.append(notice);
    }

    clearTimeout(timer);
    notice.textContent = message;
    notice.hidden = false;
    timer = setTimeout(() => {
      notice.textContent = '';
      notice.hidden = true;
    }, 2000);
  };
})();
