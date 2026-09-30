# Matriz de Habilidades — Qualidade

App interno da Qualidade Gocase: matriz de competências por colaborador e setor, 9-Box com histórico de avaliações e trilha de carreira (N1–N3).

Publicado no GoDeploy: https://matriz-habilidades.devgogroup.com/

## Estrutura

- `src/server.ts` — Worker (entrypoint) com a API REST e o banco SQLite (`env.DB`)
- `assets/index.html` — frontend (página única)

## API

| Rota | Métodos |
|---|---|
| `/api/colaboradores` | GET, POST, PUT `/:id`, DELETE `/:id` |
| `/api/setores` | GET, POST, PUT `/:id`, DELETE `/:id` |
| `/api/competencias` | GET, POST, PUT `/:id`, DELETE `/:id` |
| `/api/notas` | GET, POST |
| `/api/9box` | GET, POST |
| `/api/9box/historico/:id` | GET (por colaborador), DELETE (por registro) |
| `/api/niveis` | GET, POST, PUT `/:id`, DELETE `/:id` |
| `/api/itens-trilha` | GET, POST, PUT `/:id`, DELETE `/:id` |
