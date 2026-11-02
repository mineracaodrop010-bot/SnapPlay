# 🚀 SnapPlay (Seu Próprio App SnapTube)

> **SnapPlay** é o seu aplicativo multiplataforma completo para pesquisar, reproduzir e baixar vídeos, músicas e **Playlists inteiras** de qualquer plataforma (YouTube, TikTok, Instagram Reels, Facebook, Twitter/X, SoundCloud e mais de 1.000 sites), funcionando com interface moderna tanto no seu **Notebook** quanto no seu **Celular**!

---

## 📸 Funcionalidades Inspiradas no SnapTube

- 📑 **Download Completo de Playlists (Novo!)**:
  - Compartilhe ou cole o link de qualquer playlist (pública ou não listada).
  - Tela idêntica ao SnapTube com **"Selecionar tudo"**, contadores, números de faixa e miniaturas.
  - Seletor de qualidade em lote (**Música: Rápido, MP3 Clássico** e **Vídeo: 1080p, 720p, 480p**) com estimativa automática do tamanho total em MB ou GB.
  - Baixe todos os vídeos selecionados de uma só vez para o seu celular ou computador!
- 📲 **Compartilhamento Direto no Celular (Android Share Target)**:
  - No celular, ao tocar em **"Compartilhar"** dentro do aplicativo do YouTube, TikTok ou Instagram, o **SnapPlay** aparece diretamente na lista de aplicativos para baixar na hora!
- 🎬 **Downloads Individuais em Múltiplas Qualidades**: 1080p Full HD, 720p HD, 480p SD, 360p e 240p.
- 🎵 **Extrator de Áudio MP3 & M4A**: Conversão automática com FFmpeg para MP3 a 320 kbps (HQ) ou 128 kbps.
- 📱 **Modo Mobile / PWA**: Design fluido com navegação inferior e bottom-sheet nativo.
- 💻 **Modo Notebook / Desktop**: Interface em tela cheia, atalhos rápidos e suporte a download direto para o disco rígido.
- 🎧 **Player Embutido**: Assista aos vídeos e escute músicas baixadas diretamente no app.
- 📶 **Conexão Rápida com QR Code**: O próprio sistema gera um QR Code na tela para abrir no celular no mesmo Wi-Fi.

---

## 🛠️ Como Executar no seu Notebook (Uso Local)

### Iniciar com 1 Clique
No Windows, basta dar um **duplo clique** no arquivo:
```cmd
start_server.bat
```
*(No Linux ou Mac, execute `./start_server.sh`)*

O sistema abrirá o navegador no endereço:
👉 **`http://localhost:8000`**

---

## 📱 Como Usar no Celular e Compartilhar do YouTube

1. Abra o SnapPlay no navegador do celular (escaneando o QR Code na tela do notebook ou acessando o link do seu domínio).
2. Toque em **"Instalar App"** (ou nos 3 pontinhos do Chrome e escolha **"Adicionar à Tela de Início"**).
3. Pronto! Agora vá em qualquer vídeo ou playlist no YouTube, toque em **"Compartilhar"** > selecione **SnapPlay**.
4. O SnapPlay abrirá automaticamente com a tela de seleção de vídeos e qualidades para baixar!

---

## 🌐 Como Subir em um Domínio na Nuvem

- **Render.com (Gratuito com HTTPS)**: Crie um repositório no GitHub com este projeto e use o arquivo `render.yaml` já pronto.
- **Docker / VPS**: Execute `docker compose up -d --build`.
