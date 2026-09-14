# 40 — Backup semanal do banco e dos anexos (I-24 / I-25)

## Problema identificado

- **I-24 (Alto):** o Supabase free não tem backup automático nem PITR, e não havia nenhum dump agendado. Perder o projeto é perder notas, matrículas e chamadas.
- **I-25 (Alto):** o bucket `medical-certificates` (PDFs de atestados) não tinha cópia. Os registros em `medical_certificate_attachments` ficariam órfãos.

Análise 2026-09, `03-banco-infra-devops.md`, seção 5.

## Objetivo

Um backup semanal automático e de custo zero, com restore documentado e testado.

## Arquivos alterados

- `.github/workflows/backup.yml` (novo)
- `backend/scripts/backup_storage.py` (novo)
- `backend/tests/test_backup_storage.py` (novo)
- `DEPLOY.md`: seção **Backup** (secrets e restore)

## Alterações realizadas

- **Workflow `backup.yml`:** toda segunda às 03:00 de Brasília, e sob demanda. Passos:
  1. Confere os 4 secrets e falha com o nome do que faltar.
  2. `supabase db dump`, em três arquivos: roles, schema e dados (`--data-only --use-copy`).
  3. Baixa o bucket com o script novo.
  4. Empacota (`tar.gz`) e **criptografa** (gpg AES256).
  5. Sobe como artifact com retenção de 90 dias.
- **`backup_storage.py`:**
  - `baixar` percorre o bucket recursivamente, paginando de 1000 em 1000, e grava na pasta;
  - `enviar` faz o caminho inverso, para o restore, com `upsert`;
  - recusa caminho que escape da pasta de destino.
- **`DEPLOY.md`:** os secrets a cadastrar, com a string do *session pooler*, e o restore em 5 passos: baixar, decifrar, `psql` com `session_replication_role = replica`, reenviar os anexos e trocar as chaves.

## Motivo técnico

- **Criptografia, que o plano não previa:** o repositório é **público**, e artifact de repo público pode ser baixado por qualquer conta do GitHub. O `pg_dump | gzip` do plano publicaria dados de alunos, notas, atestados e os hashes de senha do `auth`. A senha entra no gpg por arquivo (process substitution), não pela linha de comando.
- **`supabase db dump` em vez de `pg_dump` puro:**
  - separa roles, schema e dados do jeito que o guia oficial do Supabase restaura num projeto novo, sem colidir com os schemas que o Supabase já cria (`auth`, `storage`...);
  - roda o `pg_dump` num contêiner da mesma versão do servidor, o que evita o erro de `pg_dump` mais velho que o banco (o runner vem com o cliente 16; o Supabase é 17).
- **Session pooler:** a conexão direta do Supabase só tem IPv6, e os runners do GitHub não têm IPv6.
- **Anexos via service role + script**, e não `supabase storage cp`: o `cp` exige `supabase link` com um *access token* pessoal, que dá acesso à conta inteira. A service role já existe e se limita ao projeto.

## Impactos positivos

- Existe, pela primeira vez, uma cópia do banco e dos PDFs fora do projeto Supabase.
- O restore está escrito e foi ensaiado.

## Testes executados

- **Dump e restore ponta a ponta, local:**
  - banco de origem: `postgres:17` com o stub do CI e as migrações 0001–0012 (`apply_migration.py --all`);
  - os três `supabase db dump` do workflow rodados contra ele (CLI 2.100);
  - restore num segundo `postgres:17` com o stub, pelo comando `psql` do `DEPLOY.md`;
  - comparação entre os dois bancos.
- **Cifragem:** a mesma linha `tar | gpg` do workflow, no bash, com senha contendo espaço. Fiz a ida e a volta, com `diff -r` entre o original e o restaurado, e tentei abrir com uma senha errada.
- **pytest `test_backup_storage.py`** (3 casos): ida e volta preservando pastas e bytes, paginação e recusa de `../`.
- Suíte completa do backend.

## Resultado dos testes

✅ **Passou**:
- **Restore:** exit 0; 12 tabelas, 33 policies e 7 triggers iguais nos dois bancos; linhas de `schema_migrations` (13) e `storage.buckets` (1) iguais.
- **gpg:** roundtrip idêntico; senha errada recusada.
- **pytest:** 3/3 novos; suíte completa verde.

## Observações

- ⏳ **Ainda não rodou contra o Supabase real.** O projeto está pausado e o repositório não tem nenhum secret. Depois do restore do Supabase:
  1. cadastrar `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `BACKUP_PASSPHRASE`;
  2. rodar o workflow à mão;
  3. conferir o artifact;
  4. de preferência, ensaiar o restore num projeto descartável.

  Até lá, o cron semanal falha no primeiro passo, com e-mail do GitHub.
- A `BACKUP_PASSPHRASE` precisa ficar guardada **fora** do GitHub; sem ela, nenhum backup abre.
- O ensaio local teve dados só nas tabelas de controle. As tabelas de domínio saem no mesmo `COPY` e, com o `session_replication_role = replica`, a ordem de FK não importa.
- A retenção é de 90 dias e só no GitHub. Se perder a conta ou o repositório pesar, o próximo passo é uma cópia fora dele (Drive ou S3), anotada no próprio workflow.
- O GitHub desativa `schedule` em repo público após 60 dias sem commit, igual ao keep-alive.
