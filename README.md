# C3 Protect Remote — EasyPanel

Painel web do C3 Protect Remote com autenticação própria, PostgreSQL, inventário de MikroTiks, acesso SSH e WebFig pelo Gateway C3.

## Perfis de acesso

- `admin`: acesso completo, inclusive usuários e chave do gateway.
- `operator`: empresas, MikroTiks, diagnósticos, SSH e WebFig.
- `viewer`: consulta do inventário, estados e histórico, sem acesso remoto ou alterações.

O primeiro administrador é criado somente uma vez no primeiro start. Reiniciar ou fazer novo deploy não redefine sua senha.

## Variáveis do serviço no EasyPanel

Copie `.env.example` e configure:

```env
DATABASE_URL=postgres://postgres:SENHA_DO_POSTGRES@c3-protect-remote_c3-remote-db:5432/c3_remote
BOOTSTRAP_ADMIN_EMAIL=yan.nobrega@c3support.com.br
BOOTSTRAP_ADMIN_NAME=Yan Nobrega
BOOTSTRAP_ADMIN_PASSWORD=UMA_SENHA_FORTE_COM_12_OU_MAIS_CARACTERES
CREDENTIAL_ENCRYPTION_KEY=SEGREDO_ALEATORIO_DO_PAINEL
GATEWAY_API_KEY=CHAVE_ATUAL_DO_REMOTE_GATEWAY
GATEWAY_BASE_URL=https://remote.c3protect.com.br
MIGRATION_SOURCE_URL=https://access.c3protect.com.br
MIGRATION_EXPORT_TOKEN=CHAVE_TEMPORARIA_OPCIONAL
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

Nunca envie essas variáveis para o Git. A `CREDENTIAL_ENCRYPTION_KEY` cifra as credenciais das RBs; mantenha backup seguro dela. A `GATEWAY_API_KEY` permite que o novo painel use o gateway atual sem alterar o serviço que já está em produção. Quando ela não é informada, o sistema mantém compatibilidade e deriva a chave a partir da chave de criptografia.

## Deploy no EasyPanel

1. Crie um repositório privado e envie este projeto.
2. No projeto `c3-protect-remote`, crie um serviço **App** a partir do GitHub.
3. Use a branch `main`, Build Path `/` e método `Dockerfile`; o arquivo é `Dockerfile`.
4. Cole as variáveis acima na aba **Environment**.
5. Faça o primeiro deploy e confira os logs do bootstrap.
6. Adicione inicialmente um domínio temporário do EasyPanel apontando para HTTP na porta `3000`.
7. Teste `https://DOMINIO-TEMPORARIO/api/health` e o login.
8. Migre os dados do painel atual.
9. Somente depois dos testes, mova `access.c3protect.com.br` para esse serviço.

## Migração do painel anterior

Enquanto `access.c3protect.com.br` ainda aponta para o painel anterior, entre no
novo painel como administrador e abra `/migration`. O importador copia empresas,
MikroTiks, credenciais SSH e histórico de sessões, recriptografando as senhas com
a `CREDENTIAL_ENCRYPTION_KEY` do PostgreSQL. A operação é idempotente.

Se `MIGRATION_EXPORT_TOKEN` não estiver configurada, a migração temporária usa a
`GATEWAY_API_KEY` já compartilhada pelos dois serviços. Após validar os dados,
remova a rota de exportação do painel anterior e rotacione a chave do gateway.

## Verificação local

```bash
npm install
npm test
npm run build
```

O endpoint público `/api/health` verifica também a conexão com o PostgreSQL e é usado pelo `HEALTHCHECK` do container.

## Segurança implementada

- Senhas com `scrypt` e salt aleatório.
- Sessões opacas; apenas o hash SHA-256 do token fica no banco.
- Cookie HttpOnly, Secure em produção e SameSite Strict.
- Bloqueio por 15 minutos após cinco tentativas inválidas.
- Autorização por perfil validada no servidor.
- Validação de mesma origem nas operações de escrita.
- Eventos de login, cadastro, acesso e administração na auditoria.
