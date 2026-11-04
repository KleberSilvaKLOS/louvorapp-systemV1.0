# LouvorApp — Sistema Web de Gestão de Escalas, Repertório, Enquetes e Substituições

Sistema web completo, responsivo e pronto para produção em VPS, desenvolvido com fidelidade visual absoluta ao Design System original (**Dark Glassmorphic Utility** — `#0f131c` Surface, tipografia `Plus Jakarta Sans` + `Inter`, ícones `Material Symbols Outlined`).

---

## 1. Principais Características Desta Versão

- **Banco de Dados 100% Limpo (Começando do Zero)**: O sistema inicia sem usuários, escalas, históricos, trocas ou enquetes fictícias. Todo novo usuário que se cadastra começa com estatísticas e histórico zerados (`0 Escalas`, `0% Presença`, `0 Trocas`).
- **Identificação Automática de `ADMIN` pelo Backend (`ADMIN_EMAILS`)**: A tela de login não exibe botões de seleção de perfil (`ADMIN` ou `USER`). Ao informar o e-mail e senha no cadastro ou login, o backend verifica automaticamente se o e-mail consta na lista protegida `ADMIN_EMAILS` (`backend/config/env.js` / `.env`) e concede as permissões administrativas.
- **Cadastro sem Foto + Upload e Alteração de Foto de Perfil**: Todo cadastro inicia sem foto de perfil (`avatar_url = ''`). Na aba **Perfil / Configurações**, basta tocar sobre o ícone da câmera no avatar (ou em **Editar Perfil → Escolher Foto**) para enviar uma foto do celular/computador ou removê-la quando desejar.
- **Guia Passo a Passo de Primeiro Acesso**: Ao concluir o cadastro e acessar o sistema pela primeira vez, é exibido automaticamente um tutorial interativo de 4 passos explicando como usar o app. Ele também pode ser reaberto a qualquer momento em **Perfil / Configurações → Passo a Passo • Como Usar o App** ou pelo botão de ajuda (`?`) no topo.
- **Calendário Sincronizado com o Mês Atual da Máquina**: O Calendário inicializa sempre no mês, ano e dia atuais do relógio do dispositivo (`new Date()`).

---

## 2. Regras de Acesso (`ADMIN` vs `USER`) e `ADMIN_EMAILS`

No arquivo `backend/config/env.js` (e configurável via `.env` ou pela interface administrativa em `/pages/configuracoes/index.html`), existe a lista:
```js
const DEFAULT_ADMIN_EMAILS = [
  'admin1@email.com',
  'admin2@email.com',
  'lucas@igreja.org',
  'admin@louvorapp.org'
];
```
- Qualquer usuário que realizar o cadastro na tela de Onboarding com um e-mail presente em `ADMIN_EMAILS` recebe automaticamente o perfil **`ADMIN`**.
- Qualquer outro e-mail cadastrado recebe automaticamente o perfil **`USER`**.
- **Validação obrigatória no Backend**: Todas as rotas da API (`/api/*`) verificam o token de sessão no banco de dados e consultam a matriz `role_permissions` antes de executar qualquer operação.

---

## 3. Execução Local ou em Desenvolvimento

1. Extraia o arquivo ZIP e acesse a pasta do projeto:
   ```bash
   cd louvorapp-system
   cp .env.example .env
   ```
2. Inicialize o servidor:
   ```bash
   npm start
   ```
3. Acesse no navegador:
   - `http://localhost:3000`
4. Para limpar todos os dados do banco e recomeçar do zero a qualquer momento:
   ```bash
   npm run reset-db
   ```
5. Para executar a suíte de testes automatizados de ponta a ponta:
   ```bash
   npm test
   ```

---

## 4. Implantação em Produção na VPS (Domínio Próprio + HTTPS)

Na sua VPS (Ubuntu / Debian) como `root` ou com `sudo`:
```bash
sudo bash deploy/setup-vps.sh louvor.suaigreja.org
sudo certbot --nginx -d louvor.suaigreja.org
```
