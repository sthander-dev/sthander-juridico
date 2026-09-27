# Segurança da autenticação

- Senhas nunca são armazenadas em texto simples.
- O cadastro local usa `scrypt` com salt aleatório exclusivo por usuário.
- O usuário master deverá configurar TOTP no primeiro acesso real.
- O segredo TOTP e os códigos de recuperação serão criptografados no servidor.
- Cookies de sessão deverão usar `HttpOnly`, `Secure` e `SameSite=Strict`.
- O servidor aplicará limite de tentativas e bloqueio temporário.
- A interface nunca receberá hash, segredo TOTP ou permissões desnecessárias.
- Todas as alterações de usuários e permissões serão registradas em auditoria.
- `server/data/users.json` é provisório para desenvolvimento e não será publicado.
- Antes da produção, os usuários serão migrados para banco com criptografia e backup.

