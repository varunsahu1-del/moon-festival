(function () {
  const overlay = document.createElement('div');
  overlay.id = 'docsModalOverlay';
  overlay.style.cssText = [
    'display:none;position:fixed;inset:0;z-index:99999',
    'background:rgba(10,5,2,0.88)',
    'align-items:center;justify-content:center',
    'padding:1.2rem',
  ].join(';');

  overlay.innerHTML = `
    <div style="
      position:relative;width:100%;max-width:780px;height:90vh;
      background:#1a1007;border:1px solid rgba(176,96,48,0.35);
      border-radius:6px;display:flex;flex-direction:column;overflow:hidden;
    ">
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:0.9rem 1.2rem;border-bottom:1px solid rgba(237,212,178,0.12);
        flex-shrink:0;
      ">
        <span id="docsModalTitle" style="
          font-family:'Josefin Sans',sans-serif;font-size:0.78rem;
          font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#EDD4B2;
        "></span>
        <button onclick="closeDocsModal()" style="
          background:none;border:none;cursor:pointer;padding:0.3rem;
          color:rgba(237,212,178,0.5);font-size:1.4rem;line-height:1;
          transition:color 0.2s;
        " onmouseover="this.style.color='#EDD4B2'" onmouseout="this.style.color='rgba(237,212,178,0.5)'">&times;</button>
      </div>
      <iframe id="docsModalFrame" src="" style="flex:1;border:none;width:100%;" title="Document"></iframe>
      <div style="
        padding:0.8rem 1.2rem;border-top:1px solid rgba(237,212,178,0.12);
        flex-shrink:0;display:flex;justify-content:flex-end;
      ">
        <button onclick="closeDocsModal()" style="
          font-family:'Josefin Sans',sans-serif;font-size:0.72rem;font-weight:700;
          letter-spacing:0.18em;text-transform:uppercase;
          background:none;border:1px solid rgba(176,96,48,0.5);
          color:#B06030;padding:0.5rem 1.4rem;border-radius:3px;cursor:pointer;
          transition:all 0.2s;
        " onmouseover="this.style.borderColor='#B06030';this.style.color='#EDD4B2'"
           onmouseout="this.style.borderColor='rgba(176,96,48,0.5)';this.style.color='#B06030'">
          Close
        </button>
      </div>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDocsModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDocsModal();
    });
  });

  window.openDocsModal = function (type) {
    const titles = { terms: 'Terms & Conditions', privacy: 'Privacy Policy' };
    const pages  = { terms: 'terms.html', privacy: 'privacy.html' };
    document.getElementById('docsModalTitle').textContent = titles[type] || '';
    document.getElementById('docsModalFrame').src = pages[type] || '';
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.closeDocsModal = function () {
    overlay.style.display = 'none';
    document.getElementById('docsModalFrame').src = '';
    document.body.style.overflow = '';
  };
})();
