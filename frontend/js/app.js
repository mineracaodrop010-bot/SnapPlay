/**
 * SnapPlay - Frontend Application Logic
 * Suporte a Vídeos Individuais, Playlists, Abinha Flutuante e Download Automático no Aparelho
 */

const state = {
  currentTab: 'discover',
  searchQuery: '',
  isSearching: false,
  isAnalyzing: false,
  isSharedMode: false,
  searchResults: [],
  selectedMedia: null,
  activeDownloads: [],
  completedDownloads: [],
  pollingInterval: null,
  currentPlaying: null,
  networkInfo: null,
  autoSavedTasks: new Set(),
  // Estado para Vídeo Solo
  selectedSoloFormat: {
    format_id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    media_type: 'video',
    quality_label: 'Alta qualidade (1080p)'
  },
  // Estado para Playlists
  currentPlaylist: null,
  selectedPlaylistIndices: new Set(),
  selectedPlaylistFormat: {
    format_id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    media_type: 'video',
    quality_label: 'Alta qualidade (1080p)',
    rate_kbps: 4000
  }
};

const CURRENT_APP_VERSION = '2.1.0';

// Auto-limpeza de cache antigo para forçar atualização no celular
if (localStorage.getItem('snapplay_version') !== CURRENT_APP_VERSION) {
  localStorage.setItem('snapplay_version', CURRENT_APP_VERSION);
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
    });
  }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupEventListeners();
  loadNetworkInfo();
  loadCompletedDownloads();
  startPolling();
  handleIncomingSharedUrl();

  // Busca inicial de tendências se não for compartilhado
  if (!state.isSharedMode) {
    performSearch('top hits musicas 2026');
  }
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Trata links compartilhados pelo YouTube/TikTok no celular
function handleIncomingSharedUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawShared = params.get('url') || params.get('text') || params.get('title');
  
  if (rawShared) {
    state.isSharedMode = true;
    
    // Extrai URL do texto compartilhado
    const urlMatch = rawShared.match(/https?:\/\/[^\s]+/i);
    const targetUrl = urlMatch ? urlMatch[0] : rawShared.trim();
    
    if (targetUrl) {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = targetUrl;
      
      // Limpa URL da barra de endereços
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // No modo compartilhado no celular, ativa abinha flutuante estilo SnapTube sobre o YouTube
      prepareSharedOverlayMode();
      
      handleSearchOrAnalyze(targetUrl);
    }
  }
}

function prepareSharedOverlayMode() {
  document.body.classList.add('shared-overlay-mode');
}

function exitOverlayMode() {
  state.isSharedMode = false;
  document.body.classList.remove('shared-overlay-mode');
  const backBtn = document.getElementById('back-to-youtube-btn');
  const fullAppBtn = document.getElementById('open-full-app-btn');
  if (backBtn) backBtn.classList.add('hidden');
  if (fullAppBtn) fullAppBtn.classList.add('hidden');
}

function handleBackdropClick(event) {
  if (event.target && event.target.id === 'download-modal') {
    closeDownloadModal();
  }
}

function returnToYouTube() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.close();
  }
}

// Configuração de Event Listeners
function setupEventListeners() {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSearchOrAnalyze(searchInput.value.trim());
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDownloadModal();
      closePlaylistModal();
      closePlaylistFormatModal();
      closeQrModal();
      closePlayerModal();
    }
  });

  const pasteBtn = document.getElementById('paste-btn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', pasteFromClipboard);
  }
}

// Navegação entre abas
function switchTab(tabName) {
  state.currentTab = tabName;
  const tabs = ['discover', 'platforms', 'downloads'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      if (t === tabName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    
    const navBtns = document.querySelectorAll(`[data-tab-target="${t}"]`);
    navBtns.forEach(btn => {
      if (t === tabName) {
        btn.classList.add('text-amber-400', 'font-bold');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('text-amber-400', 'font-bold');
        btn.classList.add('text-slate-400');
      }
    });
  });

  if (tabName === 'downloads') {
    refreshDownloadsList();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Identifica se é link ou busca
async function handleSearchOrAnalyze(input) {
  if (!input) return;

  const isUrl = /^(http:\/\/|https:\/\/)/i.test(input) || 
                input.includes('youtube.com') || 
                input.includes('youtu.be') || 
                input.includes('tiktok.com') || 
                input.includes('instagram.com') || 
                input.includes('facebook.com') || 
                input.includes('twitter.com') || 
                input.includes('x.com');

  if (isUrl) {
    let cleanUrl = input;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    await analyzeUrl(cleanUrl);
  } else {
    await performSearch(input);
  }
}

// Analisar Link (Vídeo ou Playlist)
async function analyzeUrl(url) {
  state.isAnalyzing = true;
  showLoading("Carregando informações...");

  try {
    const response = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Não foi possível extrair dados da URL informada.');
    }

    const mediaInfo = await response.json();
    hideLoading();

    if (mediaInfo.is_playlist) {
      openPlaylistModal(mediaInfo);
    } else {
      openDownloadModal(mediaInfo);
    }
  } catch (error) {
    hideLoading();
    showToast(error.message || 'Erro ao processar o link.', 'error');
  } finally {
    state.isAnalyzing = false;
  }
}

// ==========================================
// SEÇÃO DE VÍDEO SOLO (IDÊNTICO À IMAGEM 2)
// ==========================================

function openDownloadModal(mediaInfo) {
  state.selectedMedia = mediaInfo;
  const modal = document.getElementById('download-modal');
  const sheet = document.getElementById('download-sheet');
  if (!modal || !sheet) return;

  const thumbEl = document.getElementById('modal-thumb');
  if (thumbEl) thumbEl.src = mediaInfo.thumbnail || '/assets/icon-192.png';

  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = mediaInfo.title || 'Vídeo';

  const authorEl = document.getElementById('modal-author');
  if (authorEl) authorEl.textContent = `${mediaInfo.uploader || 'YouTube'} • ${mediaInfo.duration_formatted || '00:00'}`;

  // Preenche tamanhos calculados com base nos formatos do vídeo
  const getFormatSize = (fmtId, defaultStr) => {
    const videoFmts = mediaInfo.video_formats || [];
    const audioFmts = mediaInfo.audio_formats || [];
    const all = [...videoFmts, ...audioFmts];
    const match = all.find(f => f.format_id === fmtId || (f.quality_label && f.quality_label.includes(fmtId)));
    return match ? (match.filesize_formatted || defaultStr) : defaultStr;
  };

  const elFastAudio = document.getElementById('solo-size-audio-fast');
  const elHqAudio = document.getElementById('solo-size-audio-hq');
  const el480Video = document.getElementById('solo-size-video-480');
  const el1080Video = document.getElementById('solo-size-video-1080');
  const el720Video = document.getElementById('solo-size-video-720');
  const elM4aAudio = document.getElementById('solo-size-audio-m4a');

  if (elFastAudio) elFastAudio.textContent = getFormatSize('mp3-128', '14,7 MB');
  if (elHqAudio) elHqAudio.textContent = getFormatSize('mp3-320', '16,6 MB');
  if (el480Video) el480Video.textContent = getFormatSize('480', '46,8 MB');
  if (el1080Video) el1080Video.textContent = getFormatSize('1080', '170,2 MB');
  if (el720Video) el720Video.textContent = getFormatSize('720', '98,4 MB');
  if (elM4aAudio) elM4aAudio.textContent = getFormatSize('m4a', '15,0 MB');

  // Seleção padrão: 1080p
  selectSoloFormat('bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', 'video', 'Alta qualidade (1080p)');

  // Se veio do compartilhamento, exibe botão para voltar ao YouTube e link para app completo
  const backBtn = document.getElementById('back-to-youtube-btn');
  const fullAppBtn = document.getElementById('open-full-app-btn');
  if (state.isSharedMode) {
    if (backBtn) backBtn.classList.remove('hidden');
    if (fullAppBtn) fullAppBtn.classList.remove('hidden');
  } else {
    if (backBtn) backBtn.classList.add('hidden');
    if (fullAppBtn) fullAppBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    sheet.classList.remove('closed');
    sheet.classList.add('open');
  }, 10);
  initIcons();
}

function selectSoloFormat(formatId, mediaType, qualityLabel) {
  state.selectedSoloFormat = {
    format_id: formatId,
    media_type: mediaType,
    quality_label: qualityLabel
  };

  document.querySelectorAll('input[name="solo_format_radio"]').forEach(radio => {
    radio.checked = (radio.value === formatId);
  });
}

function toggleSoloMoreFormats() {
  const container = document.getElementById('solo-more-formats');
  const btn = document.getElementById('btn-toggle-more-formats');
  if (!container) return;

  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if (btn) btn.innerHTML = '<span>Menos formatos</span><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>';
  } else {
    container.classList.add('hidden');
    if (btn) btn.innerHTML = '<span>Mais formatos (Todos)</span><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>';
  }
  initIcons();
}

function closeDownloadModal() {
  const modal = document.getElementById('download-modal');
  const sheet = document.getElementById('download-sheet');
  if (!modal || !sheet) return;

  sheet.classList.remove('open');
  sheet.classList.add('closed');
  setTimeout(() => {
    modal.classList.add('hidden');
    if (state.isSharedMode) {
      returnToYouTube();
    }
  }, 250);
}

// Disparar Download de Vídeo Solo com Download Automático no Aparelho
async function triggerSoloDownload() {
  if (!state.selectedMedia) return;

  const { webpage_url, title, thumbnail } = state.selectedMedia;
  const { format_id, media_type, quality_label } = state.selectedSoloFormat;

  closeDownloadModal();
  showToast(`Baixando ${qualityLabel}... O arquivo será salvo automaticamente!`, 'success');

  try {
    const res = await fetch('/api/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webpage_url,
        format_id: format_id,
        media_type: media_type,
        quality_label: quality_label,
        title: title,
        thumbnail: thumbnail
      })
    });

    if (!res.ok) {
      throw new Error('Não foi possível iniciar o download.');
    }

    // Se estiver no modo compartilhado do YouTube, oferece retorno imediato mantendo o usuário no YouTube
    if (state.isSharedMode) {
      showToast('✓ Download iniciado! Voltando ao YouTube...', 'success');
      setTimeout(() => {
        returnToYouTube();
      }, 1200);
    } else {
      switchTab('downloads');
      refreshDownloadsList();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// SEÇÃO DE DOWNLOAD DE PLAYLIST (IMAGENS 2 E 3)
// ==========================================

function openPlaylistModal(playlistInfo) {
  state.currentPlaylist = playlistInfo;
  state.selectedPlaylistIndices = new Set(playlistInfo.playlist_items.map((_, idx) => idx));

  const modal = document.getElementById('playlist-modal');
  if (!modal) return;

  const titleHeader = document.getElementById('playlist-title-header');
  if (titleHeader) titleHeader.textContent = playlistInfo.title || 'Playlist';
  
  const selectAllCheckbox = document.getElementById('playlist-select-all');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.onchange = (e) => toggleSelectAllPlaylist(e.target.checked);
  }

  renderPlaylistItems();
  updatePlaylistDownloadButton();

  modal.classList.remove('hidden');
  initIcons();
}

function closePlaylistModal() {
  const modal = document.getElementById('playlist-modal');
  if (modal) modal.classList.add('hidden');
}

function renderPlaylistItems() {
  const listEl = document.getElementById('playlist-items-list');
  if (!listEl || !state.currentPlaylist) return;

  listEl.innerHTML = '';

  state.currentPlaylist.playlist_items.forEach((item, idx) => {
    const isSelected = state.selectedPlaylistIndices.has(idx);
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors cursor-pointer group';
    row.onclick = (e) => {
      if (e.target.type !== 'checkbox') {
        togglePlaylistItem(idx);
      }
    };

    const thumb = item.thumbnail || '/assets/icon-192.png';

    row.innerHTML = `
      <input type="checkbox" class="snap-checkbox" ${isSelected ? 'checked' : ''} onchange="togglePlaylistItem(${idx})"/>
      
      <div class="relative w-24 h-14 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0">
        <img src="${thumb}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover" onerror="this.src='/assets/icon-192.png'"/>
        <div class="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 text-[10px] font-bold text-white">
          ${item.duration_formatted}
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-xs text-slate-400 font-bold mb-0.5">
          ${item.index}.
        </div>
        <h4 class="font-bold text-xs text-slate-100 line-clamp-2 leading-tight group-hover:text-amber-400 transition-colors" title="${escapeHtml(item.title)}">
          ${escapeHtml(item.title)}
        </h4>
        <div class="text-[11px] text-slate-400 mt-1 truncate">
          ${escapeHtml(item.uploader || '')}
        </div>
      </div>
    `;

    listEl.appendChild(row);
  });
}

function togglePlaylistItem(idx) {
  if (state.selectedPlaylistIndices.has(idx)) {
    state.selectedPlaylistIndices.delete(idx);
  } else {
    state.selectedPlaylistIndices.add(idx);
  }

  const selectAllCheckbox = document.getElementById('playlist-select-all');
  if (selectAllCheckbox && state.currentPlaylist) {
    selectAllCheckbox.checked = (state.selectedPlaylistIndices.size === state.currentPlaylist.playlist_items.length);
  }

  renderPlaylistItems();
  updatePlaylistDownloadButton();
}

function toggleSelectAllPlaylist(isChecked) {
  if (!state.currentPlaylist) return;
  if (isChecked) {
    state.selectedPlaylistIndices = new Set(state.currentPlaylist.playlist_items.map((_, idx) => idx));
  } else {
    state.selectedPlaylistIndices.clear();
  }
  renderPlaylistItems();
  updatePlaylistDownloadButton();
}

function updatePlaylistDownloadButton() {
  const count = state.selectedPlaylistIndices.size;
  const btn = document.getElementById('playlist-download-btn');
  const btnText = document.getElementById('playlist-download-btn-text');
  
  if (btn && btnText) {
    btnText.textContent = `Baixar (${count})`;
    btn.disabled = (count === 0);
    if (count === 0) {
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

function openPlaylistFormatSelector() {
  if (state.selectedPlaylistIndices.size === 0) {
    showToast('Selecione pelo menos 1 vídeo da playlist.', 'info');
    return;
  }

  const modal = document.getElementById('playlist-format-modal');
  const sheet = document.getElementById('playlist-format-sheet');
  if (!modal || !sheet) return;

  updatePlaylistCalculatedSizes();

  modal.classList.remove('hidden');
  setTimeout(() => {
    sheet.classList.remove('closed');
    sheet.classList.add('open');
  }, 10);
  initIcons();
}

function closePlaylistFormatModal() {
  const modal = document.getElementById('playlist-format-modal');
  const sheet = document.getElementById('playlist-format-sheet');
  if (!modal || !sheet) return;

  sheet.classList.remove('open');
  sheet.classList.add('closed');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 250);
}

function calculateSelectedDuration() {
  if (!state.currentPlaylist) return 0;
  let totalSec = 0;
  state.selectedPlaylistIndices.forEach(idx => {
    const item = state.currentPlaylist.playlist_items[idx];
    if (item && item.duration) totalSec += item.duration;
    else totalSec += 240;
  });
  return totalSec;
}

function formatPlaylistBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `≈${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
  }
  return `≈${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function updatePlaylistCalculatedSizes() {
  const totalSec = calculateSelectedDuration();

  const sizeAudioFast = (128 * 1024 / 8) * totalSec;
  const sizeAudioHq = (320 * 1024 / 8) * totalSec;
  const sizeVideo480 = (1200 * 1024 / 8) * totalSec;
  const sizeVideo1080 = (4000 * 1024 / 8) * totalSec;

  const elAudioFast = document.getElementById('size-audio-fast');
  const elAudioHq = document.getElementById('size-audio-hq');
  const elVideo480 = document.getElementById('size-video-480');
  const elVideo1080 = document.getElementById('size-video-1080');

  if (elAudioFast) elAudioFast.textContent = formatPlaylistBytes(sizeAudioFast);
  if (elAudioHq) elAudioHq.textContent = formatPlaylistBytes(sizeAudioHq);
  if (elVideo480) elVideo480.textContent = formatPlaylistBytes(sizeVideo480);
  if (elVideo1080) elVideo1080.textContent = formatPlaylistBytes(sizeVideo1080);

  const count = state.selectedPlaylistIndices.size;
  const confirmBtn = document.getElementById('playlist-confirm-download-btn');
  if (confirmBtn) {
    confirmBtn.textContent = `Baixar (${count} vídeos)`;
  }
}

function selectPlaylistFormat(formatId, mediaType, qualityLabel, rateKbps) {
  state.selectedPlaylistFormat = {
    format_id: formatId,
    media_type: mediaType,
    quality_label: qualityLabel,
    rate_kbps: rateKbps
  };

  document.querySelectorAll('input[name="playlist_format_radio"]').forEach(radio => {
    radio.checked = (radio.value === formatId);
  });
}

async function triggerBatchDownload() {
  if (!state.currentPlaylist || state.selectedPlaylistIndices.size === 0) return;

  const selectedItems = Array.from(state.selectedPlaylistIndices).map(idx => state.currentPlaylist.playlist_items[idx]);
  const format = state.selectedPlaylistFormat;

  closePlaylistFormatModal();
  closePlaylistModal();

  showToast(`Iniciando download de ${selectedItems.length} vídeos da playlist...`, 'info');

  try {
    const res = await fetch('/api/playlist/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: selectedItems,
        format_id: format.format_id,
        media_type: format.media_type,
        quality_label: format.quality_label,
        playlist_title: state.currentPlaylist.title
      })
    });

    if (!res.ok) {
      throw new Error('Falha ao iniciar downloads da playlist.');
    }

    const data = await res.json();
    showToast(`${data.count} downloads foram adicionados à fila!`, 'success');
    
    if (state.isSharedMode) {
      showToast('✓ Downloads iniciados! Voltando ao YouTube...', 'success');
      setTimeout(() => returnToYouTube(), 1200);
    } else {
      switchTab('downloads');
      refreshDownloadsList();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// POLLING E DOWNLOAD AUTOMÁTICO NO APARELHO
// ==========================================

function startPolling() {
  if (state.pollingInterval) clearInterval(state.pollingInterval);
  state.pollingInterval = setInterval(refreshDownloadsList, 1500);
}

// Salva o arquivo diretamente no aparelho do usuário assim que concluído
function triggerBrowserDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`✓ Arquivo "${filename}" salvo no seu aparelho!`, 'success');
}

async function refreshDownloadsList() {
  try {
    const res = await fetch('/api/downloads');
    if (!res.ok) return;

    const tasks = await res.json();
    const active = tasks.filter(t => t.status === 'downloading' || t.status === 'processing' || t.status === 'queued');
    const completed = tasks.filter(t => t.status === 'completed' || t.status === 'error');

    state.activeDownloads = active;
    state.completedDownloads = completed;

    // Dispara salvamento automático no aparelho quando o servidor finalizar
    completed.forEach(task => {
      if (task.status === 'completed' && !state.autoSavedTasks.has(task.task_id)) {
        state.autoSavedTasks.add(task.task_id);
        triggerBrowserDownload(task.download_url, task.filename);
      }
    });

    const badge = document.getElementById('downloads-badge');
    if (badge) {
      if (active.length > 0) {
        badge.textContent = active.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    renderActiveDownloads(active);
    renderCompletedDownloads(completed);
  } catch (e) {
    console.error('Erro no polling de downloads:', e);
  }
}

function renderActiveDownloads(tasks) {
  const container = document.getElementById('active-downloads-list');
  const section = document.getElementById('active-downloads-section');
  if (!container || !section) return;

  if (tasks.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = '';

  tasks.forEach(task => {
    const el = document.createElement('div');
    el.className = 'p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex flex-col gap-3';

    const isAudio = task.media_type === 'audio';
    const iconName = isAudio ? 'music' : 'video';
    const statusText = task.status === 'queued' ? 'Na fila...' :
                       task.status === 'processing' ? 'Convertendo e finalizando...' :
                       `Baixando (${task.speed || ''})`;

    el.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-slate-800 flex-shrink-0 overflow-hidden relative">
          <img src="${task.thumbnail || ''}" class="w-full h-full object-cover" onerror="this.src='/assets/icon-192.png'"/>
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
            <i data-lucide="${iconName}" class="w-5 h-5 text-amber-400"></i>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-sm text-slate-100 truncate">${escapeHtml(task.title)}</h4>
          <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span class="text-amber-400 font-semibold">${task.quality_label}</span>
            <span>•</span>
            <span>${statusText}</span>
          </div>
        </div>
        <div class="text-right">
          <span class="font-extrabold text-sm text-amber-400">${Math.round(task.progress)}%</span>
        </div>
      </div>

      <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
        <div class="h-full rounded-full progress-shimmer transition-all duration-300" style="width: ${Math.max(5, task.progress)}%"></div>
      </div>
    `;
    container.appendChild(el);
  });

  initIcons();
}

function renderCompletedDownloads(tasks) {
  const container = document.getElementById('completed-downloads-list');
  const emptyState = document.getElementById('downloads-empty');
  if (!container) return;

  const valid = tasks.filter(t => t.status === 'completed');
  if (valid.length === 0 && state.activeDownloads.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  container.innerHTML = '';

  valid.forEach(task => {
    const el = document.createElement('div');
    el.className = 'p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between gap-3 group';

    const isAudio = task.media_type === 'audio';
    const mediaStreamUrl = `/media/${encodeURIComponent(task.filename)}`;
    const downloadFileUrl = `/api/download/file/${task.task_id}`;

    el.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="w-12 h-12 rounded-xl bg-slate-800 flex-shrink-0 overflow-hidden relative cursor-pointer" onclick="playMediaFile('${mediaStreamUrl}', '${escapeHtml(task.title)}', '${task.quality_label}', '${task.thumbnail}', ${isAudio})">
          <img src="${task.thumbnail || ''}" class="w-full h-full object-cover" onerror="this.src='/assets/icon-192.png'"/>
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
            <i data-lucide="play" class="w-5 h-5 text-amber-400 fill-amber-400"></i>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="font-bold text-sm text-slate-100 truncate group-hover:text-amber-400 transition-colors cursor-pointer" onclick="playMediaFile('${mediaStreamUrl}', '${escapeHtml(task.title)}', '${task.quality_label}', '${task.thumbnail}', ${isAudio})">
            ${escapeHtml(task.title)}
          </h4>
          <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[10px]">${task.quality_label}</span>
            <span>•</span>
            <span>${task.filesize_formatted || 'Salvo'}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="playMediaFile('${mediaStreamUrl}', '${escapeHtml(task.title)}', '${task.quality_label}', '${task.thumbnail}', ${isAudio})" class="p-2.5 rounded-xl bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-slate-200 transition-all" title="Reproduzir no App">
          <i data-lucide="play" class="w-4 h-4"></i>
        </button>

        <a href="${downloadFileUrl}" download class="p-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition-all shadow-md shadow-amber-400/20" title="Baixar novamente">
          <i data-lucide="download" class="w-4 h-4"></i>
        </a>
      </div>
    `;
    container.appendChild(el);
  });

  initIcons();
}

// ==========================================
// BUSCA E RENDERIZAÇÃO DE VÍDEOS
// ==========================================

async function performSearch(query) {
  if (!query) return;
  state.isSearching = true;
  state.searchQuery = query;
  
  switchTab('discover');

  const resultsGrid = document.getElementById('search-results-grid');
  const skeletonEl = document.getElementById('search-skeleton');
  const emptyState = document.getElementById('search-empty');

  if (skeletonEl) skeletonEl.classList.remove('hidden');
  if (resultsGrid) resultsGrid.innerHTML = '';
  if (emptyState) emptyState.classList.add('hidden');

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 16 })
    });

    if (!response.ok) {
      throw new Error('Falha na busca.');
    }

    const items = await response.json();
    state.searchResults = items;
    renderSearchResults(items);
  } catch (error) {
    showToast('Erro ao realizar busca: ' + error.message, 'error');
    if (emptyState) emptyState.classList.remove('hidden');
  } finally {
    if (skeletonEl) skeletonEl.classList.add('hidden');
    state.isSearching = false;
  }
}

function renderSearchResults(items) {
  const container = document.getElementById('search-results-grid');
  const emptyState = document.getElementById('search-empty');
  if (!container) return;

  container.innerHTML = '';

  if (!items || items.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'video-card bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col group';
    
    const thumbUrl = item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
    
    card.innerHTML = `
      <div class="relative w-full aspect-video bg-slate-950 overflow-hidden cursor-pointer" onclick="analyzeUrl('${item.url}')">
        <img src="${thumbUrl}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'"/>
        <div class="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[11px] font-bold text-white tracking-wider">
          ${item.duration_formatted || '00:00'}
        </div>
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div class="w-12 h-12 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-400/30 transform scale-90 group-hover:scale-100 transition-transform">
            <i data-lucide="download" class="w-6 h-6"></i>
          </div>
        </div>
      </div>
      
      <div class="p-3.5 flex flex-col flex-1 justify-between">
        <div>
          <h3 class="font-bold text-sm text-slate-100 line-clamp-2 leading-snug group-hover:text-amber-400 transition-colors cursor-pointer" onclick="analyzeUrl('${item.url}')" title="${escapeHtml(item.title)}">
            ${escapeHtml(item.title)}
          </h3>
          <p class="text-xs text-slate-400 mt-1 flex items-center gap-1.5 truncate">
            <span>${escapeHtml(item.uploader)}</span>
            <span class="text-slate-600">•</span>
            <span>${item.views || ''}</span>
          </p>
        </div>

        <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <button onclick="analyzeUrl('${item.url}')" class="flex-1 py-1.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-400/20">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Baixar</span>
          </button>
          
          <button onclick="openExternalLink('${item.url}')" class="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors" title="Abrir Link Original">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  initIcons();
}

// Media Player
function playMediaFile(url, title, quality, thumb, isAudio) {
  const playerBar = document.getElementById('global-player-bar');
  const audioElement = document.getElementById('global-audio-element');
  const videoModal = document.getElementById('video-player-modal');
  const videoElement = document.getElementById('modal-video-element');

  if (!isAudio) {
    if (audioElement) audioElement.pause();
    if (videoModal && videoElement) {
      videoElement.src = url;
      document.getElementById('video-modal-title').textContent = title;
      videoModal.classList.remove('hidden');
      videoElement.play();
    }
  } else {
    if (videoElement) videoElement.pause();
    if (playerBar && audioElement) {
      audioElement.src = url;
      document.getElementById('player-track-title').textContent = title;
      document.getElementById('player-track-sub').textContent = quality;
      document.getElementById('player-track-thumb').src = thumb || '/assets/icon-192.png';
      playerBar.classList.remove('hidden');
      audioElement.play();
      updatePlayerPlayIcon(true);
    }
  }
}

function toggleAudioPlay() {
  const audio = document.getElementById('global-audio-element');
  if (!audio) return;
  if (audio.paused) {
    audio.play();
    updatePlayerPlayIcon(true);
  } else {
    audio.pause();
    updatePlayerPlayIcon(false);
  }
}

function updatePlayerPlayIcon(isPlaying) {
  const icon = document.getElementById('player-play-icon');
  if (!icon) return;
  if (isPlaying) {
    icon.setAttribute('data-lucide', 'pause');
  } else {
    icon.setAttribute('data-lucide', 'play');
  }
  initIcons();
}

function closeAudioPlayer() {
  const playerBar = document.getElementById('global-player-bar');
  const audio = document.getElementById('global-audio-element');
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  if (playerBar) playerBar.classList.add('hidden');
}

function closePlayerModal() {
  const videoModal = document.getElementById('video-player-modal');
  const videoElement = document.getElementById('modal-video-element');
  if (videoElement) {
    videoElement.pause();
    videoElement.src = '';
  }
  if (videoModal) videoModal.classList.add('hidden');
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = text;
        handleSearchOrAnalyze(text);
      }
    }
  } catch (err) {
    showToast('Permissão de colar não concedida. Pressione Ctrl+V.', 'info');
  }
}

async function loadNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    if (!res.ok) return;
    const info = await res.json();
    state.networkInfo = info;

    const qrImg = document.getElementById('qr-image');
    const mobileLink = document.getElementById('mobile-connect-link');
    if (qrImg) qrImg.src = info.qr_code_base64;
    if (mobileLink) {
      mobileLink.textContent = info.mobile_url;
      mobileLink.href = info.mobile_url;
    }
  } catch (e) {
    console.error('Erro ao carregar network info:', e);
  }
}

function openQrModal() {
  const modal = document.getElementById('qr-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeQrModal() {
  const modal = document.getElementById('qr-modal');
  if (modal) modal.classList.add('hidden');
}

function copyMobileUrl() {
  if (state.networkInfo?.mobile_url) {
    navigator.clipboard.writeText(state.networkInfo.mobile_url);
    showToast('Endereço copiado!', 'success');
  }
}

function openExternalLink(url) {
  window.open(url, '_blank');
}

function showLoading(text) {
  const loader = document.getElementById('global-loader');
  const loaderText = document.getElementById('global-loader-text');
  if (loaderText) loaderText.textContent = text || 'Carregando...';
  if (loader) loader.classList.remove('hidden');
}

function hideLoading() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  if (!toast || !toastText) return;

  toastText.textContent = message;
  
  if (type === 'error') {
    toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-rose-600 text-white font-medium shadow-2xl flex items-center gap-2.5 transition-all text-sm';
  } else if (type === 'success') {
    toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-medium shadow-2xl flex items-center gap-2.5 transition-all text-sm';
  } else {
    toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-amber-500 text-slate-950 font-semibold shadow-2xl flex items-center gap-2.5 transition-all text-sm';
  }

  try {
    initIcons();
  } catch (e) {}

  toast.classList.remove('hidden', 'opacity-0', '-translate-y-4');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-4');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function loadCompletedDownloads() {
  refreshDownloadsList();
}
