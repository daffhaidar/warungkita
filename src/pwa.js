/**
 * WarungKita — pwa.js
 * PWA install prompt, service worker registration
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- PWA INSTALL PROMPT ----
let deferredInstallPrompt = null;
let installShown = false;

function tryShowInstallBanner() {
  if (installShown) return;
  if (localStorage.getItem('warungkita_install_dismissed') === '1') return;
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.classList.add('show');
  installShown = true;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show banner: onboarding -> 4s, main chat -> 8s (after user has had a chance to interact)
  const inMainChat = document.getElementById('main-chat')?.classList.contains('active');
  const delay = inMainChat ? 8000 : 4000;
  setTimeout(tryShowInstallBanner, delay);
});

// Re-show in main chat if user navigates from onboarding without seeing it
// (covers case where beforeinstallprompt fired late)
window.addEventListener('DOMContentLoaded', () => {
  const mainChat = document.getElementById('main-chat');
  if (!mainChat) return;
  const observer = new MutationObserver(() => {
    if (mainChat.classList.contains('active') && deferredInstallPrompt && !installShown) {
      setTimeout(tryShowInstallBanner, 6000);
    }
  });
  observer.observe(mainChat, {attributes: true, attributeFilter: ['class']});
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.remove('show');
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  const installClose = document.getElementById('installClose');
  const installManual = document.getElementById('btnInstallManual');

  // Show manual install button in header whenever prompt is available
  // (works even if banner was dismissed)
  const showManualIfPossible = () => {
    if (installManual && deferredInstallPrompt) {
      installManual.style.display = 'flex';
    }
  };

  // Always show manual install button — give user a way to trigger it
  // even before beforeinstallprompt fires (Chrome can take 30+ seconds
  // to fire it on first visit). Behavior adapts based on prompt availability.
  if (installManual) {
    installManual.style.display = 'flex';
  }

  if (installBtn) {
    installBtn.onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        document.getElementById('installBanner').classList.remove('show');
        if (installManual) installManual.style.display = 'none';
      }
      deferredInstallPrompt = null;
    };
  }
  if (installManual) {
    installManual.onclick = async () => {
      if (!deferredInstallPrompt) {
        // iOS Safari path — show instructions modal
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          alert('Pasang di iPhone:\n1. Tap tombol Share (kotak dengan panah ke atas)\n2. Scroll ke bawah, pilih "Add to Home Screen"\n3. Tap "Add" ✅');
        } else {
          alert('Browser lo belum support install prompt otomatis. Buka menu browser → "Add to Home Screen" / "Install App".');
        }
        return;
      }
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        if (installManual) installManual.style.display = 'none';
        const banner = document.getElementById('installBanner');
        if (banner) banner.classList.remove('show');
      }
      deferredInstallPrompt = null;
    };
  }
  // Periodically check if prompt became available (Android fires it lazily)
  setInterval(showManualIfPossible, 2000);
  showManualIfPossible();
  if (installClose) {
    installClose.onclick = () => {
      const banner = document.getElementById('installBanner');
      if (banner) banner.classList.remove('show');
      localStorage.setItem('warungkita_install_dismissed', '1');
    };
  }
  // Quick-action chip scroll fade — toggle class when at end of scroll
  const qa = document.getElementById('quickActions');
  if (qa) {
    const updateScroll = () => {
      const needsScroll = qa.scrollWidth > qa.clientWidth + 4;
      const atEnd = qa.scrollLeft + qa.clientWidth >= qa.scrollWidth - 4;
      qa.classList.toggle('scrolled-end', atEnd);
      qa.classList.toggle('no-scroll', !needsScroll);
    };
    qa.addEventListener('scroll', updateScroll, {passive:true});
    setTimeout(updateScroll, 300);
    window.addEventListener('resize', updateScroll);
  }
});

// ---- SERVICE WORKER ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Detect SW updates — when new SW is found and installed,
      // force it to take over immediately and reload to get fresh UI.
      reg.addEventListener('updatefound', () => {
        const newSw = reg.installing;
        if (!newSw) return;
        newSw.addEventListener('statechange', () => {
          if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed while old one is controlling — take over now
            newSw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      // If there's already a waiting SW (deployed earlier, user just reopened),
      // activate it immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }).catch(() => {});

    // When new SW takes control, reload to get fresh UI
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

