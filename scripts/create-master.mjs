import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const password = process.env.MASTER_PASSWORD;
if (!password || password.length < 12) {
  throw new Error("Defina MASTER_PASSWORD com pelo menos 12 caracteres.");
}

const salt = randomBytes(32);
const hash = scryptSync(password, salt, 64, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024
});
const output = resolve("server/data/users.json");
mkdirSync(dirname(output), { recursive: true });

const user = {
  id: crypto.randomUUID(),
  username: "sthander",
  displayName: "Administrador Master",
  role: "MASTER",
  status: "ACTIVE",
  password: {
    algorithm: "scrypt",
    parameters: { N: 32768, r: 8, p: 1, keyLength: 64 },
    salt: salt.toString("base64"),
    hash: hash.toString("base64")
  },
  mfa: {
    required: true,
    configured: false,
    secret: null,
    recoveryCodesHash: []
  },
  security: {
    failedAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date().toISOString(),
    mustChangePassword: false
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

writeFileSync(output, `${JSON.stringify({ users: [user] }, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600
});

console.log("Usuário master criado com senha protegida e MFA obrigatório no primeiro acesso.");
