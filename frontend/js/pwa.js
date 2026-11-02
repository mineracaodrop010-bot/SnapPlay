// Gerenciamento de PWA e Instalação Mobile
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Exibir botão de instalação caso exista
  const installBtns = document.querySelectorAll('.pwa-install-btn');
  installBtns.forEach(btn => {
    btn.classList.remove('hidden');
    btn.addEventListener('click', installApp);
  });
  
  console.log('[PWA] Prompt de instalação pronto.');
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] SnapPlay instalado com sucesso!');
  deferredPrompt = null;
  const installBtns = document.querySelectorAll('.pwa-install-btn');
  installBtns.forEach(btn => btn.classList.add('hidden'));
  if (window.showToast) {
    window.showToast('SnapPlay instalado na sua tela inicial!', 'success');
  }
});

async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Escolha do usuário: ${outcome}`);
    deferredPrompt = null;
  } else {
    // Instruções manuais para iOS ou navegadores sem prompt direto
    alert('Para instalar no seu celular:\n1. Toque nos 3 pontinhos ou botão de compartilhar do navegador.\n2. Escolha "Adicionar à Tela de Início" ou "Instalar Aplicativo".');
  }
}

// Registrar Service Worker com verificação de atualização forçada
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=2.1')
      .then(reg => {
        reg.update();
        console.log('[PWA] Service Worker registrado e atualizado:', reg.scope);
      })
      .catch(err => console.log('[PWA] Falha ao registrar Service Worker:', err));
  });
}
