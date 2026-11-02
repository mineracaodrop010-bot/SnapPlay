# 📱 Guia do Aplicativo Mobile SnapPlay

Você tem **duas formas** de usar o SnapPlay no seu celular:

---

### Método 1: PWA (Progressive Web App) - ⚡ Mais Rápido & Sem Instalar SDK

O SnapPlay já vem totalmente configurado como um PWA nativo:
1. No seu celular, acerte o endereço do servidor (ex: `http://192.168.1.210:8000` ou seu domínio na nuvem `https://seu-app.onrender.com`).
2. No navegador (Google Chrome ou Samsung Internet), você verá o botão **"Instalar App"** ou toque nos **3 pontinhos** do navegador e escolha **"Adicionar à Tela de Início"**.
3. O aplicativo será instalado no seu celular com o ícone próprio do SnapPlay, iniciando em tela cheia, sem barra de navegação, com desempenho idêntico a um APK nativo!

---

### Método 2: Gerando um APK Android Nativo

Se preferir compilar um arquivo `.apk` tradicional:

#### Opção A: Usando o Bubblewrap (Transforma em APK em 1 minuto)
1. Instale a ferramenta oficial do Google:
   ```bash
   npm install -g @bubblewrap/cli
   ```
2. Gere o APK apontando para o seu domínio:
   ```bash
   bubblewrap init --manifest="https://seu-dominio.com/manifest.json"
   bubblewrap build
   ```
3. O arquivo `app-release.apk` será gerado pronto para instalar em qualquer Android!

#### Opção B: Usando Android Studio
1. Crie um novo projeto "Empty Activity" no Android Studio.
2. Substitua o `MainActivity.java` pelo arquivo `android/MainActivity.java`.
3. Substitua o `AndroidManifest.xml` pelo arquivo `android/AndroidManifest.xml`.
4. Altere a variável `APP_URL` no `MainActivity.java` para o seu domínio ou IP.
5. Clique em **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
