import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FileLock2,
  KeyRound,
  LockKeyhole,
  Scale,
  ShieldCheck
} from "lucide-react";

type Step = "credentials" | "verification" | "success";

const initialDigits = ["", "", "", "", "", ""];

export function App() {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [digits, setDigits] = useState(initialDigits);
  const [error, setError] = useState("");
  const code = useMemo(() => digits.join(""), [digits]);

  function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Informe seu usuário ou e-mail e sua senha para continuar.");
      return;
    }
    if (email.trim().length < 3) {
      setError("Informe um usuário ou e-mail válido.");
      return;
    }
    setStep("verification");
  }

  function updateDigit(index: number, value: string) {
    const sanitized = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((digit, position) => position === index ? sanitized : digit));
    setError("");
    if (sanitized && index < 5) {
      document.getElementById(`digit-${index + 1}`)?.focus();
    }
  }

  function submitVerification(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Digite os seis números do código de verificação.");
      return;
    }
    setError("");
    setStep("success");
  }

  function reset() {
    setStep("credentials");
    setDigits(initialDigits);
    setPassword("");
    setError("");
  }

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="Apresentação do Sthander Jurídico">
        <div className="brand-top">
          <div className="brand-mark" aria-hidden="true"><Scale size={25} strokeWidth={1.8} /></div>
          <div>
            <strong>Sthander</strong>
            <span>Jurídico</span>
          </div>
        </div>

        <div className="brand-message">
          <p className="eyebrow">Gestão jurídica segura</p>
          <h1>Seu escritório organizado, protegido e sempre atualizado.</h1>
          <p className="lead">
            Clientes, documentos e processos em um único ambiente, com rastreabilidade e privacidade desde o primeiro acesso.
          </p>
          <div className="trust-list">
            <div><ShieldCheck size={21} /><span>Autenticação em duas etapas</span></div>
            <div><FileLock2 size={21} /><span>Documentos privados e protegidos</span></div>
            <div><Check size={21} /><span>Histórico completo de acessos</span></div>
          </div>
        </div>

        <p className="brand-footer">Ambiente exclusivo para usuários autorizados.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {step === "credentials" && (
            <>
              <div className="mobile-brand">
                <div className="brand-mark"><Scale size={22} /></div>
                <strong>Sthander <span>Jurídico</span></strong>
              </div>
              <div className="card-heading">
                <span className="icon-box"><LockKeyhole size={22} /></span>
                <p className="eyebrow">Acesso seguro</p>
                <h2>Bem-vindo de volta</h2>
                <p>Entre com os dados fornecidos pelo administrador do seu escritório.</p>
              </div>

              <form onSubmit={submitCredentials} noValidate>
                <label htmlFor="email">Usuário ou e-mail profissional</label>
                <input
                  id="email"
                  type="text"
                  autoComplete="username"
                  placeholder="seu usuário ou e-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-describedby={error ? "form-error" : undefined}
                />

                <div className="password-label">
                  <label htmlFor="password">Senha</label>
                  <button type="button" className="text-button">Esqueci minha senha</button>
                </div>
                <div className="password-field">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={error ? "form-error" : undefined}
                  />
                  <button
                    type="button"
                    className="show-password"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(event) => setRememberDevice(event.target.checked)}
                  />
                  <span>Confiar neste dispositivo por 7 dias</span>
                </label>

                {error && <p className="error-message" id="form-error" role="alert">{error}</p>}
                <button className="primary-button" type="submit">Entrar com segurança</button>
              </form>

              <div className="security-note">
                <ShieldCheck size={18} />
                <p>Nunca solicitaremos sua senha ou código de verificação por telefone ou WhatsApp.</p>
              </div>
            </>
          )}

          {step === "verification" && (
            <>
              <button type="button" className="back-button" onClick={reset}><ArrowLeft size={18} /> Voltar</button>
              <div className="card-heading verification-heading">
                <span className="icon-box"><KeyRound size={22} /></span>
                <p className="eyebrow">Segunda etapa</p>
                <h2>Confirme que é você</h2>
                <p>Digite o código exibido no seu aplicativo autenticador.</p>
                <span className="account-chip">{email}</span>
              </div>
              <form onSubmit={submitVerification}>
                <div className="code-inputs" aria-label="Código de verificação">
                  {digits.map((digit, index) => (
                    <input
                      key={index}
                      id={`digit-${index}`}
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(event) => updateDigit(index, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Backspace" && !digit && index > 0) {
                          document.getElementById(`digit-${index - 1}`)?.focus();
                        }
                      }}
                      aria-label={`Dígito ${index + 1}`}
                    />
                  ))}
                </div>
                {error && <p className="error-message" role="alert">{error}</p>}
                <button className="primary-button" type="submit">Verificar e acessar</button>
                <button className="secondary-button" type="button">Usar um código de recuperação</button>
              </form>
              <div className="security-note">
                <ShieldCheck size={18} />
                <p>O código expira rapidamente e só pode ser usado uma vez.</p>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="success-state">
              <span className="success-icon"><ShieldCheck size={34} /></span>
              <p className="eyebrow">Identidade confirmada</p>
              <h2>Acesso autorizado</h2>
              <p>A autenticação foi concluída. Na integração real, você será encaminhado ao painel do escritório.</p>
              <button className="primary-button" type="button" onClick={reset}>Voltar à demonstração</button>
            </div>
          )}

          <p className="legal-line">
            Ao entrar, você concorda com os termos de uso e a política de privacidade.
          </p>
        </div>
      </section>
    </main>
  );
}
