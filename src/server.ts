export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

    // ── tabelas originais ──────────────────────────────────────────────────────
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS colaboradores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cargo TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`, []);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS setores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`, []);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS competencias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativa INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`, []);

    const compCols = await env.DB.query(`PRAGMA table_info(competencias)`, []);
    if (!compCols.rows.some((r: any) => r.name === "setor_id")) {
      try { await env.DB.exec(`ALTER TABLE competencias ADD COLUMN setor_id INTEGER`, []); } catch (e) {}
    }
    if (!compCols.rows.some((r: any) => r.name === "eh_diferencial")) {
      try { await env.DB.exec(`ALTER TABLE competencias ADD COLUMN eh_diferencial INTEGER DEFAULT 0`, []); } catch (e) {}
    }

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS notas (id INTEGER PRIMARY KEY AUTOINCREMENT, colaborador_id INTEGER NOT NULL, competencia_id INTEGER NOT NULL, nota INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')), UNIQUE(colaborador_id, competencia_id))`, []);

    // ── 9-Box: tabela legada (manter compatibilidade) + histórico ─────────────
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS posicao_9box (id INTEGER PRIMARY KEY AUTOINCREMENT, colaborador_id INTEGER NOT NULL UNIQUE, eixo_x INTEGER NOT NULL DEFAULT 2, eixo_y INTEGER NOT NULL DEFAULT 2, observacao TEXT, updated_at TEXT DEFAULT (datetime('now')))`, []);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS historico_9box (id INTEGER PRIMARY KEY AUTOINCREMENT, colaborador_id INTEGER NOT NULL, eixo_x INTEGER NOT NULL, eixo_y INTEGER NOT NULL, observacao TEXT, avaliado_em TEXT DEFAULT (datetime('now')))`, []);

    // Rota para limpar itens duplicados da trilha
    if (url.pathname === "/api/itens-trilha/limpar-duplicatas" && request.method === "POST") {
      // Mantém só o item de menor id para cada (nivel_id, categoria, descricao)
      await env.DB.exec(`DELETE FROM itens_trilha WHERE id NOT IN (SELECT MIN(id) FROM itens_trilha GROUP BY nivel_id, categoria, descricao)`, []);
      return json({ ok: true });
    }

    // ── Trilha de Carreira ─────────────────────────────────────────────────────
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS niveis_carreira (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, titulo TEXT NOT NULL, descricao TEXT, ordem INTEGER DEFAULT 0)`, []);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS itens_trilha (id INTEGER PRIMARY KEY AUTOINCREMENT, nivel_id INTEGER NOT NULL, categoria TEXT NOT NULL DEFAULT 'Responsabilidades', descricao TEXT NOT NULL, ordem INTEGER DEFAULT 0)`, []);

    // seeds
    const countSetor = await env.DB.query(`SELECT COUNT(*) as n FROM setores`, []);
    if ((countSetor.rows[0] as any).n === 0) {
      for (const [i, nome] of ["UV","Térmicos","Têxtil","Logística","Fechamento","Almoxarifado","DTF-UV"].entries())
        await env.DB.exec(`INSERT INTO setores (nome, ordem) VALUES (?,?)`, [nome, i]);
    }

    const countComp = await env.DB.query(`SELECT COUNT(*) as n FROM competencias`, []);
    if ((countComp.rows[0] as any).n === 0) {
      for (const [i, nome] of ["Leitura de Desenho Técnico","Uso de Instrumentos de Medição","Controle Estatístico de Processo (CEP)","Auditoria 5S","Auditoria de Processo/Produto","Normas ISO 9001","Elaboração de FMEA","Análise de Não Conformidades (8D/Ishikawa)","Calibração de Instrumentos","Ferramentas de Qualidade (Excel/Minitab)"].entries())
        await env.DB.exec(`INSERT INTO competencias (nome, ordem) VALUES (?,?)`, [nome, i]);
    }

        // Seed da trilha — só roda se banco vazio
    const countNiveis = await env.DB.query(`SELECT COUNT(*) as n FROM niveis_carreira`, []);
    if ((countNiveis.rows[0] as any).n === 0) {
      await env.DB.exec(`INSERT INTO niveis_carreira (codigo,titulo,descricao,ordem) VALUES (?,?,?,?)`,
        ["N1","Auxiliar de Qualidade N1","Profissional em fase de aprendizado. Executa inspeções básicas com supervisão próxima e segue os padrões estabelecidos.",0]);
      await env.DB.exec(`INSERT INTO niveis_carreira (codigo,titulo,descricao,ordem) VALUES (?,?,?,?)`,
        ["N2","Auxiliar de Qualidade N2","Profissional com domínio das rotinas de inspeção. Atua com autonomia nas atividades do setor e apoia o time na identificação de desvios.",1]);
      await env.DB.exec(`INSERT INTO niveis_carreira (codigo,titulo,descricao,ordem) VALUES (?,?,?,?)`,
        ["N3","Auxiliar de Qualidade N3","Referência técnica do setor. Domina os processos, treina os colegas e lidera a resolução de problemas no chão de fábrica.",2]);
      const niveisRows = await env.DB.query(`SELECT id, codigo FROM niveis_carreira`, []);
      const idMap: Record<string, number> = {};
      (niveisRows.rows as any[]).forEach((r: any) => { idMap[r.codigo] = r.id; });
      const itens: {c:string;cat:string;d:string}[] = [
        {c:"N1",cat:"Atividades do dia a dia",d:"Realizar inspeção visual de produtos nas linhas de produção (UV, DTF, Térmicos, Têxtil) conforme padrão e gabarito definidos"},
        {c:"N1",cat:"Atividades do dia a dia",d:"Separar e identificar produtos não conformes (NC) e encaminhar para área de retrabalho ou refugo conforme procedimento"},
        {c:"N1",cat:"Atividades do dia a dia",d:"Preencher formulários de controle de qualidade (registros de NC, contagem de defeitos, planilhas de turno)"},
        {c:"N1",cat:"Atividades do dia a dia",d:"Apoiar na realização de auditoria 5S no setor sob orientação do líder ou N3"},
        {c:"N1",cat:"Atividades do dia a dia",d:"Monitorar o início da produção (setup) para verificar se o produto atende ao padrão antes de liberar o lote"},
        {c:"N1",cat:"Conhecimentos necessários",d:"Conhecer os tipos de defeito do seu setor e os critérios de aceitação"},
        {c:"N1",cat:"Conhecimentos necessários",d:"Entender o fluxo do processo produtivo do setor onde atua (entrada → processo → saída)"},
        {c:"N1",cat:"Conhecimentos necessários",d:"Saber usar os instrumentos básicos de medição do setor (régua, trena, gabarito de cor, lupa) com apoio"},
        {c:"N1",cat:"Conhecimentos necessários",d:"Conhecer o significado de NC, retrabalho, refugo e liberação de lote"},
        {c:"N1",cat:"Comportamentos esperados",d:"Comunicar imediatamente ao líder qualquer desvio ou dúvida identificada durante a inspeção"},
        {c:"N1",cat:"Comportamentos esperados",d:"Seguir rigorosamente os procedimentos e padrões de qualidade sem improvisar"},
        {c:"N1",cat:"Comportamentos esperados",d:"Demonstrar atenção e capricho na inspeção, sem se deixar pressionar pelo volume a liberar produtos com defeito"},
        {c:"N2",cat:"Atividades do dia a dia",d:"Realizar inspeção em diferentes setores com autonomia, sem necessidade de supervisão constante"},
        {c:"N2",cat:"Atividades do dia a dia",d:"Realizar auditoria de processo: verificar parâmetros (temperatura, pressão, tempo, velocidade)"},
        {c:"N2",cat:"Atividades do dia a dia",d:"Registrar e classificar as não conformidades com descrição detalhada do defeito, quantidade, lote e possível causa"},
        {c:"N2",cat:"Atividades do dia a dia",d:"Executar o check list de início de turno (liberação de máquina) e assinar a liberação de produção"},
        {c:"N2",cat:"Atividades do dia a dia",d:"Identificar quando um problema é recorrente e comunicar ao supervisor com evidências (fotos, registros, lote afetado)"},
        {c:"N2",cat:"Conhecimentos necessários",d:"Conhecer os parâmetros de processo de pelo menos dois setores"},
        {c:"N2",cat:"Conhecimentos necessários",d:"Entender a diferença entre defeito crítico, maior e menor e aplicar os critérios de aceitação/rejeição"},
        {c:"N2",cat:"Conhecimentos necessários",d:"Conhecer o processo de rastreabilidade do produto (como identificar e localizar um lote com problema)"},
        {c:"N2",cat:"Conhecimentos necessários",d:"Entender o que é um indicador de qualidade e como os dados de inspeção alimentam os resultados do setor"},
        {c:"N2",cat:"Comportamentos esperados",d:"Questionar e bloquear lotes com defeito mesmo sob pressão da produção, reportando ao supervisor"},
        {c:"N2",cat:"Comportamentos esperados",d:"Ser proativo em identificar tendências de defeito antes que o problema escale"},
        {c:"N2",cat:"Comportamentos esperados",d:"Registrar todas as ocorrências com rigor e clareza, sem omitir informações"},
        {c:"N3",cat:"Atividades do dia a dia",d:"Liderar a análise de causa raiz de não conformidades recorrentes usando 5 Porquês e Ishikawa"},
        {c:"N3",cat:"Atividades do dia a dia",d:"Treinar e orientar os auxiliares N1 e N2 nos padrões de inspeção e uso de instrumentos"},
        {c:"N3",cat:"Atividades do dia a dia",d:"Realizar auditoria de produto acabado e emitir relatório de liberação ou bloqueio do lote para expedição"},
        {c:"N3",cat:"Atividades do dia a dia",d:"Consolidar os dados de qualidade do turno e apresentar os principais desvios na passagem de turno"},
        {c:"N3",cat:"Atividades do dia a dia",d:"Acompanhar a eficácia das ações corretivas implementadas e reportar se o defeito voltou a ocorrer"},
        {c:"N3",cat:"Conhecimentos necessários",d:"Dominar os critérios de aceitação e defeitos de todos os setores (UV, DTF, Térmicos, Têxtil, Expedição)"},
        {c:"N3",cat:"Conhecimentos necessários",d:"Conhecer e aplicar a metodologia dos 5 Porquês para investigação de causa raiz"},
        {c:"N3",cat:"Conhecimentos necessários",d:"Saber ler e interpretar os indicadores de qualidade do setor e propor melhorias"},
        {c:"N3",cat:"Comportamentos esperados",d:"Ser a referência do turno em qualidade: colegas e produção procuram o N3 quando há dúvida sobre liberar ou bloquear"},
        {c:"N3",cat:"Comportamentos esperados",d:"Tomar decisões de bloqueio de lote com segurança e embasamento, comunicando com clareza"},
        {c:"N3",cat:"Comportamentos esperados",d:"Puxar o time para a melhoria contínua: não aceitar 'sempre foi assim' como resposta para defeitos recorrentes"},
      ];
      for (const [i, it] of itens.entries())
        await env.DB.exec(`INSERT INTO itens_trilha (nivel_id,categoria,descricao,ordem) VALUES (?,?,?,?)`,
          [idMap[it.c], it.cat, it.d, i]);
    }
    

        // ── CRUD colaboradores ─────────────────────────────────────────────────────
    if (url.pathname === "/api/colaboradores" && request.method === "GET") {
      return json((await env.DB.query(`SELECT * FROM colaboradores WHERE ativo=1 ORDER BY ordem, nome`, [])).rows);
    }
    if (url.pathname === "/api/colaboradores" && request.method === "POST") {
      const b = await request.json() as any;
      if (!b.nome?.trim()) return json({ error: "Nome é obrigatório" }, 400);
      await env.DB.exec(`INSERT INTO colaboradores (nome, cargo) VALUES (?,?)`, [b.nome.trim(), b.cargo?.trim() || null]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/colaboradores/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const b = await request.json() as any;
      await env.DB.exec(`UPDATE colaboradores SET nome=?, cargo=? WHERE id=?`, [b.nome?.trim(), b.cargo?.trim() || null, id]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/colaboradores/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.exec(`UPDATE colaboradores SET ativo=0 WHERE id=?`, [id]);
      return json({ ok: true });
    }

    // ── CRUD setores ───────────────────────────────────────────────────────────
    if (url.pathname === "/api/setores" && request.method === "GET") {
      return json((await env.DB.query(`SELECT * FROM setores WHERE ativo=1 ORDER BY ordem, nome`, [])).rows);
    }
    if (url.pathname === "/api/setores" && request.method === "POST") {
      const b = await request.json() as any;
      if (!b.nome?.trim()) return json({ error: "Nome é obrigatório" }, 400);
      await env.DB.exec(`INSERT INTO setores (nome) VALUES (?)`, [b.nome.trim()]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/setores/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const b = await request.json() as any;
      if (!b.nome?.trim()) return json({ error: "Nome é obrigatório" }, 400);
      await env.DB.exec(`UPDATE setores SET nome=? WHERE id=?`, [b.nome.trim(), id]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/setores/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.exec(`UPDATE setores SET ativo=0 WHERE id=?`, [id]);
      await env.DB.exec(`UPDATE competencias SET setor_id=NULL WHERE setor_id=?`, [id]);
      return json({ ok: true });
    }

    // ── CRUD competencias ──────────────────────────────────────────────────────
    if (url.pathname === "/api/competencias" && request.method === "GET") {
      return json((await env.DB.query(`SELECT c.*, s.nome as setor_nome FROM competencias c LEFT JOIN setores s ON s.id = c.setor_id WHERE c.ativa=1 ORDER BY c.ordem, c.nome`, [])).rows);
    }
    if (url.pathname === "/api/competencias" && request.method === "POST") {
      const b = await request.json() as any;
      if (!b.nome?.trim()) return json({ error: "Nome é obrigatório" }, 400);
      await env.DB.exec(`INSERT INTO competencias (nome, setor_id, eh_diferencial) VALUES (?,?,?)`, [b.nome.trim(), b.setor_id || null, b.eh_diferencial ? 1 : 0]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/competencias/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const b = await request.json() as any;
      if (!b.nome?.trim()) return json({ error: "Nome é obrigatório" }, 400);
      await env.DB.exec(`UPDATE competencias SET nome=?, setor_id=?, eh_diferencial=? WHERE id=?`, [b.nome.trim(), b.setor_id || null, b.eh_diferencial ? 1 : 0, id]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/competencias/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.exec(`UPDATE competencias SET ativa=0 WHERE id=?`, [id]);
      return json({ ok: true });
    }

    // ── notas ──────────────────────────────────────────────────────────────────
    if (url.pathname === "/api/notas" && request.method === "GET") {
      return json((await env.DB.query(`SELECT colaborador_id, competencia_id, nota FROM notas`, [])).rows);
    }
    if (url.pathname === "/api/notas" && request.method === "POST") {
      const b = await request.json() as any;
      await env.DB.exec(`INSERT INTO notas (colaborador_id, competencia_id, nota, updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(colaborador_id, competencia_id) DO UPDATE SET nota=excluded.nota, updated_at=datetime('now')`, [b.colaborador_id, b.competencia_id, b.nota]);
      return json({ ok: true });
    }

    // ── 9-Box: posição atual (legado, para o grid) ─────────────────────────────
    if (url.pathname === "/api/9box" && request.method === "GET") {
      return json((await env.DB.query(`SELECT * FROM posicao_9box`, [])).rows);
    }
    if (url.pathname === "/api/9box" && request.method === "POST") {
      const b = await request.json() as any;
      // Atualiza posição atual
      await env.DB.exec(`INSERT INTO posicao_9box (colaborador_id, eixo_x, eixo_y, observacao, updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(colaborador_id) DO UPDATE SET eixo_x=excluded.eixo_x, eixo_y=excluded.eixo_y, observacao=excluded.observacao, updated_at=datetime('now')`, [b.colaborador_id, b.eixo_x, b.eixo_y, b.observacao || null]);
      // Grava no histórico
      await env.DB.exec(`INSERT INTO historico_9box (colaborador_id, eixo_x, eixo_y, observacao, avaliado_em) VALUES (?,?,?,?,datetime('now'))`, [b.colaborador_id, b.eixo_x, b.eixo_y, b.observacao || null]);
      return json({ ok: true });
    }

    // ── 9-Box: histórico por colaborador ───────────────────────────────────────
    if (url.pathname.startsWith("/api/9box/historico/") && request.method === "GET") {
      const colabId = url.pathname.split("/").pop();
      return json((await env.DB.query(`SELECT * FROM historico_9box WHERE colaborador_id=? ORDER BY avaliado_em DESC`, [colabId])).rows);
    }
    if (url.pathname.startsWith("/api/9box/historico/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.exec(`DELETE FROM historico_9box WHERE id=?`, [id]);
      return json({ ok: true });
    }

    // Rota para limpar itens duplicados da trilha
    if (url.pathname === "/api/itens-trilha/limpar-duplicatas" && request.method === "POST") {
      // Mantém só o item de menor id para cada (nivel_id, categoria, descricao)
      await env.DB.exec(`DELETE FROM itens_trilha WHERE id NOT IN (SELECT MIN(id) FROM itens_trilha GROUP BY nivel_id, categoria, descricao)`, []);
      return json({ ok: true });
    }

    // ── Trilha de Carreira ─────────────────────────────────────────────────────
    if (url.pathname === "/api/niveis" && request.method === "GET") {
      return json((await env.DB.query(`SELECT * FROM niveis_carreira ORDER BY ordem`, [])).rows);
    }
    if (url.pathname === "/api/niveis" && request.method === "POST") {
      const b = await request.json() as any;
      if (!b.codigo?.trim() || !b.titulo?.trim()) return json({ error: "Código e título são obrigatórios" }, 400);
      const maxOrdem = await env.DB.query(`SELECT COALESCE(MAX(ordem),0)+1 as o FROM niveis_carreira`, []);
      await env.DB.exec(`INSERT OR IGNORE INTO niveis_carreira (codigo,titulo,descricao,ordem) VALUES (?,?,?,?)`, [b.codigo.trim(), b.titulo.trim(), b.descricao?.trim() || null, (maxOrdem.rows[0] as any).o]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/niveis/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const b = await request.json() as any;
      if (!b.codigo?.trim() || !b.titulo?.trim()) return json({ error: "Código e título são obrigatórios" }, 400);
      await env.DB.exec(`UPDATE niveis_carreira SET codigo=?, titulo=?, descricao=? WHERE id=?`, [b.codigo.trim(), b.titulo.trim(), b.descricao?.trim() || null, id]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/niveis/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.exec(`DELETE FROM itens_trilha WHERE nivel_id=?`, [id]);
      await env.DB.exec(`DELETE FROM niveis_carreira WHERE id=?`, [id]);
      return json({ ok: true });
    }
    if (url.pathname === "/api/itens-trilha" && request.method === "GET") {
      return json((await env.DB.query(`SELECT * FROM itens_trilha ORDER BY nivel_id, ordem`, [])).rows);
    }
    if (url.pathname === "/api/itens-trilha" && request.method === "POST") {
      const b = await request.json() as any;
      if (!b.nivel_id || !b.descricao?.trim()) return json({ error: "nivel_id e descricao são obrigatórios" }, 400);
      const maxOrdem = await env.DB.query(`SELECT COALESCE(MAX(ordem),0)+1 as o FROM itens_trilha WHERE nivel_id=?`, [b.nivel_id]);
      await env.DB.exec(`INSERT INTO itens_trilha (nivel_id,categoria,descricao,ordem) VALUES (?,?,?,?)`, [b.nivel_id, b.categoria?.trim() || "Responsabilidades", b.descricao.trim(), (maxOrdem.rows[0] as any).o]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/itens-trilha/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const b = await request.json() as any;
      await env.DB.exec(`UPDATE itens_trilha SET categoria=?, descricao=? WHERE id=?`, [b.categoria?.trim() || "Responsabilidades", b.descricao?.trim(), id]);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/itens-trilha/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.exec(`DELETE FROM itens_trilha WHERE id=?`, [id]);
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
};
