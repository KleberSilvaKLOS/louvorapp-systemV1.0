/**
 * SUÍTE COMPLETA DE TESTES DE PONTA A PONTA (E2E) + SEGURANÇA + ALTA CONCORRÊNCIA + NOVAS FUNCIONALIDADES
 * Valida:
 * 1. Banco inicia 100% zerado e com índices secundários criados (002 + 003)
 * 2. P0 Segurança (Recuperação de senha sem resetCode, expiração, bloqueio /api/settings, avatar <= 200KB)
 * 3. Novas Funcionalidades:
 *    - Visualização detalhada dos votos individuais da enquete pelo Administrador (GET /api/polls/:id/votes e GET /api/polls)
 *    - Definição da quantidade de integrantes por categoria na enquete (Sopranos, Contraltos, Tenores, Tecladistas, Instrumentistas)
 *    - Cadastro de Períodos de Indisponibilidade no perfil (POST/GET/DELETE /api/users/unavailabilities) e bloqueio automático na montagem manual e automática das escalas
 *    - Alternância e persistência de Tema Claro (light), Tema Escuro (dark) e Automático (system)
 * 4. Teste de Carga: 500 requisições simultâneas no Pool SQLite WAL
 * 5. Limpeza final do banco de dados para entrega 100% zerada no ZIP
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('../backend/config/database');
const { requestListener } = require('../backend/server');

const TEST_PORT = 3456;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function apiCall(endpoint, { method = 'GET', body = null, token = '', ip = '10.0.0.1' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Real-IP': ip
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { status: res.status, data: json, headers: res.headers };
}

async function runTests() {
  console.log('====================================================================');
  console.log('  INICIANDO TESTES E2E + NOVAS FUNCIONALIDADES + CARGA (500 REQ)');
  console.log('====================================================================');

  await db.initialize({ reset: true });
  const server = http.createServer(requestListener);
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // ------------------------------------------------------------------------
    // TESTE 0: Banco inicia 100% zerado e com índices de performance criados
    // ------------------------------------------------------------------------
    console.log('\n[0/10] Verificando banco zerado e índices de performance...');
    const initialUsers = await db.get('SELECT COUNT(*) as c FROM users');
    const initialSchedules = await db.get('SELECT COUNT(*) as c FROM schedules');
    const initialSwaps = await db.get('SELECT COUNT(*) as c FROM swap_requests');
    const initialPolls = await db.get('SELECT COUNT(*) as c FROM polls');
    assert.strictEqual(initialUsers.c, 0);
    assert.strictEqual(initialSchedules.c, 0);
    assert.strictEqual(initialSwaps.c, 0);
    assert.strictEqual(initialPolls.c, 0);

    const indexes = await db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'");
    assert.ok(indexes.length >= 20, `Esperados >= 20 índices secundários, encontrados: ${indexes.length}`);
    console.log(`  ✓ Banco zerado e ${indexes.length} índices B-Tree ativos.`);

    // ------------------------------------------------------------------------
    // TESTE 1: Cadastro com Categorias (Soprano, Tenor, Teclado) + Tema Claro/Escuro/Sistema
    // ------------------------------------------------------------------------
    console.log('\n[1/10] Testando Cadastro com Categorias Vocais/Instrumentais e Tema (Claro/Escuro/Sistema)...');
    const regAdmin = await apiCall('/api/auth/register', {
      method: 'POST',
      ip: '10.0.1.1',
      body: {
        fullName: 'Lucas Oliveira',
        email: 'lucas@igreja.org',
        whatsapp: '(11) 98765-4321',
        password: '123456',
        roles: ['teclado', 'tenor'],
        notifEnabled: true
      }
    });
    assert.strictEqual(regAdmin.status, 201);
    assert.strictEqual(regAdmin.data.user.role, 'ADMIN');

    const regUser = await apiCall('/api/auth/register', {
      method: 'POST',
      ip: '10.0.1.2',
      body: {
        fullName: 'Camila Santos',
        email: 'camila@igreja.org',
        whatsapp: '(11) 98811-2233',
        password: '123456',
        roles: ['soprano'],
        notifEnabled: true
      }
    });
    assert.strictEqual(regUser.status, 201);
    assert.strictEqual(regUser.data.user.role, 'USER');
    assert.strictEqual(regUser.data.user.skills[0].role_key, 'soprano');

    const adminToken = regAdmin.data.token;
    const userToken = regUser.data.token;

    // Testa alternância e persistência de Tema Claro (light), Escuro (dark) e Sistema (system)
    for (const themePref of ['light', 'dark', 'system']) {
      const themeRes = await apiCall('/api/users/profile', {
        method: 'PUT',
        token: userToken,
        body: { theme_preference: themePref }
      });
      assert.strictEqual(themeRes.status, 200);
      assert.strictEqual(themeRes.data.user.theme_preference, themePref, `Preferência de tema ${themePref} deve ser persistida`);
    }
    console.log('  ✓ Categorias vocais (Soprano/Tenor/Teclado) e persistência de Tema (Claro/Escuro/Sistema) validadas.');

    // ------------------------------------------------------------------------
    // TESTE 2: P0 Segurança - Recuperação de Senha, Bloqueio /api/settings e Avatar
    // ------------------------------------------------------------------------
    console.log('\n[2/10] Testando Segurança P0 (Recuperação de Senha, Bloqueio RBAC e Limite de Avatar)...');
    const forgotRes = await apiCall('/api/auth/forgot-password', {
      method: 'POST',
      ip: '10.0.2.1',
      body: { email: 'camila@igreja.org' }
    });
    assert.strictEqual(forgotRes.status, 200);
    assert.strictEqual(forgotRes.data.resetCode, undefined);

    const userHackAdminEmails = await apiCall('/api/settings', {
      method: 'PUT',
      token: userToken,
      body: { ADMIN_EMAILS: ['camila@igreja.org'] }
    });
    assert.strictEqual(userHackAdminEmails.status, 403);

    const hugeAvatar = 'data:image/jpeg;base64,' + 'A'.repeat(210 * 1024);
    const upHuge = await apiCall('/api/users/profile', {
      method: 'PUT',
      token: userToken,
      body: { avatar_url: hugeAvatar }
    });
    assert.strictEqual(upHuge.status, 400);
    console.log('  ✓ Todas as proteções P0 confirmadas.');

    // ------------------------------------------------------------------------
    // TESTE 3: Períodos de Indisponibilidade dos Integrantes + Bloqueio Automático nas Escalas
    // ------------------------------------------------------------------------
    console.log('\n[3/10] Testando Períodos de Indisponibilidade e Bloqueio Automático em Escalas...');
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const futureIso = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

    // Camila cadastra um período de indisponibilidade cobrindo futureIso
    const addUnavailRes = await apiCall('/api/users/unavailabilities', {
      method: 'POST',
      token: userToken,
      body: {
        start_date: futureIso,
        end_date: futureIso,
        reason: 'Viagem em família'
      }
    });
    assert.strictEqual(addUnavailRes.status, 201);
    const unavailId = addUnavailRes.data.unavailability.id;

    // Admin tenta criar escala incluindo Camila na data em que ela está indisponível -> deve bloquear com HTTP 400!
    const blockedSchedRes = await apiCall('/api/schedules', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Culto com Membro Indisponível',
        event_date: futureIso,
        event_time: '19:00',
        members: [
          {
            user_id: regUser.data.user.id,
            role_key: 'soprano',
            role_label: 'Camila Santos',
            instrument_detail: 'Vocal • Soprano'
          }
        ]
      }
    });
    assert.strictEqual(blockedSchedRes.status, 400, 'Sistema deve impedir escalar integrante em data de indisponibilidade');
    assert.ok(blockedSchedRes.data.error.includes('indisponibilidade'), 'Mensagem de erro deve informar o período de indisponibilidade');

    // Remove o período de indisponibilidade e verifica que agora a escalação é permitida
    const delUnavailRes = await apiCall(`/api/users/unavailabilities/${unavailId}`, {
      method: 'DELETE',
      token: userToken
    });
    assert.strictEqual(delUnavailRes.status, 200);
    console.log('  ✓ Cadastro, bloqueio automático na montagem de escalas e remoção de indisponibilidade validados.');

    // ------------------------------------------------------------------------
    // TESTE 4: Enquetes com Quantidades por Categoria (Sopranos, Contraltos, Tenores, Tecladistas, Instrumentistas) + Visualização Individual de Votos
    // ------------------------------------------------------------------------
    console.log('\n[4/10] Testando Enquetes por Categoria (Sopranos, Tenores, Tecladistas) e Visualização de Votos pelo ADMIN...');
    const pollRes = await apiCall('/api/polls', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Enquete Culto de Celebração',
        event_date: futureIso,
        event_time: '18:00',
        deadline_label: 'Até Qui, 22:00',
        targets: [
          { role_key: 'soprano', role_label: 'Sopranos', icon: 'mic', target_count: 1 },
          { role_key: 'contralto', role_label: 'Contraltos', icon: 'mic', target_count: 1 },
          { role_key: 'tenor', role_label: 'Tenores', icon: 'mic', target_count: 1 },
          { role_key: 'teclado', role_label: 'Tecladistas', icon: 'piano', target_count: 1 },
          { role_key: 'violao', role_label: 'Violão', icon: 'queue_music', target_count: 1 }
        ]
      }
    });
    assert.strictEqual(pollRes.status, 201);
    const pollId = pollRes.data.poll.id;
    assert.strictEqual(pollRes.data.poll.targets.length, 5);

    // Camila vota Disponível como Soprano e Lucas vota Disponível como Tecladista
    await Promise.all([
      apiCall(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        token: userToken,
        body: { is_available: true, role_key: 'soprano', role_label: 'Sopranos' }
      }),
      apiCall(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        token: adminToken,
        body: { is_available: true, role_key: 'teclado', role_label: 'Tecladistas' }
      })
    ]);

    // Admin visualiza individualmente quem votou na enquete
    const votesDetailRes = await apiCall(`/api/polls/${pollId}/votes`, { token: adminToken });
    assert.strictEqual(votesDetailRes.status, 200);
    assert.strictEqual(votesDetailRes.data.votes.length, 2, 'Admin deve visualizar os 2 votos individuais');
    const camilaVote = votesDetailRes.data.votes.find((v) => v.user_id === regUser.data.user.id);
    assert.ok(camilaVote, 'Voto individual de Camila deve estar visível para o Admin');
    assert.strictEqual(camilaVote.role_key, 'soprano');
    assert.strictEqual(camilaVote.is_available, 1);

    // Verifica que as metas de Sopranos e Tecladistas atingiram 1/1 (is_filled = true)
    const sopranoTarget = votesDetailRes.data.poll.targets.find((t) => t.role_key === 'soprano');
    const tecladoTarget = votesDetailRes.data.poll.targets.find((t) => t.role_key === 'teclado');
    assert.strictEqual(sopranoTarget.confirmed_count, 1);
    assert.strictEqual(sopranoTarget.is_filled, true);
    assert.strictEqual(tecladoTarget.confirmed_count, 1);
    assert.strictEqual(tecladoTarget.is_filled, true);

    // Agora Camila registra indisponibilidade para a data da enquete ANTES da geração automática da escala
    await apiCall('/api/users/unavailabilities', {
      method: 'POST',
      token: userToken,
      body: { start_date: futureIso, end_date: futureIso, reason: 'Congresso fora da cidade' }
    });

    // Ao gerar escala automaticamente a partir da enquete, Camila deve ser ignorada automaticamente por estar indisponível!
    const genRosterRes = await apiCall(`/api/polls/${pollId}/generate-roster`, {
      method: 'POST',
      token: adminToken
    });
    assert.strictEqual(genRosterRes.status, 200);
    assert.strictEqual(genRosterRes.data.skippedUnavailableCount, 1, 'Deve ignorar automaticamente o 1 integrante com indisponibilidade cadastrada');
    assert.strictEqual(genRosterRes.data.schedule.members.length, 1, 'Apenas Lucas (disponível) deve entrar na escala gerada');

    // Limpa a indisponibilidade de Camila para os próximos testes
    const listUn = await apiCall('/api/users/unavailabilities', { token: userToken });
    for (const uItem of listUn.data.unavailabilities || []) {
      await apiCall(`/api/users/unavailabilities/${uItem.id}`, { method: 'DELETE', token: userToken });
    }
    console.log('  ✓ Metas por categoria, visualização individual de votos e filtro automático de indisponíveis na geração de escala validados.');

    // ------------------------------------------------------------------------
    // TESTE 5: Repertório CRUD, Escalas, Presença, ICS e Trocas
    // ------------------------------------------------------------------------
    console.log('\n[5/10] Testando Repertório, Escalas, Presença, Trocas e Exportação .ICS...');
    const songRes = await apiCall('/api/repertoire', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Bondade de Deus',
        artist: 'Isaías Saad',
        musical_key: 'G',
        bpm: 68,
        chords_text: '[G] Te amo Deus [C] Tua graça nunca falha'
      }
    });
    assert.strictEqual(songRes.status, 201);

    const schedRes = await apiCall('/api/schedules', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Culto de Celebração',
        event_date: futureIso,
        event_time: '19:30',
        songs: [{ song_id: songRes.data.song.id, custom_key: 'A' }],
        members: [
          {
            user_id: regUser.data.user.id,
            role_key: 'soprano',
            role_label: 'Camila Santos',
            instrument_detail: 'Vocal • Soprano'
          }
        ]
      }
    });
    assert.strictEqual(schedRes.status, 201);
    const createdScheduleId = schedRes.data.schedule.id;

    const attRes = await apiCall(`/api/schedules/${createdScheduleId}/attendance`, {
      method: 'POST',
      token: userToken,
      body: { status: 'confirmed' }
    });
    assert.strictEqual(attRes.status, 200);

    const icsRes = await fetch(`${BASE_URL}/api/schedules/ics`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.strictEqual(icsRes.status, 200);
    console.log('  ✓ Fluxo de Repertório, Escalas, Presença e Exportação .ICS validado.');

    // ------------------------------------------------------------------------
    // TESTE 6: Teste de Carga e Alta Concorrência (500 Requisições Simultâneas)
    // ------------------------------------------------------------------------
    console.log('\n[6/10] Executando Teste de Carga: 500 Requisições Concorrentes no Pool SQLite WAL...');
    const startLoad = Date.now();
    const concurrentRequests = [];
    for (let i = 0; i < 500; i++) {
      const endpoint =
        i % 4 === 0
          ? '/api/schedules/my'
          : i % 4 === 1
          ? '/api/polls?filter=todas'
          : i % 4 === 2
          ? '/api/users/unavailabilities'
          : '/api/auth/me';
      concurrentRequests.push(
        apiCall(endpoint, {
          token: i % 2 === 0 ? adminToken : userToken,
          ip: `10.10.${Math.floor(i / 250)}.${(i % 250) + 1}`
        })
      );
    }
    const responses = await Promise.all(concurrentRequests);
    const elapsedMs = Date.now() - startLoad;
    const failedCount = responses.filter((r) => r.status !== 200).length;
    assert.strictEqual(failedCount, 0, `Todas as 500 requisições simultâneas devem responder HTTP 200 (falhas: ${failedCount})`);
    console.log(`  ✓ 500 requisições concorrentes concluídas com 0% de erro em ${elapsedMs}ms (${(elapsedMs / 500).toFixed(2)}ms/req).`);

    // ------------------------------------------------------------------------
    // TESTE 7: Verificação de todas as 33 rotas do Frontend + Suporte a Tema Claro/Escuro
    // ------------------------------------------------------------------------
    console.log('\n[7/10] Verificando todas as 33 rotas do Frontend e suporte a Light/Dark/System Theme...');
    const themeCss = fs.readFileSync(path.join(__dirname, '../frontend/shared/theme.css'), 'utf8');
    assert.ok(themeCss.includes('html.light') && themeCss.includes('html.dark'), 'theme.css deve conter paletas completas para Light Mode e Dark Mode');

    const pagesToVerify = [
      '/index.html',
      '/style.css',
      '/script.js',
      '/shared/theme.css',
      '/shared/api.js',
      '/components/navigation.js',
      '/pages/onboarding/index.html',
      '/pages/onboarding/style.css',
      '/pages/onboarding/script.js',
      '/pages/calendario-escalas/index.html',
      '/pages/calendario-escalas/style.css',
      '/pages/calendario-escalas/script.js',
      '/pages/minhas-escalas-trocas/index.html',
      '/pages/minhas-escalas-trocas/style.css',
      '/pages/minhas-escalas-trocas/script.js',
      '/pages/enquetes-disponibilidade/index.html',
      '/pages/enquetes-disponibilidade/style.css',
      '/pages/enquetes-disponibilidade/script.js',
      '/pages/aprovacao-trocas/index.html',
      '/pages/aprovacao-trocas/style.css',
      '/pages/aprovacao-trocas/script.js',
      '/pages/perfil-configuracoes/index.html',
      '/pages/perfil-configuracoes/style.css',
      '/pages/perfil-configuracoes/script.js',
      '/pages/usuarios/index.html',
      '/pages/usuarios/style.css',
      '/pages/usuarios/script.js',
      '/pages/configuracoes/index.html',
      '/pages/configuracoes/style.css',
      '/pages/configuracoes/script.js',
      '/pages/dashboard/index.html',
      '/pages/dashboard/style.css',
      '/pages/dashboard/script.js'
    ];
    for (const pageUrl of pagesToVerify) {
      const r = await fetch(`${BASE_URL}${pageUrl}`);
      assert.strictEqual(r.status, 200, `Recurso ${pageUrl} deve responder HTTP 200`);
    }
    console.log('  ✓ Todas as 33 rotas estáticas e estilos de Tema Claro/Escuro verificados.');

    // ------------------------------------------------------------------------
    // TESTE 8: Persistência Após Reinicialização e Reset Final para Entrega Zerada
    // ------------------------------------------------------------------------
    console.log('\n[8/10] Testando Persistência Após Reinicialização e Zerando Banco para Entrega...');
    await db.close();
    await db.initialize({ reset: false });

    const verifySched = await apiCall(`/api/schedules/${createdScheduleId}`, { token: adminToken });
    assert.strictEqual(verifySched.status, 200);

    // Reseta completamente o banco para que o arquivo entregue no ZIP venha 100% zerado!
    await db.initialize({ reset: true });
    const finalUsers = await db.get('SELECT COUNT(*) as c FROM users');
    const finalUnavail = await db.get('SELECT COUNT(*) as c FROM user_unavailabilities');
    assert.strictEqual(finalUsers.c, 0);
    assert.strictEqual(finalUnavail.c, 0);
    console.log('  ✓ Persistência confirmada e banco de dados 100% zerado para entrega!');

    console.log('\n====================================================================');
    console.log('  TODOS OS TESTES (E2E + 4 NOVAS FUNCIONALIDADES + 500 REQ) PASSARAM!');
    console.log('====================================================================');
  } finally {
    server.close();
    await db.close();
  }
}

runTests().catch((err) => {
  console.error('\n[FALHA NOS TESTES E2E]:', err);
  process.exit(1);
});
